const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const STALE = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);
const MAX_SPECIFIC = 500;

function rootFor(role) {
  return role === "trainer" ? "trainers" : "users";
}

// token -> its Firestore ref, for every device of the given recipients.
async function collectTokens(db, audience, recipients) {
  const refs = new Map();
  if (audience === "specific") {
    const docs = await Promise.all(recipients.map((r) =>
      db.collection(rootFor(r.role)).doc(r.id).collection("fcmTokens").get()));
    docs.forEach((snap) => snap.docs.forEach((d) => refs.set(d.id, d.ref)));
  } else {
    const root = audience === "all_trainers" ? "trainers" : "users";
    const snap = await db.collectionGroup("fcmTokens").get();
    snap.docs.forEach((d) => {
      if (d.ref.parent.parent.parent.id === root) refs.set(d.id, d.ref);
    });
  }
  return refs;
}

/**
 * adminSendNotification
 * Sends a custom push to all users, all trainers, or specific people.
 * data: { title, body, audience: "all_users"|"all_trainers"|"specific",
 *         recipients?: [{role: "user"|"trainer", id}] }
 */
exports.adminSendNotification = onCall({ timeoutSeconds: 300 }, async (request) => {
  const adminIdentity = await validateAdminShared(request.auth);
  const { title, body, audience, recipients } = request.data || {};

  if (typeof title !== "string" || !title.trim() || title.length > 65) {
    throw new HttpsError("invalid-argument", "Title is required (max 65 chars).");
  }
  if (typeof body !== "string" || !body.trim() || body.length > 240) {
    throw new HttpsError("invalid-argument", "Message is required (max 240 chars).");
  }
  if (!["all_users", "all_trainers", "specific"].includes(audience)) {
    throw new HttpsError("invalid-argument", "Invalid audience.");
  }
  let list = [];
  if (audience === "specific") {
    list = Array.isArray(recipients) ? recipients : [];
    const valid = list.every((r) => r && typeof r.id === "string" && r.id &&
      (r.role === "user" || r.role === "trainer"));
    if (!valid || list.length === 0 || list.length > MAX_SPECIFIC) {
      throw new HttpsError("invalid-argument", `Pick 1-${MAX_SPECIFIC} recipients.`);
    }
  }

  const db = admin.firestore();
  const refs = await collectTokens(db, audience, list);
  const tokens = [...refs.keys()];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const res = await admin.messaging().sendEachForMulticast({
      tokens: batch,
      notification: { title: title.trim(), body: body.trim() },
      data: { type: "admin_custom" },
      android: { priority: "high", notification: { channelId: "bookings" } },
      apns: { payload: { aps: { sound: "default" } } },
    });
    successCount += res.successCount;
    failureCount += res.failureCount;
    await Promise.all(res.responses.map(async (r, idx) => {
      if (!r.success && STALE.has(r.error && r.error.code)) {
        await refs.get(batch[idx]).delete().catch(() => {});
      }
    }));
  }

  const ref = await db.collection("adminNotifications").add({
    title: title.trim(),
    body: body.trim(),
    audience,
    recipientCount: audience === "specific" ? list.length : null,
    deviceCount: tokens.length,
    successCount,
    failureCount,
    sentByUid: adminIdentity.uid,
    sentByName: adminIdentity.name,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { success: true, id: ref.id, deviceCount: tokens.length, successCount, failureCount };
});

// Set by index.js so this module reuses the existing admin check.
let validateAdminShared = async () => {
  throw new HttpsError("internal", "Admin validator not configured.");
};
exports.setValidator = (fn) => { validateAdminShared = fn; };
