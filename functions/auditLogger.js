const { FieldValue } = require("firebase-admin/firestore");

/**
 * Writes to the audit_logs collection securely.
 * @param {admin.firestore.Firestore} db
 * @param {Object} params
 */
async function writeAuditLog(db, { action, entityType, entityId, bookingId, bookingReference, adminUid, adminIdentity, reason, previousValue, newValue }) {
  try {
    // Flat schema - matches what the admin panel's booking detail page reads
    // (entityId/action/reason/adminName at the top level, not nested).
    const doc = {
      action,
      entity: entityType,
      entityId,
      bookingId,
      bookingReference,
      adminUid,
      adminId: adminUid,
      adminName: adminIdentity && adminIdentity.name,
      reason,
      previousValue: previousValue || null,
      newValue: newValue || null,
      createdAt: FieldValue.serverTimestamp(),
    };

    // Clean up undefined properties
    Object.keys(doc).forEach(key => doc[key] === undefined && delete doc[key]);

    await db.collection("audit_logs").add(doc);
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}

module.exports = {
  writeAuditLog,
};
