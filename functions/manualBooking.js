/**
 * Manual (admin) bookings: a client who books through staff instead of the app, paying offline.
 *
 * Mirrors the app's booking transaction (threereps_user/functions/bookingEngine/reconciliation.js
 * executeFinalizerTransaction): sequential counters/bookings reference, one booking doc, one permanent
 * slot lock + one session doc per session date, all in ONE transaction so a slot can never be double-booked.
 * Pricing/schedule/GST use the engine's own pricingResolver (copied verbatim).
 *
 * Differences: no Razorpay (paymentSnapshot.gateway = "offline"), bookingSource = "admin_manual",
 * and an offline-payment ledger entry + audit log are written.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { writeAuditLog } = require("./auditLogger");
const { slotLockKey, isSameSlotHour } = require("./slotKey");
const {
  resolveBookingPricing,
  resolveGstPercentage,
  applyGst,
} = require("./bookingEngine/pricingResolver");

let validateAdmin;
let requireRole;
exports.init = (deps) => {
  validateAdmin = deps.validateAdmin;
  requireRole = deps.requireRole;
};

const ROLES = ["admin", "ops"]; // superadmin always passes requireRole
const PAYMENT_METHODS = ["cash", "upi", "bank_transfer", "card", "other"];
// Firestore transactions allow 500 writes; each session needs a lock + a session doc, plus booking/counter/ledger/request.
const MAX_SESSIONS = 240;

function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** "+919446506130" from "94465 06130", "09446506130", "919446506130", "+91 94465 06130". */
function normalizePhone(raw) {
  if (typeof raw !== "string") throw new HttpsError("invalid-argument", "Phone number is required.");
  let s = raw.trim().replace(/[\s\-()]/g, "");
  if (s.startsWith("+")) {
    // keep as-is
  } else if (/^0\d{10}$/.test(s)) {
    s = "+91" + s.slice(1);
  } else if (/^\d{10}$/.test(s)) {
    s = "+91" + s;
  } else if (/^91\d{10}$/.test(s)) {
    s = "+" + s;
  } else {
    s = "+" + s;
  }
  if (!/^\+\d{10,15}$/.test(s)) {
    throw new HttpsError("invalid-argument", "Enter a valid phone number (10 digits, or with country code).");
  }
  return s;
}

/** Stored phone formats seen in `users.phoneNumber`: E.164, bare 10 digits, or 91 + 10 digits. */
function phoneVariants(e164) {
  const digits = e164.replace(/\D/g, "");
  const set = new Set([e164, digits]);
  if (e164.startsWith("+91") && digits.length === 12) {
    set.add(digits.slice(2));
    set.add("0" + digits.slice(2));
  }
  return [...set];
}

async function findClientByPhone(db, e164) {
  const variants = phoneVariants(e164);
  // 1) existing app user document
  const q = await db.collection("users").where("phoneNumber", "in", variants).limit(2).get();
  if (!q.empty) {
    const doc = q.docs[0];
    const data = doc.data();
    return { userId: doc.id, fullName: data.fullName || data.name || "", phoneNumber: data.phoneNumber || e164, source: "users", duplicate: q.size > 1 };
  }
  // 2) Firebase Auth user without a profile document yet
  try {
    const rec = await admin.auth().getUserByPhoneNumber(e164);
    return { userId: rec.uid, fullName: rec.displayName || "", phoneNumber: e164, source: "auth", duplicate: false };
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
  }
  return null;
}

function cleanName(v) {
  const s = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (s.length < 2 || s.length > 80) throw new HttpsError("invalid-argument", "Client full name must be 2-80 characters.");
  return s;
}

/** Creates (or completes) the client's Auth user + users/{uid} profile. Idempotent per phone number. */
async function ensureClient(db, who, e164, fullName) {
  let uid;
  try {
    const rec = await admin.auth().getUserByPhoneNumber(e164);
    uid = rec.uid;
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
    const created = await admin.auth().createUser({ phoneNumber: e164, displayName: fullName });
    uid = created.uid;
  }
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      fullName,
      name: fullName,
      email: "",
      phoneNumber: e164,
      photoUrl: null,
      profileCompleted: false,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: "admin_manual",
      createdByUid: who.uid,
    });
  }
  return uid;
}

const norm = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Slots a trainer offers for a schedule. The trainer app keys `availability` by DISPLAY NAME
 * ("Mon-Wed-Fri", "Tue-Thu-Sat", "Mon-Sat") while session_patterns ids are "mon_wed_fri" etc.,
 * so match on a normalised name against every identifier we know for the schedule.
 * Trials (no schedule) accept any slot the trainer offers.
 */
function offeredSlots(trainerData, pricing, d) {
  const availability = (trainerData && trainerData.availability) || {};
  const lists = [];
  if (pricing.bookingType === "trial") {
    for (const v of Object.values(availability)) if (Array.isArray(v)) lists.push(v);
  } else {
    const wanted = new Set([pricing.canonicalScheduleId, pricing.canonicalScheduleName, d.scheduleId, d.scheduleName].map(norm).filter(Boolean));
    for (const [key, v] of Object.entries(availability)) if (Array.isArray(v) && wanted.has(norm(key))) lists.push(v);
  }
  const uniq = [];
  for (const t of lists.flat()) {
    if (typeof t !== "string" || !slotLockKey(t)) continue; // ignore entries without a readable AM/PM
    if (!uniq.some((u) => isSameSlotHour(t, { slotTime: u }))) uniq.push(t);
  }
  return uniq.sort((x, y) => slotLockKey(x).localeCompare(slotLockKey(y)));
}

function assertSlotOffered(trainerData, pricing, d) {
  const offered = offeredSlots(trainerData, pricing, d);
  const who = (pricing.trainerData && pricing.trainerData.name) || "This trainer";
  const what = pricing.bookingType === "trial" ? "trials" : (pricing.canonicalScheduleName || "this schedule");
  if (offered.length === 0) {
    throw new HttpsError("failed-precondition", `${who} has no time slots set for ${what}. Choose another trainer or schedule.`);
  }
  if (!offered.some((t) => isSameSlotHour(d.slotTime, { slotTime: t }))) {
    throw new HttpsError("failed-precondition", `${who} does not offer the ${d.slotTime} slot for ${what}.`);
  }
}

function validateInput(d, needSlot = true) {
  if (!d.trainerId || typeof d.trainerId !== "string") throw new HttpsError("invalid-argument", "trainerId is required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.slotDate || "")) throw new HttpsError("invalid-argument", "Start date must be YYYY-MM-DD.");
  if (d.slotDate <= todayIST()) throw new HttpsError("failed-precondition", "Bookings must start tomorrow or later.");
  if (needSlot && (!d.slotTime || typeof d.slotTime !== "string" || !slotLockKey(d.slotTime))) {
    throw new HttpsError("invalid-argument", 'Slot time must include AM/PM, e.g. "7 AM".');
  }
  const bookingType = d.bookingType === "trial" ? "trial" : "subscription";
  if (bookingType === "subscription" && !d.scheduleId) throw new HttpsError("invalid-argument", "A schedule is required.");
  return bookingType;
}

async function priceAndCheck(db, d, needSlot = true) {
  const bookingType = validateInput(d, needSlot);
  const pricing = await resolveBookingPricing(db, d.trainerId, {
    tierId: d.tierId || undefined,
    planType: d.planType || "individual",
    scheduleId: d.scheduleId || "",
    scheduleName: d.scheduleName || "",
    durationKey: bookingType === "trial" ? "trial" : (d.durationKey || "1_month"),
    bookingType,
    slotDate: d.slotDate,
  });
  if (pricing.totalSessions > MAX_SESSIONS) {
    throw new HttpsError("failed-precondition", `This plan has ${pricing.totalSessions} sessions; manual bookings support up to ${MAX_SESSIONS}. Use a shorter duration.`);
  }
  if (needSlot) assertSlotOffered(pricing.trainerData, pricing, d);

  const gstPercentage = await resolveGstPercentage(db);
  const { gstAmount, totalAmount } = applyGst(pricing.basePrice, gstPercentage);

  const lockKey = needSlot ? slotLockKey(d.slotTime) : null;
  const slots = !needSlot ? [] : pricing.allSessionDates.map((date) => ({
    slotId: `${d.trainerId}_${date}_${lockKey}`,
    trainerId: d.trainerId,
    slotDate: date,
    slotTime: d.slotTime,
    slotHour: d.slotTime,
    timezone: "Asia/Kolkata",
  }));
  return { pricing, bookingType, gstPercentage, gstAmount, totalAmount, slots, lockKey };
}

function lockConflict(doc) {
  if (!doc.exists) return false;
  const lock = doc.data();
  if (lock.status === "locked" && lock.bookingId) return true;
  if (lock.status === "temp_locked") {
    const expired = lock.expiresAt ? lock.expiresAt.toMillis() < Date.now() : true;
    return !expired;
  }
  return false;
}

/** Read-only: does this phone already belong to a client? */
exports.adminLookupClient = onCall(async (request) => {
  const who = await validateAdmin(request.auth);
  requireRole(who, ROLES);
  const e164 = normalizePhone((request.data || {}).phone);
  const found = await findClientByPhone(admin.firestore(), e164);
  return { phone: e164, found: !!found, client: found };
});

/** Conflicting session dates for one slot time (empty = free for every session). */
async function conflictsFor(db, trainerId, dates, slotTime) {
  const key = slotLockKey(slotTime);
  const refs = dates.map((date) => db.collection("slot_locks").doc(`${trainerId}_${date}_${key}`));
  const out = [];
  for (let i = 0; i < refs.length; i += 300) {
    const docs = await db.getAll(...refs.slice(i, i + 300));
    docs.forEach((doc, j) => { if (lockConflict(doc)) out.push(dates[i + j]); });
  }
  return out;
}

/**
 * Read-only: price, GST, session dates and availability.
 * - with `slotTime`: conflicts for that slot.
 * - without it: every slot the trainer offers for this schedule, each with its conflicting dates,
 *   so the form can show only the hours that are actually free for the whole plan.
 */
exports.adminPreviewManualBooking = onCall({ timeoutSeconds: 120 }, async (request) => {
  const who = await validateAdmin(request.auth);
  requireRole(who, ROLES);
  const db = admin.firestore();
  const d = request.data || {};
  const withSlot = typeof d.slotTime === "string" && d.slotTime.trim() !== "";
  const c = await priceAndCheck(db, d, withSlot);
  const summary = {
    trainerName: c.pricing.trainerData.name || null,
    tierName: c.pricing.tierName,
    scheduleName: c.pricing.canonicalScheduleName || null,
    basePrice: c.pricing.basePrice,
    gstPercentage: c.gstPercentage,
    gstAmount: c.gstAmount,
    totalAmount: c.totalAmount,
    totalSessions: c.pricing.totalSessions,
    firstSession: c.pricing.allSessionDates[0],
    lastSession: c.pricing.allSessionDates[c.pricing.allSessionDates.length - 1],
  };
  if (withSlot) {
    const conflicts = await conflictsFor(db, d.trainerId, c.pricing.allSessionDates, d.slotTime);
    return { ...summary, conflicts, available: conflicts.length === 0 };
  }
  const offered = offeredSlots(c.pricing.trainerData, c.pricing, d);
  const slots = [];
  for (const slotTime of offered) {
    const conflicts = await conflictsFor(db, d.trainerId, c.pricing.allSessionDates, slotTime);
    slots.push({ slotTime, available: conflicts.length === 0, conflicts });
  }
  return { ...summary, slots };
});

exports.adminCreateManualBooking = onCall({ timeoutSeconds: 120 }, async (request) => {
  const who = await validateAdmin(request.auth);
  requireRole(who, ROLES);
  const d = request.data || {};
  const db = admin.firestore();

  // --- payment input
  const requestId = typeof d.clientRequestId === "string" ? d.clientRequestId.trim() : "";
  if (requestId.length < 8 || requestId.length > 100) throw new HttpsError("invalid-argument", "clientRequestId is required.");
  if (!PAYMENT_METHODS.includes(d.paymentMethod)) throw new HttpsError("invalid-argument", "Choose a payment method.");
  const reference = typeof d.paymentReference === "string" ? d.paymentReference.trim().slice(0, 100) : "";
  const received = Number(d.amountReceived);
  if (!Number.isFinite(received) || received <= 0) throw new HttpsError("invalid-argument", "Enter the amount received.");
  const adjustmentReason = typeof d.adjustmentReason === "string" ? d.adjustmentReason.trim().slice(0, 500) : "";

  // --- idempotency (retry-safe): same request id returns the original booking
  const reqRef = db.collection("manual_booking_requests").doc(requestId);
  const prior = await reqRef.get();
  if (prior.exists) return { success: true, duplicate: true, ...prior.data().result };

  // --- price, schedule, availability (read-only checks first)
  const c = await priceAndCheck(db, d);
  const diff = Math.round((received - c.totalAmount) * 100) / 100;
  if (diff !== 0 && adjustmentReason.length < 3) {
    throw new HttpsError("invalid-argument", `Amount received (${received}) differs from the plan total (${c.totalAmount}). A reason is required.`);
  }

  // --- client
  let userId;
  let clientCreated = false;
  if (typeof d.userId === "string" && d.userId) {
    const u = await db.collection("users").doc(d.userId).get();
    if (!u.exists) throw new HttpsError("not-found", "Client not found.");
    userId = d.userId;
  } else {
    const e164 = normalizePhone(d.phone);
    const existing = await findClientByPhone(db, e164);
    if (existing && existing.source === "users") {
      userId = existing.userId;
    } else {
      const fullName = cleanName(d.fullName || (existing && existing.fullName));
      userId = await ensureClient(db, who, e164, fullName);
      clientCreated = !existing;
    }
  }

  // --- the booking transaction
  const counterRef = db.collection("counters").doc("bookings");
  const userRef = db.collection("users").doc(userId);
  const slotRefs = c.slots.map((s) => db.collection("slot_locks").doc(s.slotId));
  const newBookingRef = db.collection("bookings").doc();
  const bookingId = newBookingRef.id;
  const p = c.pricing;
  const amountPaise = Math.round(c.totalAmount * 100);
  const receivedPaise = Math.round(received * 100);

  const result = await db.runTransaction(async (t) => {
    const [reqSnap, counterDoc, userDoc] = await Promise.all([t.get(reqRef), t.get(counterRef), t.get(userRef)]);
    if (reqSnap.exists) return { ...reqSnap.data().result, duplicate: true };
    const slotDocs = await t.getAll(...slotRefs);
    const conflicts = c.slots.filter((_, i) => lockConflict(slotDocs[i])).map((s) => s.slotDate);
    if (conflicts.length) {
      throw new HttpsError("failed-precondition", `Slot already booked on: ${conflicts.slice(0, 5).join(", ")}${conflicts.length > 5 ? ` (+${conflicts.length - 5} more)` : ""}.`);
    }

    const next = ((counterDoc.exists && counterDoc.data().count) || 0) + 1;
    const bookingReference = `3R-${new Date().getFullYear()}-${String(next).padStart(6, "0")}`;
    t.set(counterRef, { count: next }, { merge: true });

    const profile = userDoc.exists ? userDoc.data() : {};
    const clientName = profile.fullName || profile.name || profile.displayName || "User";
    const clientPhone = profile.phoneNumber || profile.phone || "";
    const tier = p.tierData || {};
    const trainer = p.trainerData || {};
    const isSub = c.bookingType === "subscription";
    // Use the matched plan's own unit ("month") like app bookings, not the resolver's derived plural ("months").
    const durType = (p.planData && p.planData.durationType) || p.durationType;

    const tierSnapshot = {
      id: p.tierId || null, name: tier.name || null, displayName: tier.displayName || null,
      description: tier.description || null, position: tier.position || null,
      badgeColor: tier.badgeColor || null, badgeTextColor: tier.badgeTextColor || null,
      gradientStart: tier.gradientStart || null, gradientEnd: tier.gradientEnd || null, icon: tier.icon || null,
    };
    const trainerSnapshot = {
      trainerId: d.trainerId, trainerName: trainer.name || null, photo: trainer.photo || null,
      tierId: p.tierId || null, tierName: tier.name || null,
    };
    const planSnapshot = isSub ? {
      planId: `${p.planType}_${p.scheduleId}_${p.durationKey}`,
      title: `${p.scheduleName} ${p.durationValue} ${durType}`,
      planType: p.planType || null, scheduleId: p.scheduleId || null, scheduleName: p.scheduleName || null,
      durationValue: p.durationValue || 1, durationType: durType || "month",
      sessionPerWeek: p.sessionPerWeek || 0, totalSessions: p.totalSessions || 0,
      price: p.basePrice || 0, popular: false, sortOrder: 0,
    } : null;
    const trialSnapshot = !isSub ? {
      price: p.basePrice || 0, planType: p.planType || null, scheduleId: p.scheduleId || null,
      scheduleName: p.scheduleName || null, sessionCount: p.totalSessions || 1,
    } : null;
    const sessionSnapshot = { slotDate: d.slotDate, slotTime: d.slotTime, slotHour: d.slotTime, timezone: "Asia/Kolkata" };
    const paymentSnapshot = {
      gateway: "offline", status: "paid", method: d.paymentMethod, reference: reference || null,
      amount: receivedPaise, currency: "INR", paidAt: FieldValue.serverTimestamp(),
      orderId: null, paymentId: null, receivedBy: who.uid, receivedByName: who.name,
    };
    const pricingBreakdown = {
      originalAmount: p.basePrice || 0, discountAmount: Math.max(0, -diff), couponAmount: 0,
      taxAmount: c.gstAmount, taxPercentage: c.gstPercentage,
      overrideAmount: diff !== 0 ? received : null, finalAmount: received, currency: "INR",
    };
    const progress = { completedSessions: 0, remainingSessions: p.totalSessions, totalSessions: p.totalSessions };

    t.set(newBookingRef, {
      bookingId, orderId: null, paymentId: null, userId,
      userName: clientName, userPhone: clientPhone, trainingAddress: profile.address || "",
      trainerId: d.trainerId, status: "confirmed", bookingStatus: "confirmed", paymentStatus: "paid",
      tierId: p.tierId, bookingType: c.bookingType, planType: p.planType, totalSessions: p.totalSessions,
      createdAt: FieldValue.serverTimestamp(),
      amount: receivedPaise, currency: "INR", bookingEngineVersion: "admin-manual-v1", bookingReference,
      bookingSource: "admin_manual", createdBy: who.uid, createdByUid: who.uid,
      isDeleted: false, requestId, schemaVersion: "3.0", updatedAt: FieldValue.serverTimestamp(),
      completedSessions: 0, remainingSessions: p.totalSessions,
      tierSnapshot, trainerSnapshot, planSnapshot, trialSnapshot, sessionSnapshot, paymentSnapshot,
      userSnapshot: profile, pricingBreakdown, progress,
      manualBooking: { createdBy: who.uid, createdByName: who.name, adjustmentReason: adjustmentReason || null },
    });

    const enrichment = {
      clientName, clientPhone, clientEmail: profile.email || "", clientPhotoUrl: profile.photoUrl || "",
      bookingType: c.bookingType, tierId: p.tierId || "", tierName: tier.name || p.tierId || "", trainingType: p.planType,
      ...(isSub ? { planName: `${p.scheduleName} ${p.durationValue || 1} ${durType || "month"}`, durationMinutes: 60 } : {}),
    };
    for (const s of c.slots) {
      t.set(db.collection("slot_locks").doc(s.slotId), {
        status: "locked", lockType: "permanent", expiresAt: null, bookingId, userId, trainerId: s.trainerId,
        slotDate: s.slotDate, slotTime: s.slotTime, slotHour: s.slotHour, updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      const sRef = db.collection("sessions").doc();
      t.set(sRef, { ...s, sessionId: sRef.id, bookingId, userId, status: "scheduled", createdAt: FieldValue.serverTimestamp(), ...enrichment });
    }

    // Offline collection shows up in the Ledger page / finance reports (amounts here are rupees).
    t.set(db.collection("ledger").doc(), {
      transactionId: `offline_${bookingReference}`, type: "credit", amount: received, currency: "INR",
      userId, bookingId, bookingReference, status: "success", method: d.paymentMethod, reference: reference || null,
      description: `Offline payment (${d.paymentMethod}) for ${bookingReference}`,
      createdBy: who.uid, createdAt: FieldValue.serverTimestamp(),
    });

    const out = { bookingId, bookingReference, userId, clientCreated, totalSessions: p.totalSessions };
    t.set(reqRef, { result: out, createdBy: who.uid, createdAt: FieldValue.serverTimestamp() });
    return out;
  });

  if (!result.duplicate) {
    await writeAuditLog(db, {
      action: "manual_booking_created", entityType: "booking", entityId: result.bookingId,
      bookingId: result.bookingId, bookingReference: result.bookingReference,
      adminUid: who.uid, adminIdentity: who, reason: adjustmentReason || undefined,
      newValue: {
        client: result.userId, clientCreated: result.clientCreated, trainer: d.trainerId,
        sessions: result.totalSessions, planTotal: c.totalAmount, received, method: d.paymentMethod,
      },
    });
  }
  return { success: true, ...result };
});
