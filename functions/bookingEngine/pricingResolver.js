// COPIED VERBATIM from threereps_user/functions/bookingEngine/pricingResolver.js so manual (admin) bookings
// price and schedule exactly like app bookings. If the engine changes, re-copy this file.
const { HttpsError } = require("firebase-functions/v2/https");

function getValidDaysAndFrequency(dayGroupOrScheduleId) {
  const groupLower = (dayGroupOrScheduleId || "").toLowerCase();
  let validDays = [1, 2, 3, 4, 5, 6];
  let name = "";
  if (groupLower.includes("mon-wed-fri") || groupLower.includes("mon_wed_fri") || groupLower.includes("monwedfri")) {
    validDays = [1, 3, 5];
    name = "mon_wed_fri";
  } else if (groupLower.includes("tue-thu-sat") || groupLower.includes("tue_thu_sat") || groupLower.includes("tuethusat")) {
    validDays = [2, 4, 6];
    name = "tue_thu_sat";
  } else if (groupLower.includes("sat-sun") || groupLower.includes("sat_sun") || groupLower.includes("satsun")) {
    validDays = [6, 0];
    name = "sat_sun";
  } else if (groupLower.includes("mon-sat") || groupLower.includes("mon_sat") || groupLower.includes("monsat")) {
    validDays = [1, 2, 3, 4, 5, 6];
    name = "mon_sat";
  } else if (groupLower.includes("mon-sun") || groupLower.includes("all") || groupLower.includes("mon_sun") || groupLower.includes("monsun")) {
    validDays = [0, 1, 2, 3, 4, 5, 6];
    name = "mon_sun";
  }
  return { validDays, frequency: validDays.length, canonicalId: name };
}

function calculateSessionDates({ startDate, durationKey, dayGroupOrScheduleId, bookingType }) {
  console.log(`[3REPS_DEBUG_BACKEND] calculateSessionDates input payload: startDate=${startDate}, durationKey=${durationKey}, dayGroupOrScheduleId=${dayGroupOrScheduleId}, bookingType=${bookingType}`);
  let start;
  if (typeof startDate === 'string') {
    const parts = startDate.split("-");
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    start = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  } else if (startDate instanceof Date) {
    start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate(), 0, 0, 0, 0));
  } else {
    // Fallback if it's a Firestore Timestamp or other object
    const dateObj = startDate.toDate ? startDate.toDate() : new Date(startDate);
    start = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate(), 0, 0, 0, 0));
  }

  const isTrial = durationKey === "trial" || bookingType === "trial";

  if (isTrial) {
    const yyyy = start.getUTCFullYear();
    const mm = String(start.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(start.getUTCDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const trialExpiry = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    console.log(`[3REPS_DEBUG_BACKEND] calculateSessionDates (Trial) output: totalSessions=1, sessionDatesCount=1, expiryDate=${trialExpiry}`);
    return {
      sessionDates: [dateStr],
      totalSessions: 1,
      expiryDate: trialExpiry
    };
  }

  const { validDays, frequency } = getValidDaysAndFrequency(dayGroupOrScheduleId);

  const startDay = start.getUTCDay();
  if (!validDays.includes(startDay)) {
    throw new HttpsError("failed-precondition", "Selected date does not match the selected training schedule.");
  }

  let weeks = 4;
  if (durationKey === "15_days") {
    weeks = 2;
  } else if (durationKey === "3_month") {
    weeks = 12;
  } else if (durationKey === "6_month") {
    weeks = 24;
  } else if (durationKey === "1_year") {
    weeks = 48;
  }

  const totalSessions = frequency * weeks;

  const sessionDates = [];
  const current = new Date(start.getTime());
  while (sessionDates.length < totalSessions) {
    const dayOfWeek = current.getUTCDay();
    if (validDays.includes(dayOfWeek)) {
      const yyyy = current.getUTCFullYear();
      const mm = String(current.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(current.getUTCDate()).padStart(2, '0');
      sessionDates.push(`${yyyy}-${mm}-${dd}`);
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  const expiryDate = new Date(start.getTime() + (weeks * 7 * 24 * 60 * 60 * 1000));

  console.log(`[3REPS_DEBUG_BACKEND] calculateSessionDates output: totalSessions=${totalSessions}, sessionDatesCount=${sessionDates ? sessionDates.length : 0}, expiryDate=${expiryDate}`);
  return {
    sessionDates,
    totalSessions,
    expiryDate
  };
}

function calculateExpiryDate(startDate, durationKey) {
  const res = calculateSessionDates({
    startDate,
    durationKey,
    dayGroupOrScheduleId: "mon-wed-fri",
    bookingType: durationKey === "trial" ? "trial" : "subscription"
  });
  return res.expiryDate;
}

function generateSessionDates(startDate, expiryDate, dayGroup) {
  // Fallback for direct legacy calls using arbitrary expiry dates
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(expiryDate);
  current.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const { validDays } = getValidDaysAndFrequency(dayGroup);

  while (current < end) {
    const dayOfWeek = current.getDay();
    if (validDays.includes(dayOfWeek)) {
      const mm = (current.getMonth() + 1).toString().padStart(2, "0");
      const dd = current.getDate().toString().padStart(2, "0");
      dates.push(`${current.getFullYear()}-${mm}-${dd}`);
    }
    current.setDate(current.getDate() + 1);
  }

  if (dates.length === 0) {
    const mm = (startDate.getMonth() + 1).toString().padStart(2, "0");
    const dd = startDate.getDate().toString().padStart(2, "0");
    dates.push(`${startDate.getFullYear()}-${mm}-${dd}`);
  }
  return [...new Set(dates)];
}

async function resolveTierDoc(db, trainerData, clientTierId) {
  if (clientTierId) {
    const doc = await db.collection("trainer_tiers").doc(clientTierId).get();
    if (doc.exists) return { id: doc.id, data: doc.data() };
  }

  const dbTierId = trainerData.trainerTierId || trainerData.tierId;
  if (dbTierId) {
    const doc = await db.collection("trainer_tiers").doc(dbTierId).get();
    if (doc.exists) return { id: doc.id, data: doc.data() };
  }

  if (clientTierId) {
    const nameSnapshot = await db.collection("trainer_tiers").where("name", "==", clientTierId).get();
    const displaySnapshot = await db.collection("trainer_tiers").where("displayName", "==", clientTierId).get();
    
    const candidates = [];
    nameSnapshot.forEach(doc => candidates.push({ id: doc.id, data: doc.data() }));
    displaySnapshot.forEach(doc => {
      if (!candidates.find(c => c.id === doc.id)) {
        candidates.push({ id: doc.id, data: doc.data() });
      }
    });

    if (candidates.length > 1) {
      console.error(`[PRICING_AUDIT] tierId=${clientTierId} lookup=ambiguous count=${candidates.length}`);
      throw new HttpsError("failed-precondition", "Ambiguous trainer tier configuration.");
    }
    if (candidates.length === 1) {
      return candidates[0];
    }
  }

  if (trainerData.tier) {
    const nameSnapshot = await db.collection("trainer_tiers").where("name", "==", trainerData.tier).get();
    const displaySnapshot = await db.collection("trainer_tiers").where("displayName", "==", trainerData.tier).get();
    
    const candidates = [];
    nameSnapshot.forEach(doc => candidates.push({ id: doc.id, data: doc.data() }));
    displaySnapshot.forEach(doc => {
      if (!candidates.find(c => c.id === doc.id)) {
        candidates.push({ id: doc.id, data: doc.data() });
      }
    });

    if (candidates.length > 1) {
      console.error(`[PRICING_AUDIT] tierId=${trainerData.tier} lookup=ambiguous count=${candidates.length}`);
      throw new HttpsError("failed-precondition", "Ambiguous trainer tier configuration.");
    }
    if (candidates.length === 1) {
      return candidates[0];
    }
  }

  console.error(`[PRICING_AUDIT] tierId=${clientTierId || "null"} trainerTierId=${dbTierId || "null"} lookup=NOT_FOUND`);
  return null;
}

async function resolveSchedule(db, scheduleId, scheduleName) {
  if (scheduleId) {
    const doc = await db.collection("session_patterns").doc(scheduleId).get();
    if (doc.exists && doc.data().isActive !== false) {
      return { id: doc.id, name: doc.data().displayName || doc.data().name, daysPerWeek: doc.data().daysPerWeek || 3 };
    }
  }

  if (scheduleName) {
    const nameSnapshot = await db.collection("session_patterns").where("name", "==", scheduleName).get();
    if (!nameSnapshot.empty) {
      const doc = nameSnapshot.docs[0];
      if (doc.data().isActive !== false) {
        return { id: doc.id, name: doc.data().displayName || doc.data().name, daysPerWeek: doc.data().daysPerWeek || 3 };
      }
    }
    
    const displaySnapshot = await db.collection("session_patterns").where("displayName", "==", scheduleName).get();
    if (!displaySnapshot.empty) {
      const doc = displaySnapshot.docs[0];
      if (doc.data().isActive !== false) {
        return { id: doc.id, name: doc.data().displayName || doc.data().name, daysPerWeek: doc.data().daysPerWeek || 3 };
      }
    }
  }

  const normalizedRequested = (scheduleId || scheduleName || "").toLowerCase().replace(/[^a-z0-9]/g, "_");
  let candidateId = "";
  if (normalizedRequested.includes("mon_wed_fri") || normalizedRequested.includes("monwedfri")) {
    candidateId = "mon_wed_fri";
  } else if (normalizedRequested.includes("tue_thu_sat") || normalizedRequested.includes("tuethusat")) {
    candidateId = "tue_thu_sat";
  } else if (normalizedRequested.includes("mon_sat") || normalizedRequested.includes("monsat")) {
    candidateId = "mon_sat";
  } else if (normalizedRequested.includes("sat_sun") || normalizedRequested.includes("satsun")) {
    candidateId = "sat_sun";
  }

  if (candidateId) {
    const doc = await db.collection("session_patterns").doc(candidateId).get();
    if (doc.exists && doc.data().isActive !== false) {
      return { id: doc.id, name: doc.data().displayName || doc.data().name, daysPerWeek: doc.data().daysPerWeek || 3 };
    }
  }

  return null;
}

async function resolveBookingPricing(db, trainerId, requestData) {
  const {
    tierId,
    planType = "individual",
    scheduleId = "",
    scheduleName = "",
    durationKey = "1_month",
    bookingType = "subscription",
    slotDate
  } = requestData;

  const trainerDoc = await db.collection("trainers").doc(trainerId).get();
  if (!trainerDoc.exists) {
    throw new HttpsError("not-found", "Trainer not found.");
  }
  const trainerData = trainerDoc.data();
  if (trainerData.status !== "active") {
    throw new HttpsError("failed-precondition", "Trainer is not active.");
  }
  if (trainerData.isPaused === true) {
    throw new HttpsError("failed-precondition", "This trainer is currently unavailable for new bookings.");
  }

  const tierDocResult = await resolveTierDoc(db, trainerData, tierId);
  if (!tierDocResult) {
    throw new HttpsError("failed-precondition", "Pricing tier not configured.");
  }
  const { id: resolvedTierId, data: tierDataObj } = tierDocResult;

  if (tierDataObj.status === "inactive" || tierDataObj.isActive === false) {
    throw new HttpsError("failed-precondition", "Selected pricing tier is inactive.");
  }

  let canonicalScheduleId = "";
  let canonicalScheduleName = "";
  let daysPerWeek = 0;

  if (bookingType !== "trial") {
    const scheduleResult = await resolveSchedule(db, scheduleId, scheduleName);
    if (!scheduleResult) {
      throw new HttpsError("failed-precondition", "Schedule not configured.");
    }
    canonicalScheduleId = scheduleResult.id;
    canonicalScheduleName = scheduleResult.name;
    daysPerWeek = scheduleResult.daysPerWeek;
  }

  let expectedPrice = 0;
  let pricingPath = "";
  let planData = null;

  // Resolve durationValue and durationType
  let durationValue = requestData.durationValue;
  let durationType = requestData.durationType;
  if (!durationValue || !durationType) {
    if (durationKey === "1_month") {
      durationValue = 1;
      durationType = "months";
    } else if (durationKey === "3_month") {
      durationValue = 3;
      durationType = "months";
    } else if (durationKey === "6_month") {
      durationValue = 6;
      durationType = "months";
    } else if (durationKey === "1_year") {
      durationValue = 1;
      durationType = "years";
    } else if (durationKey === "15_days") {
      durationValue = 15;
      durationType = "days";
    }
  }

  const pricing = tierDataObj.pricing || {};

  if (bookingType === "trial") {
    // Trial pricing: pricing.trial[planType].price
    const trialPricing = pricing.trial || {};
    const planTypeTrial = trialPricing[planType] || {};
    if (planTypeTrial.price === undefined) {
      console.error(`[PRICING_AUDIT] Trial price undefined for planType=${planType}`);
      throw new HttpsError("failed-precondition", "Plan pricing could not be determined. Please check the plan details.");
    }
    expectedPrice = Number(planTypeTrial.price || 0);
    pricingPath = `pricing.trial.${planType}.price`;

    console.log(`[PRICING_AUDIT] Input tier: ${tierId || "null"}`);
    console.log(`[PRICING_AUDIT] Resolved tier ID: ${resolvedTierId}`);
    console.log(`[PRICING_AUDIT] Booking type: trial`);
    console.log(`[PRICING_AUDIT] Plan type: ${planType}`);
    console.log(`[PRICING_AUDIT] Input schedule: ${scheduleId || scheduleName || "null"}`);
    console.log(`[PRICING_AUDIT] Resolved schedule: ${canonicalScheduleId}`);
    console.log(`[PRICING_AUDIT] Pricing path: ${pricingPath}`);
    console.log(`[PRICING_AUDIT] Resolved price: ${expectedPrice}`);
  } else {
    // Subscription pricing: pricing.subscriptions[planType][canonicalScheduleId] (array of objects)
    const subscriptionsPricing = pricing.subscriptions || {};
    const planTypeSubs = subscriptionsPricing[planType] || {};
    const scheduleSubs = planTypeSubs[canonicalScheduleId];
    if (!scheduleSubs || !Array.isArray(scheduleSubs)) {
      console.error(`[PRICING_AUDIT] Subscriptions array not found for planType=${planType} scheduleId=${canonicalScheduleId}`);
      throw new HttpsError("failed-precondition", "Plan pricing could not be determined. Please check the plan details.");
    }

    const candidates = scheduleSubs.filter(p => {
      if (p.active !== true) return false;
      const pTypeNorm = (p.durationType || "").toLowerCase().replace(/s$/, "");
      const reqTypeNorm = (durationType || "").toLowerCase().replace(/s$/, "");
      return p.durationValue === durationValue && pTypeNorm === reqTypeNorm;
    });

    if (candidates.length === 0) {
      console.error(`[PRICING_AUDIT] No active plan found matching durationValue=${durationValue} durationType=${durationType}`);
      throw new HttpsError("failed-precondition", "Plan pricing could not be determined. Please check the plan details.");
    }
    if (candidates.length > 1) {
      console.error(`[PRICING_AUDIT] Multiple active plans match durationValue=${durationValue} durationType=${durationType}`);
      throw new HttpsError("failed-precondition", "Multiple active pricing plans found.");
    }

    planData = candidates[0];
    expectedPrice = Number(planData.price || 0);
    pricingPath = `pricing.subscriptions.${planType}.${canonicalScheduleId}`;

    console.log(`[PRICING_AUDIT] Input tier: ${tierId || "null"}`);
    console.log(`[PRICING_AUDIT] Resolved tier ID: ${resolvedTierId}`);
    console.log(`[PRICING_AUDIT] Booking type: subscription`);
    console.log(`[PRICING_AUDIT] Plan type: ${planType}`);
    console.log(`[PRICING_AUDIT] Input schedule: ${scheduleId || scheduleName || "null"}`);
    console.log(`[PRICING_AUDIT] Resolved schedule: ${canonicalScheduleId}`);
    console.log(`[PRICING_AUDIT] Pricing path: ${pricingPath}`);
    console.log(`[PRICING_AUDIT] Matched plan: ${planData.title || "Untitled"}`);
    console.log(`[PRICING_AUDIT] Duration: ${durationValue} ${durationType}`);
    console.log(`[PRICING_AUDIT] Resolved price: ${expectedPrice}`);
  }

  if (expectedPrice <= 0) {
    throw new HttpsError("failed-precondition", "Plan pricing could not be determined. Please check the plan details.");
  }

  const { sessionDates: allSessionDates, totalSessions, expiryDate: expiryDt } = calculateSessionDates({
    startDate: slotDate,
    durationKey,
    dayGroupOrScheduleId: canonicalScheduleId,
    bookingType
  });

  const startDt = new Date(slotDate);

  console.log(`[BOOKING_PLAN] duration=${durationKey} schedule=${canonicalScheduleId} startDate=${slotDate} totalSessions=${totalSessions}`);
  console.log(`[BOOKING_PLAN] sessionDates=${JSON.stringify(allSessionDates)}`);

  return {
    tierId: resolvedTierId,
    tierName: tierDataObj.name || resolvedTierId,
    tierData: tierDataObj,
    trainerData,
    basePrice: expectedPrice,
    expiryDt,
    allSessionDates,
    totalSessions,
    sessionPerWeek: daysPerWeek,
    startDt,
    canonicalScheduleId,
    canonicalScheduleName,
    scheduleId: canonicalScheduleId,
    scheduleName: canonicalScheduleName,
    pricingPath,
    bookingType,
    planType,
    durationKey,
    durationValue,
    durationType,
    planData
  };
}

async function resolvePricing(db, trainerId, requestData) {
  return resolveBookingPricing(db, trainerId, requestData);
}

// GST percentage is set by admins in app_config/tax and applied on top of the
// resolved base price. Defaults to 0 (no tax) if unset so pricing keeps
// working even before an admin configures a rate.
async function resolveGstPercentage(db) {
  const doc = await db.collection("app_config").doc("tax").get();
  if (!doc.exists) return 0;
  const pct = Number(doc.data().gstPercentage);
  return Number.isFinite(pct) && pct >= 0 ? pct : 0;
}

// Applies GST on top of a base price. Rounds the tax amount to paise (2dp)
// to avoid floating point drift, and derives the total from base + tax
// rather than rounding the total directly, so it always reconciles.
function applyGst(basePrice, gstPercentage) {
  const gstAmount = Math.round(basePrice * gstPercentage) / 100;
  const totalAmount = Math.round((basePrice + gstAmount) * 100) / 100;
  return { gstPercentage, gstAmount, totalAmount };
}

module.exports = {
  resolvePricing,
  resolveBookingPricing,
  resolveGstPercentage,
  applyGst,
  calculateExpiryDate,
  generateSessionDates,
  calculateSessionDates
};
