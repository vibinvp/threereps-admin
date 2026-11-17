const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");

setGlobalOptions({ region: "asia-south1" });
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { writeAuditLog } = require("./auditLogger");
const { slotLockKey, isSameSlotHour } = require("./slotKey");

admin.initializeApp();

// Keep in sync with src/lib/permissions.ts
const ADMIN_ROLES = ["superadmin", "admin", "ops", "finance", "support"];

/**
 * Validates that the caller is an active admin.
 */
async function validateAdmin(authData) {
  if (!authData || !authData.uid) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const db = admin.firestore();
  
  // 1. Direct UID Lookup
  let adminDoc = await db.collection("admins").doc(authData.uid).get();
  
  // 2. Fallback Email Lookup
  if (!adminDoc.exists && authData.token && authData.token.email) {
    const querySnap = await db.collection("admins")
      .where("email", "==", authData.token.email.toLowerCase().trim())
      .limit(1)
      .get();
    
    if (!querySnap.empty) {
      adminDoc = querySnap.docs[0];
    }
  }

  if (!adminDoc.exists) {
    throw new HttpsError("permission-denied", "Admin record not found.");
  }

  const adminData = adminDoc.data();
  if (adminData.isActive === false) {
    throw new HttpsError("permission-denied", "Admin account is deactivated.");
  }

  const role = adminData.role || "admin";
  if (!ADMIN_ROLES.includes(role)) {
    throw new HttpsError("permission-denied", "Admin role not recognised.");
  }

  return {
    uid: authData.uid, // authoritative UID from the request
    email: adminData.email || authData.token.email,
    name: adminData.name || "Unknown Admin",
    role,
  };
}

/** Throws unless the admin's role is one of `allowed` (superadmin always passes). */
function requireRole(adminIdentity, allowed) {
  if (adminIdentity.role === "superadmin" || allowed.includes(adminIdentity.role)) return;
  throw new HttpsError("permission-denied", "Your role cannot perform this action.");
}

/**
 * Resolves the date/time a session actually occupies, tolerating the
 * slotDate/sessionDate and slotHour/slotTime naming drift seen across the
 * booking engine's schema versions.
 */
function resolveSlotDetails(sessionData, bookingData) {
  const dateStr = sessionData.slotDate || sessionData.sessionDate ||
    (bookingData.sessionSnapshot && bookingData.sessionSnapshot.slotDate) || bookingData.slotDate;
  const timeUsed = sessionData.slotHour ?? sessionData.slotTime ??
    bookingData.slotHour ?? bookingData.slotTime;
  const formattedTime = String(timeUsed || "").replaceAll(" ", "").toLowerCase();
  return { dateStr, formattedTime };
}

/**
 * slot_locks documents are keyed deterministically as `${trainerId}_${date}_${time}`
 * (see bookingEngine/reconciliation.js in the main backend).
 */
function buildSlotLockId(trainerId, dateStr, formattedTime) {
  if (!trainerId || !dateStr || !formattedTime) return null;
  return `${trainerId}_${dateStr}_${formattedTime}`;
}

/**
 * adminAddBookingNote
 * Appends a note to bookings/{bookingId}/notes/{noteId}
 */
const notifications = require("./notifications");
notifications.setValidator(validateAdmin);
const finance = require("./finance");
finance.init({ validateAdmin, requireRole });
exports.adminUpdateSupportTicket = finance.adminUpdateSupportTicket;
exports.adminFlagLedgerEntry = finance.adminFlagLedgerEntry;
exports.adminSendNotification = notifications.adminSendNotification;

exports.adminAddBookingNote = onCall(async (request) => {
  const adminIdentity = await validateAdmin(request.auth);
  
  const { bookingId, note } = request.data;
  if (!bookingId || !note || typeof note !== "string" || note.trim().length === 0 || note.length > 5000) {
    throw new HttpsError("invalid-argument", "Valid bookingId and note are required");
  }

  const db = admin.firestore();
  
  const bookingDoc = await db.collection("bookings").doc(bookingId).get();
  if (!bookingDoc.exists) {
    throw new HttpsError("not-found", "Booking not found");
  }

  const bookingData = bookingDoc.data();
  const bookingReference = bookingData.bookingReference || null;
  
  const notesRef = db.collection(`bookings/${bookingId}/notes`).doc();
  await notesRef.set({
    bookingId,
    bookingReference,
    note: note.trim(),
    adminUid: adminIdentity.uid,
    adminName: adminIdentity.name,
    createdAt: FieldValue.serverTimestamp()
  });

  await writeAuditLog(db, {
    action: "admin_note_added",
    entityType: "booking",
    entityId: bookingId,
    bookingId,
    bookingReference,
    adminUid: adminIdentity.uid,
    adminIdentity,
    reason: "Admin added a note",
    newValue: note.trim(),
  });

  return { success: true, noteId: notesRef.id };
});

/**
 * adminRequestRefund
 * Writes to manual_refund_queue using the exact schema expected by the User App's worker.
 * Server resolves authoritative payment parameters from the booking.
 */
async function queueRefund(adminIdentity, bookingId, reason) {  
  if (!bookingId || typeof bookingId !== "string" || bookingId.trim().length === 0) {
    throw new HttpsError("invalid-argument", "Valid bookingId is required");
  }

  if (!reason || typeof reason !== "string" || reason.trim().length === 0 || reason.length > 5000) {
    throw new HttpsError("invalid-argument", "Valid reason is required");
  }

  const cleanReason = reason.trim();

  const db = admin.firestore();
  
  const bookingDoc = await db.collection("bookings").doc(bookingId).get();
  if (!bookingDoc.exists) {
    throw new HttpsError("not-found", "Booking not found");
  }
  
  const bookingData = bookingDoc.data();
  
  // Resolve authoritative payment info from the booking document
  const paymentId = bookingData.paymentId;
  const orderId = bookingData.orderId;
  
  // Resolve the authoritative amount
  // Ensure we do not trust pricingBreakdown.finalAmount, as it may not represent Razorpay subunits.
  // The authoritative amount must exactly match the payment session's captured amount.
  const bookingAmount = typeof bookingData.amount === 'number' ? bookingData.amount : null;
  const paymentSnapshotAmount = bookingData.paymentSnapshot && typeof bookingData.paymentSnapshot.amount === 'number' 
    ? bookingData.paymentSnapshot.amount 
    : null;
    
  if (bookingAmount == null || paymentSnapshotAmount == null || bookingAmount !== paymentSnapshotAmount) {
    throw new HttpsError("failed-precondition", "Refund blocked: payment amount could not be verified.");
  }
  
  const amount = bookingAmount;
  
  const currency = bookingData.currency || "INR";

  if (!paymentId || !orderId || amount <= 0) {
    throw new HttpsError("failed-precondition", "Booking does not have valid payment information for a refund.");
  }

  const queueRef = db.collection("manual_refund_queue").doc(paymentId);
  
  await db.runTransaction(async (t) => {
    const queueDoc = await t.get(queueRef);
    if (queueDoc.exists) {
      const qData = queueDoc.data();
      if (qData.status === "pending" || qData.status === "UNKNOWN" || qData.status === "processed") {
        throw new HttpsError("already-exists", `A refund for this payment is already ${qData.status}`);
      }
    }
    
    t.set(queueRef, {
      paymentId: paymentId,
      orderId: orderId,
      amount: amount,
      currency: currency,
      refundOperationId: "refund_" + paymentId,
      refundIdempotencyKey: "refund_" + paymentId,
      status: "pending",
      reason: cleanReason,
      createdAt: FieldValue.serverTimestamp(),
      // Extra fields for admin tracking
      adminUid: adminIdentity.uid,
      bookingId: bookingId
    }, { merge: true });

    return true;
  });

  await writeAuditLog(db, {
    action: "refund_requested",
    entityType: "payment",
    entityId: paymentId,
    bookingId,
    bookingReference: bookingData.bookingReference || null,
    adminUid: adminIdentity.uid,
    adminIdentity,
    reason: cleanReason,
    newValue: amount,
  });

  return { success: true, status: "pending" };
}

exports.adminRequestRefund = onCall(async (request) => {
  const adminIdentity = await validateAdmin(request.auth);
  requireRole(adminIdentity, ["admin", "ops", "finance"]);
  const { bookingId, reason } = request.data || {};
  return queueRefund(adminIdentity, bookingId, reason);
});

/**
 * adminQueuePaymentRefund
 * Refund entry point for the Payments page: resolves the booking that owns a
 * payment session, then queues the refund through the same verified path.
 * It never edits payment_sessions.status; the refund worker does that.
 */
exports.adminQueuePaymentRefund = onCall(async (request) => {
  const adminIdentity = await validateAdmin(request.auth);
  requireRole(adminIdentity, ["admin", "finance"]);
  const { paymentSessionId, reason } = request.data || {};
  if (!paymentSessionId || typeof paymentSessionId !== "string") {
    throw new HttpsError("invalid-argument", "paymentSessionId is required");
  }
  const db = admin.firestore();
  const psDoc = await db.collection("payment_sessions").doc(paymentSessionId).get();
  if (!psDoc.exists) throw new HttpsError("not-found", "Payment session not found");
  const ps = psDoc.data();
  const paymentId = ps.razorpayPaymentId || ps.paymentId;
  if (!paymentId) throw new HttpsError("failed-precondition", "Payment has no captured payment id");
  const bookings = await db.collection("bookings").where("paymentId", "==", paymentId).limit(2).get();
  if (bookings.empty) throw new HttpsError("not-found", "No booking found for this payment");
  if (bookings.size > 1) throw new HttpsError("failed-precondition", "Multiple bookings match this payment; refund from the booking page.");
  return queueRefund(adminIdentity, bookings.docs[0].id, reason);
});

/**
 * adminMarkSessionAttendance
 * Marks a session as completed and updates booking counters safely inside a transaction.
 */
exports.adminMarkSessionAttendance = onCall(async (request) => {
  try {
    const adminIdentity = await validateAdmin(request.auth);

    const { bookingId, sessionId } = request.data;
    if (!bookingId || typeof bookingId !== "string" || bookingId.trim().length === 0) {
      throw new HttpsError("invalid-argument", "Valid bookingId is required");
    }
    if (!sessionId || typeof sessionId !== "string" || sessionId.trim().length === 0) {
      throw new HttpsError("invalid-argument", "Valid sessionId is required");
    }

    const db = admin.firestore();
    const sessionRef = db.collection("sessions").doc(sessionId);
    const bookingRef = db.collection("bookings").doc(bookingId);

    const result = await db.runTransaction(async (transaction) => {
      // 1. Fetch booking document
      const bookingDoc = await transaction.get(bookingRef);
      if (!bookingDoc.exists) {
        throw new HttpsError("not-found", "Booking not found.");
      }
      const bookingData = bookingDoc.data();

      // 2. Fetch session document
      const sessionDoc = await transaction.get(sessionRef);
      if (!sessionDoc.exists) {
        throw new HttpsError("not-found", "Session not found.");
      }
      const sessionData = sessionDoc.data();

      // 3. Verify session belongs to booking
      if (sessionData.bookingId !== bookingId) {
        throw new HttpsError("failed-precondition", "Session does not belong to the specified booking.");
      }

      // 4. Duplicate / Idempotency protection
      if ((sessionData.status || "").toLowerCase() === "completed") {
        // Session already completed, do not modify counters
        return {
          success: true,
          message: "Already Marked",
          alreadyCompleted: true
        };
      }

      // 5. Validate booking status
      const status = (bookingData.status || "").toLowerCase();
      const bookingStatus = (bookingData.bookingStatus || "").toLowerCase();
      const isValidStatus = ["confirmed", "active", "ongoing"].includes(status) ||
        ["confirmed", "active", "ongoing"].includes(bookingStatus);

      if (!isValidStatus) {
        throw new HttpsError("failed-precondition", `Cannot mark attendance. Booking status is: ${bookingData.status || bookingData.bookingStatus}`);
      }

      if (bookingData.bookingType === "trial") {
        throw new HttpsError("failed-precondition", "Attendance marking is not available for trial sessions.");
      }

      // 6. Update session document
      transaction.update(sessionRef, {
        status: "completed",
        trainerMarked: true,
        attended: true,
        attendedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // 7. Update slot lock document (using set+merge: safe even if doc doesn't exist)
      const trainerId = sessionData.trainerId || bookingData.trainerId;
      const dateStr = sessionData.sessionDate || sessionData.slotDate ||
        (bookingData.sessionSnapshot && bookingData.sessionSnapshot.slotDate) ||
        bookingData.slotDate;
      const timeUsed = sessionData.slotHour ?? sessionData.slotTime ??
        bookingData.slotHour ?? bookingData.slotTime;
      const formattedTime = String(timeUsed || "").replaceAll(" ", "").toLowerCase();
      const fallbackLockId = `${trainerId}_${dateStr}_${formattedTime}`;
      const slotLockId = sessionData.slotId || sessionData.slotLockId || fallbackLockId;

      if (slotLockId && !slotLockId.includes("_undefined_")) {
        const slotLockRef = db.collection("slot_locks").doc(slotLockId);
        // Use set+merge so this succeeds whether or not the doc already exists
        transaction.set(slotLockRef, {
          status: "completed",
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      } else {
        // Log and warn; do not hard-fail attendance for a missing slot lock ID
        console.warn(
          "[adminMarkSessionAttendance] Could not resolve slotLockId for session:",
          sessionId, "fallback was:", fallbackLockId
        );
      }

      // 8. Calculate counters
      const progress = bookingData.progress || {};
      const totalSessions = bookingData.totalSessions ?? progress.totalSessions;
      if (totalSessions === undefined || totalSessions === null) {
        throw new HttpsError("failed-precondition", "Booking session count is not configured.");
      }

      const completedSessions = bookingData.completedSessions ?? progress.completedSessions ?? 0;
      const newCompleted = completedSessions + 1;
      const remainingSessions = Math.max(totalSessions - newCompleted, 0);

      if (newCompleted > totalSessions) {
        throw new HttpsError("failed-precondition", "Completed sessions cannot exceed total sessions.");
      }

      // 9. Update booking document
      const bookingUpdate = {
        completedSessions: FieldValue.increment(1),
        remainingSessions: FieldValue.increment(-1),
        "progress.completedSessions": newCompleted,
        "progress.remainingSessions": remainingSessions,
        "progress.totalSessions": totalSessions,
        lastAttendanceAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      let finalStatus = bookingData.status || "confirmed";

      if (finalStatus === "confirmed" && newCompleted > 0 && newCompleted < totalSessions) {
        bookingUpdate.status = "active";
        bookingUpdate.bookingStatus = "active";
        finalStatus = "active";
      }

      if (newCompleted >= totalSessions) {
        bookingUpdate.status = "completed";
        bookingUpdate.bookingStatus = "completed";
        bookingUpdate.completedAt = FieldValue.serverTimestamp();
        finalStatus = "completed";
      }

      transaction.update(bookingRef, bookingUpdate);

      // 10. Write to attendance collection (mirroring User App)
      const attendanceRef = db.collection("attendance").doc();
      transaction.set(attendanceRef, {
        attendanceId: attendanceRef.id,
        bookingId,
        sessionId,
        trainerId: sessionData.trainerId || bookingData.trainerId || "",
        userId: sessionData.userId || bookingData.userId || "",
        markedAt: FieldValue.serverTimestamp(),
        device: "admin_panel",
        qrVersion: 0,
        trainerName: bookingData.trainerName || "",
        userName: bookingData.userName || "",
        sessionDate: sessionData.sessionDate || "",
        slot: sessionData.slotTime || "",
        pattern: bookingData.sessionPattern || bookingData.dayGroup || "",
        bookingVersion: bookingData.bookingVersion || 1,
        markedBy: "admin",
        markedVia: "admin_panel",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        message: "Attendance Marked Successfully",
        bookingSummary: {
          bookingId,
          totalSessions,
          completedSessions: newCompleted,
          remainingSessions,
          status: finalStatus,
        }
      };
    });

    // 11. Write to audit_logs securely
    if (result && result.success && !result.alreadyCompleted) {
      await writeAuditLog(db, {
        action: "admin_mark_session_attendance",
        entityType: "session",
        entityId: sessionId,
        bookingId,
        bookingReference: null,
        adminUid: adminIdentity.uid,
        adminIdentity,
        reason: "Admin marked attendance",
        previousValue: { status: "scheduled" },
        newValue: { status: "completed" },
      });
    }

    return result;
  } catch (err) {
    // Re-throw HttpsErrors as-is (they have proper code/message)
    if (err instanceof HttpsError) throw err;
    // Unexpected errors: log with context and return a descriptive error
    console.error("[adminMarkSessionAttendance] Unexpected error:", {
      message: err.message,
      stack: err.stack,
      data: JSON.stringify(request.data),
    });
    throw new HttpsError("internal", "An unexpected error occurred. Please check Cloud Logs for details.");
  }
});

/**
 * adminCancelBooking
 * Cancels a booking and every remaining (not completed/cancelled) session,
 * releasing their slot locks so those slots free up again. Payment refunds
 * are a separate, explicit admin action (adminRequestRefund) - cancelling a
 * booking never triggers one automatically.
 */
exports.adminCancelBooking = onCall(async (request) => {
  const db = admin.firestore();
  try {
    const adminIdentity = await validateAdmin(request.auth);

    const { bookingId, reason } = request.data;
    if (!bookingId || typeof bookingId !== "string" || bookingId.trim().length === 0) {
      throw new HttpsError("invalid-argument", "Valid bookingId is required");
    }
    if (!reason || typeof reason !== "string" || reason.trim().length === 0 || reason.length > 5000) {
      throw new HttpsError("invalid-argument", "A cancellation reason is required");
    }
    const cleanReason = reason.trim();

    const bookingRef = db.collection("bookings").doc(bookingId);
    const bookingDoc = await bookingRef.get();
    if (!bookingDoc.exists) {
      throw new HttpsError("not-found", "Booking not found.");
    }
    const bookingData = bookingDoc.data();
    const bookingReference = bookingData.bookingReference || null;

    const currentStatus = (bookingData.status || bookingData.bookingStatus || "").toLowerCase();
    if (currentStatus === "cancelled") {
      throw new HttpsError("failed-precondition", "Booking is already cancelled.");
    }
    if (currentStatus === "completed") {
      throw new HttpsError("failed-precondition", "Completed bookings cannot be cancelled.");
    }

    const sessionsQuery = db.collection("sessions").where("bookingId", "==", bookingId);

    const sessionsCancelled = await db.runTransaction(async (transaction) => {
      const freshBookingSnap = await transaction.get(bookingRef);
      if (!freshBookingSnap.exists) {
        throw new HttpsError("not-found", "Booking not found.");
      }
      const freshBooking = freshBookingSnap.data();
      const freshStatus = (freshBooking.status || freshBooking.bookingStatus || "").toLowerCase();
      if (freshStatus === "cancelled" || freshStatus === "completed") {
        throw new HttpsError("failed-precondition", `Booking is now ${freshStatus}; cannot cancel.`);
      }

      const sessionsSnap = await transaction.get(sessionsQuery);
      const remaining = sessionsSnap.docs.filter((d) => {
        const s = (d.data().status || "").toLowerCase();
        return s !== "completed" && s !== "cancelled";
      });

      for (const sessionDoc of remaining) {
        const sessionData = sessionDoc.data();
        transaction.update(sessionDoc.ref, {
          status: "cancelled",
          cancelledAt: FieldValue.serverTimestamp(),
          cancelledBy: adminIdentity.uid,
          updatedAt: FieldValue.serverTimestamp(),
        });

        const { dateStr, formattedTime } = resolveSlotDetails(sessionData, freshBooking);
        // Prefer the canonical lock id stored on the session (AM/PM-safe, e.g.
        // "..._h19"); only rebuild the legacy "..._7" style id for old sessions.
        const slotLockId = sessionData.slotId || sessionData.slotLockId ||
          buildSlotLockId(sessionData.trainerId || freshBooking.trainerId, dateStr, formattedTime);
        if (slotLockId) {
          transaction.set(db.collection("slot_locks").doc(slotLockId), {
            status: "released",
            lockType: null,
            releasedAt: FieldValue.serverTimestamp(),
            releasedReason: "booking_cancelled",
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
      }

      transaction.update(bookingRef, {
        status: "cancelled",
        bookingStatus: "cancelled",
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledBy: adminIdentity.uid,
        cancellationReason: cleanReason,
        // Every remaining session was just cancelled, so keep the stored
        // progress consistent with the sessions (avoids a false "data
        // discrepancy" on the booking page).
        "progress.remainingSessions": 0,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return remaining.length;
    });

    await writeAuditLog(db, {
      action: "admin_booking_cancelled",
      entityType: "booking",
      entityId: bookingId,
      bookingId,
      bookingReference,
      adminUid: adminIdentity.uid,
      adminIdentity,
      reason: cleanReason,
      previousValue: { status: currentStatus },
      newValue: { status: "cancelled", sessionsCancelled },
    });

    return { success: true, sessionsCancelled };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("[adminCancelBooking] Unexpected error:", {
      message: err.message,
      stack: err.stack,
      data: JSON.stringify(request.data),
    });
    throw new HttpsError("internal", "An unexpected error occurred. Please check Cloud Logs for details.");
  }
});

/**
 * adminChangeTrainer
 * Reassigns every remaining (not completed/cancelled) session of a booking to
 * a new trainer, re-validating that trainer's availability for each affected
 * slot inside the same transaction (source of truth: slot_locks), and moving
 * the slot locks over. Aborts the whole operation - no partial reassignment -
 * if any slot conflicts.
 */
exports.adminChangeTrainer = onCall(async (request) => {
  const db = admin.firestore();
  try {
    const adminIdentity = await validateAdmin(request.auth);

    const { bookingId, newTrainerId, reason } = request.data;
    if (!bookingId || typeof bookingId !== "string" || bookingId.trim().length === 0) {
      throw new HttpsError("invalid-argument", "Valid bookingId is required");
    }
    if (!newTrainerId || typeof newTrainerId !== "string" || newTrainerId.trim().length === 0) {
      throw new HttpsError("invalid-argument", "Valid newTrainerId is required");
    }
    if (!reason || typeof reason !== "string" || reason.trim().length === 0 || reason.length > 5000) {
      throw new HttpsError("invalid-argument", "A reason is required");
    }
    const cleanReason = reason.trim();

    const bookingRef = db.collection("bookings").doc(bookingId);
    const bookingDoc = await bookingRef.get();
    if (!bookingDoc.exists) {
      throw new HttpsError("not-found", "Booking not found.");
    }
    const bookingData = bookingDoc.data();
    const bookingReference = bookingData.bookingReference || null;

    const currentStatus = (bookingData.status || bookingData.bookingStatus || "").toLowerCase();
    if (currentStatus === "cancelled" || currentStatus === "completed") {
      throw new HttpsError("failed-precondition", `Cannot change trainer on a ${currentStatus} booking.`);
    }

    const oldTrainerId = bookingData.trainerId;
    if (oldTrainerId === newTrainerId) {
      throw new HttpsError("invalid-argument", "The booking is already assigned to this trainer.");
    }

    const newTrainerDoc = await db.collection("trainers").doc(newTrainerId).get();
    if (!newTrainerDoc.exists) {
      throw new HttpsError("not-found", "Selected trainer not found.");
    }
    const newTrainerData = newTrainerDoc.data();
    if (newTrainerData.status !== "active" || newTrainerData.isPaused) {
      throw new HttpsError("failed-precondition", "Selected trainer is not currently active.");
    }
    const newTrainerName = newTrainerData.name || newTrainerData.fullName || "Trainer";

    const sessionsQuery = db.collection("sessions").where("bookingId", "==", bookingId);

    const sessionsReassigned = await db.runTransaction(async (transaction) => {
      const freshBookingSnap = await transaction.get(bookingRef);
      if (!freshBookingSnap.exists) {
        throw new HttpsError("not-found", "Booking not found.");
      }
      const freshBooking = freshBookingSnap.data();
      const freshStatus = (freshBooking.status || freshBooking.bookingStatus || "").toLowerCase();
      if (freshStatus === "cancelled" || freshStatus === "completed") {
        throw new HttpsError("failed-precondition", `Booking is now ${freshStatus}; cannot change trainer.`);
      }

      const sessionsSnap = await transaction.get(sessionsQuery);
      const remaining = sessionsSnap.docs.filter((d) => {
        const s = (d.data().status || "").toLowerCase();
        return s !== "completed" && s !== "cancelled";
      });

      if (remaining.length === 0) {
        throw new HttpsError("failed-precondition", "This booking has no remaining sessions to reassign.");
      }

      const plan = remaining.map((doc) => {
        const sessionData = doc.data();
        const { dateStr, formattedTime } = resolveSlotDetails(sessionData, freshBooking);
        // New trainer's lock uses the AM/PM-safe key ("h19"); the legacy id
        // ("..._7", shared by 7 AM and 7 PM) is only checked for conflicts.
        const newKey = slotLockKey(sessionData.slotTime || freshBooking.slotTime) || formattedTime;
        return {
          sessionRef: doc.ref,
          sessionData,
          dateStr,
          oldLockId: sessionData.slotId || sessionData.slotLockId ||
            buildSlotLockId(sessionData.trainerId || oldTrainerId, dateStr, formattedTime),
          newLockId: buildSlotLockId(newTrainerId, dateStr, newKey),
          legacyNewLockId: buildSlotLockId(newTrainerId, dateStr, formattedTime),
          slotTime: sessionData.slotTime || freshBooking.slotTime,
        };
      });

      if (plan.some((p) => !p.newLockId)) {
        throw new HttpsError("failed-precondition", "Could not resolve slot date/time for one or more sessions; aborting to avoid data corruption.");
      }

      const newLockSnaps = await Promise.all(
        plan.map((p) => transaction.get(db.collection("slot_locks").doc(p.newLockId)))
      );
      // Locks created before AM/PM-safe ids sit under the legacy id; they only
      // count as a conflict when they are for the same hour (not 7 AM vs 7 PM).
      const legacyLockSnaps = await Promise.all(
        plan.map((p) => (p.legacyNewLockId && p.legacyNewLockId !== p.newLockId)
          ? transaction.get(db.collection("slot_locks").doc(p.legacyNewLockId))
          : Promise.resolve(null))
      );

      const isBlocking = (lock) => {
        if (lock.status === "locked") return true;
        if (lock.status === "temp_locked") {
          const isExpired = lock.expiresAt ? lock.expiresAt.toDate() < new Date() : true;
          return !isExpired;
        }
        return false;
      };

      const conflicts = [];
      newLockSnaps.forEach((snap, i) => {
        const legacySnap = legacyLockSnaps[i];
        const newBlocks = snap.exists && isBlocking(snap.data());
        const legacyBlocks = legacySnap && legacySnap.exists &&
          isSameSlotHour(plan[i].slotTime, legacySnap.data()) && isBlocking(legacySnap.data());
        if (newBlocks || legacyBlocks) conflicts.push(plan[i].dateStr);
      });

      if (conflicts.length > 0) {
        throw new HttpsError("already-exists", `Selected trainer is unavailable on: ${conflicts.join(", ")}`);
      }

      for (const p of plan) {
        transaction.update(p.sessionRef, {
          trainerId: newTrainerId,
          slotId: p.newLockId,
          reassignedAt: FieldValue.serverTimestamp(),
          reassignedBy: adminIdentity.uid,
          updatedAt: FieldValue.serverTimestamp(),
        });

        if (p.oldLockId && p.oldLockId !== p.newLockId) {
          transaction.set(db.collection("slot_locks").doc(p.oldLockId), {
            status: "released",
            lockType: null,
            releasedAt: FieldValue.serverTimestamp(),
            releasedReason: "trainer_reassigned",
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }

        transaction.set(db.collection("slot_locks").doc(p.newLockId), {
          status: "locked",
          lockType: "permanent",
          trainerId: newTrainerId,
          trainerName: newTrainerName,
          userId: p.sessionData.userId || freshBooking.userId || "",
          slotDate: p.dateStr,
          slotTime: p.sessionData.slotTime || null,
          slotHour: p.sessionData.slotHour || null,
          bookingId,
          expiresAt: null,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      transaction.update(bookingRef, {
        trainerId: newTrainerId,
        trainerName: newTrainerName,
        "trainerSnapshot.trainerId": newTrainerId,
        "trainerSnapshot.name": newTrainerName,
        "trainerSnapshot.trainerName": newTrainerName,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return plan.length;
    });

    await writeAuditLog(db, {
      action: "admin_trainer_changed",
      entityType: "booking",
      entityId: bookingId,
      bookingId,
      bookingReference,
      adminUid: adminIdentity.uid,
      adminIdentity,
      reason: cleanReason,
      previousValue: { trainerId: oldTrainerId },
      newValue: { trainerId: newTrainerId, trainerName: newTrainerName, sessionsReassigned },
    });

    return { success: true, sessionsReassigned, newTrainerName };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("[adminChangeTrainer] Unexpected error:", {
      message: err.message,
      stack: err.stack,
      data: JSON.stringify(request.data),
    });
    throw new HttpsError("internal", "An unexpected error occurred. Please check Cloud Logs for details.");
  }
});
