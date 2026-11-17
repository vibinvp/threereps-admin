const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { writeAuditLog } = require("./auditLogger");

let validateAdmin;
let requireRole;
exports.init = (deps) => {
  validateAdmin = deps.validateAdmin;
  requireRole = deps.requireRole;
};

// Matches the user app, which writes support_requests with status "open".
const TICKET_STATUSES = ["open", "in_progress", "resolved"];

function cleanText(value, max, field) {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > max) {
    throw new HttpsError("invalid-argument", `${field} must be a string up to ${max} characters`);
  }
  return value.trim();
}

/** Updates a support ticket's status/notes. Audit-logged. */
exports.adminUpdateSupportTicket = onCall(async (request) => {
  const who = await validateAdmin(request.auth);
  requireRole(who, ["admin", "ops", "support"]);
  const { ticketId, status, adminNotes } = request.data || {};
  if (!ticketId || typeof ticketId !== "string") {
    throw new HttpsError("invalid-argument", "ticketId is required");
  }
  if (!TICKET_STATUSES.includes(status)) {
    throw new HttpsError("invalid-argument", "Invalid status");
  }
  const notes = cleanText(adminNotes, 5000, "adminNotes");

  const db = admin.firestore();
  const ref = db.collection("support_requests").doc(ticketId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Ticket not found");
  const before = snap.data();

  await ref.update({
    status,
    adminNotes: notes,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: who.uid,
  });

  await writeAuditLog(db, {
    action: "support_ticket_updated",
    entityType: "support_request",
    entityId: ticketId,
    adminUid: who.uid,
    adminIdentity: who,
    reason: notes || undefined,
    previousValue: before.status || null,
    newValue: status,
  });
  return { success: true };
});

/**
 * Flags a ledger entry for manual reconciliation with a note.
 * Deliberately does NOT change the entry's status or amounts: real recovery
 * (webhook replay, slot release) must happen in the booking backend.
 */
exports.adminFlagLedgerEntry = onCall(async (request) => {
  const who = await validateAdmin(request.auth);
  requireRole(who, ["admin", "finance"]);
  const { ledgerId, note } = request.data || {};
  if (!ledgerId || typeof ledgerId !== "string") {
    throw new HttpsError("invalid-argument", "ledgerId is required");
  }
  const cleanNote = cleanText(note, 2000, "note");
  if (!cleanNote) throw new HttpsError("invalid-argument", "A note is required");

  const db = admin.firestore();
  const ref = db.collection("ledger").doc(ledgerId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Ledger entry not found");

  await ref.update({
    reconciliation: {
      status: "flagged",
      note: cleanNote,
      flaggedBy: who.uid,
      flaggedByName: who.name,
      flaggedAt: FieldValue.serverTimestamp(),
    },
  });

  await writeAuditLog(db, {
    action: "ledger_flagged",
    entityType: "ledger",
    entityId: ledgerId,
    adminUid: who.uid,
    adminIdentity: who,
    reason: cleanNote,
  });
  return { success: true };
});
