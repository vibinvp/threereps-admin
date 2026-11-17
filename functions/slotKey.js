"use strict";

// Slot identity helpers.
//
// Historically a slot was identified by only the leading digits of its time
// ("7 AM" and "7 PM" both became "7"), so a 7 AM booking blocked 7 PM (and
// 11 AM blocked 11 PM). These helpers resolve the real 24-hour hour from the
// slot's own AM/PM text, and derive a lock-document key that can never collide
// across AM/PM.

// Returns { hour24, hasMeridiem } or null when no hour can be read.
function parseSlotTime(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  const m = text.match(/^(\d{1,2})(?::\d{2})?\s*(?:([ap])\.?m\.?)?/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  if (Number.isNaN(hour) || hour > 24) return null;
  if (m[2]) {
    const isPm = m[2].toLowerCase() === "p";
    if (hour === 12) hour = isPm ? 12 : 0;
    else if (isPm) hour += 12;
    return { hour24: hour, hasMeridiem: true };
  }
  return { hour24: hour, hasMeridiem: false };
}

// New lock-document suffix, e.g. "7 AM" -> "h07", "7 PM" -> "h19". The "h"
// prefix keeps it distinct from legacy suffixes ("7"), so a new lock never
// overwrites a legacy lock document that happens to share the same digits.
// Returns null when the time has no AM/PM (caller falls back to legacy id).
function slotLockKey(slotTime) {
  const parsed = parseSlotTime(slotTime);
  if (!parsed || !parsed.hasMeridiem) return null;
  return `h${String(parsed.hour24).padStart(2, "0")}`;
}

// Does a stored lock/session (slotTime + legacy slotHour) occupy the same
// hour as `targetSlotTime`? Records with a readable AM/PM are compared exactly.
// Records without one (very old data) are matched conservatively: they block
// if their bare number equals the target's 24-hour OR 12-hour form.
function isSameSlotHour(targetSlotTime, record) {
  const target = parseSlotTime(targetSlotTime);
  if (!target) return false;
  const rec = record || {};
  const recParsed = parseSlotTime(rec.slotTime);
  if (recParsed && recParsed.hasMeridiem && target.hasMeridiem) {
    return recParsed.hour24 === target.hour24;
  }
  const bare = recParsed
    ? recParsed.hour24
    : parseSlotTime(rec.slotHour) && parseSlotTime(rec.slotHour).hour24;
  if (bare === null || bare === undefined || bare === false) return false;
  const twelveHour = target.hour24 % 12 === 0 ? 12 : target.hour24 % 12;
  return bare === target.hour24 || bare === twelveHour;
}

module.exports = { parseSlotTime, slotLockKey, isSameSlotHour };
