// Manual (admin) booking: integration tests on the Auth + Firestore + Functions emulators.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const PROJECT = 'demo-threereps';
const AUTH = 'http://127.0.0.1:9099';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const FN = `http://127.0.0.1:5001/${PROJECT}/asia-south1`;
const hdr = { 'content-type': 'application/json', Authorization: 'Bearer owner' };

const enc = (v) =>
  v === null ? { nullValue: null }
  : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? { integerValue: String(v) }
  : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } }
  : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } }
  : { stringValue: v };
const dec = (f) => {
  if (f == null) return undefined;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('nullValue' in f) return null;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(dec);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  return undefined;
};
async function put(path, fields) {
  const r = await fetch(`${FS}/${path}`, { method: 'PATCH', headers: hdr, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, enc(v)])) }) });
  assert.ok(r.ok, `seed ${path}: ${await r.text()}`);
}
async function get(path) {
  const r = await fetch(`${FS}/${path}`, { headers: hdr });
  const j = await r.json();
  return j.fields ? Object.fromEntries(Object.entries(j.fields).map(([k, v]) => [k, dec(v)])) : null;
}
async function list(col) {
  const r = await fetch(`${FS}/${col}?pageSize=300`, { headers: hdr });
  return ((await r.json()).documents ?? []).map((d) => ({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, dec(v)])) }));
}
async function makeUser(email) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'pass1234', returnSecureToken: true }),
  });
  const j = await r.json();
  return { uid: j.localId, token: j.idToken };
}
async function call(name, token, data) {
  const r = await fetch(`${FN}/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ data }) });
  return { status: r.status, body: await r.json() };
}

// A Monday at least 3 days ahead (valid for Mon-Sat schedules).
function nextMonday() {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + 3);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const START = nextMonday();
const base = { trainerId: 'mb_trainer', planType: 'individual', scheduleId: 'mon_sat', durationKey: '1_month', bookingType: 'subscription', slotDate: START, slotTime: '7 AM' };

let ops, fin, sup;
before(async () => {
  [ops, fin, sup] = await Promise.all(['mb_ops', 'mb_fin', 'mb_sup'].map((n) => makeUser(`${n}@t.com`)));
  await put(`admins/${ops.uid}`, { email: 'mb_ops@t.com', role: 'ops', isActive: true, name: 'Ops' });
  await put(`admins/${fin.uid}`, { email: 'mb_fin@t.com', role: 'finance', isActive: true, name: 'Fin' });
  await put(`admins/${sup.uid}`, { email: 'mb_sup@t.com', role: 'support', isActive: true, name: 'Sup' });
  await put('trainers/mb_trainer', { name: 'Test Trainer', status: 'active', isPaused: false, tierId: 'mb_gold', availability: { 'Mon-Wed-Fri': ['6 PM'], 'Tue-Thu-Sat': ['6 PM'], 'Mon-Sat': ['7 AM', '8 AM'] } });
  await put('trainers/mb_trainer2', { name: 'Second Trainer', status: 'active', isPaused: false, tierId: 'mb_gold', availability: { mon_sat: ['7 AM'] } });
  await put('trainers/mb_trainer3', { name: 'Third Trainer', status: 'active', isPaused: false, tierId: 'mb_gold', availability: { mon_sat: ['7 AM'] } });
  await put('trainers/mb_trainer4', { name: 'MWF Only Trainer', status: 'active', isPaused: false, tierId: 'mb_gold', availability: { 'Mon-Wed-Fri': ['7 AM'] } });
  await put('trainers/mb_trainer5', { name: 'Fifth Trainer', status: 'active', isPaused: false, tierId: 'mb_gold', availability: { 'Mon-Sat': ['5 PM', '8 AM', '7 AM', 'garbage', '9'] } });
  await put('trainers/mb_trainer6', { name: 'No Availability Trainer', status: 'active', isPaused: false, tierId: 'mb_gold' });
  await put('trainer_tiers/mb_gold', {
    name: 'Gold', displayName: 'Gold', isActive: true, position: 1,
    pricing: { subscriptions: { individual: { mon_sat: [{ active: true, durationValue: 1, durationType: 'month', price: 1000, title: 'Mon-Sat 1 month' }] } } },
  });
  await put('session_patterns/mon_sat', { displayName: 'Mon-Sat', name: 'mon_sat', daysPerWeek: 6, isActive: true, sortOrder: 3 });
  await put('app_config/tax', { gstPercentage: 18 });
  // Existing app user, phone stored as bare 10 digits (as seen in production data)
  await put('users/mb_existing_user', { fullName: 'Existing Person', phoneNumber: '9446506130', email: 'e@x.com' });
});

test('only admin/ops/superadmin may use manual booking', async () => {
  for (const u of [fin, sup]) {
    assert.equal((await call('adminLookupClient', u.token, { phone: '9446506130' })).status, 403);
    assert.equal((await call('adminPreviewManualBooking', u.token, base)).status, 403);
    assert.equal((await call('adminCreateManualBooking', u.token, base)).status, 403);
  }
  assert.equal((await call('adminLookupClient', null, { phone: '9446506130' })).status, 401);
});

test('lookup finds an existing user across phone formats, and reports unknown numbers', async () => {
  for (const phone of ['9446506130', '+91 94465 06130', '09446506130', '919446506130']) {
    const r = await call('adminLookupClient', ops.token, { phone });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.result.found, true, phone);
    assert.equal(r.body.result.client.userId, 'mb_existing_user');
  }
  const none = await call('adminLookupClient', ops.token, { phone: '9876500001' });
  assert.equal(none.body.result.found, false);
  assert.equal((await call('adminLookupClient', ops.token, { phone: '123' })).status, 400);
});

test('preview prices with GST, counts sessions, and reports no conflicts', async () => {
  const r = await call('adminPreviewManualBooking', ops.token, base);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const p = r.body.result;
  assert.equal(p.basePrice, 1000);
  assert.equal(p.gstAmount, 180);
  assert.equal(p.totalAmount, 1180);
  assert.equal(p.totalSessions, 24);
  assert.equal(p.firstSession, START);
  assert.equal(p.available, true);
});

test('validation: unoffered slot, same-day/past date, bad time (specific messages)', async () => {
  const slot = await call('adminPreviewManualBooking', ops.token, { ...base, slotTime: '9 AM' });
  assert.equal(slot.status, 400); assert.match(slot.body.error.message, /does not offer/i);
  const past = await call('adminPreviewManualBooking', ops.token, { ...base, slotDate: '2020-01-06' });
  assert.equal(past.status, 400); assert.match(past.body.error.message, /tomorrow or later/i);
  const time = await call('adminPreviewManualBooking', ops.token, { ...base, slotTime: '7' });
  assert.equal(time.status, 400); assert.match(time.body.error.message, /AM\/PM/);
  const tue = new Date(START + 'T00:00:00Z'); tue.setUTCDate(tue.getUTCDate() + 6); // a Sunday: not in Mon-Sat
  const sun = await call('adminPreviewManualBooking', ops.token, { ...base, slotDate: tue.toISOString().slice(0, 10) });
  assert.equal(sun.status, 400); assert.match(sun.body.error.message, /schedule/i);
});

let first;
test('creates a booking for a brand-new phone number: client, booking, sessions, locks, ledger, audit', async () => {
  const r = await call('adminCreateManualBooking', ops.token, {
    ...base, phone: '98765 00002', fullName: 'Walk In Client', clientRequestId: 'req-create-0001',
    paymentMethod: 'cash', paymentReference: 'RCPT-1', amountReceived: 1180,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  first = r.body.result;
  assert.equal(first.clientCreated, true);
  assert.equal(first.totalSessions, 24);
  assert.match(first.bookingReference, /^3R-\d{4}-\d{6}$/);

  const user = await get(`users/${first.userId}`);
  assert.equal(user.fullName, 'Walk In Client');
  assert.equal(user.phoneNumber, '+919876500002');
  assert.equal(user.profileCompleted, false);

  const b = await get(`bookings/${first.bookingId}`);
  assert.equal(b.status, 'confirmed');
  assert.equal(b.bookingSource, 'admin_manual');
  assert.equal(b.paymentSnapshot.gateway, 'offline');
  assert.equal(b.paymentSnapshot.amount, 118000); // paise, like app bookings
  assert.equal(b.amount, 118000);
  assert.equal(b.trainerSnapshot.trainerName, 'Test Trainer');
  assert.equal(b.tierSnapshot.name, 'Gold');
  assert.equal(b.planSnapshot.title, 'Mon-Sat 1 month');
  assert.equal(b.sessionSnapshot.slotTime, '7 AM');
  assert.equal(b.pricingBreakdown.taxAmount, 180);
  assert.equal(b.paymentId, null);

  const sessions = (await list('sessions')).filter((s) => s.bookingId === first.bookingId);
  assert.equal(sessions.length, 24);
  assert.ok(sessions.every((s) => s.status === 'scheduled' && s.userId === first.userId && s.slotTime === '7 AM'));
  const locks = (await list('slot_locks')).filter((l) => l.bookingId === first.bookingId);
  assert.equal(locks.length, 24);
  assert.ok(locks.every((l) => l.status === 'locked' && l.id.startsWith('mb_trainer_') && l.id.endsWith('_h07')));

  const ledger = (await list('ledger')).filter((l) => l.bookingId === first.bookingId);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].amount, 1180);
  assert.equal(ledger[0].method, 'cash');
  assert.ok((await list('audit_logs')).some((a) => a.action === 'manual_booking_created' && a.bookingId === first.bookingId && a.adminName === 'Ops'));
});

test('retrying with the same request id returns the same booking (no duplicates)', async () => {
  const again = await call('adminCreateManualBooking', ops.token, {
    ...base, phone: '98765 00002', fullName: 'Walk In Client', clientRequestId: 'req-create-0001',
    paymentMethod: 'cash', amountReceived: 1180,
  });
  assert.equal(again.status, 200);
  assert.equal(again.body.result.bookingId, first.bookingId);
  assert.equal(again.body.result.duplicate, true);
  assert.equal((await list('sessions')).filter((s) => s.bookingId === first.bookingId).length, 24);
});

test('a second booking for the same trainer/slot/dates is rejected (no double booking)', async () => {
  const r = await call('adminCreateManualBooking', ops.token, {
    ...base, userId: 'mb_existing_user', clientRequestId: 'req-conflict-01', paymentMethod: 'upi', amountReceived: 1180,
  });
  assert.equal(r.status, 400, JSON.stringify(r.body));
  assert.match(r.body.error.message, /already booked/i);
  const pv = await call('adminPreviewManualBooking', ops.token, base);
  assert.equal(pv.body.result.available, false);
  assert.ok(pv.body.result.conflicts.length > 0);
});

test('different slot works for an existing app user; repeat phone reuses the same client', async () => {
  const r = await call('adminCreateManualBooking', ops.token, {
    ...base, slotTime: '8 AM', phone: '+91 94465 06130', clientRequestId: 'req-existing-01', paymentMethod: 'upi', paymentReference: 'UPI123', amountReceived: 1180,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.userId, 'mb_existing_user');
  assert.equal(r.body.result.clientCreated, false);
  assert.notEqual(r.body.result.bookingReference, first.bookingReference);
});

test('amount different from plan total needs a reason; with a reason it is recorded', async () => {
  const noReason = await call('adminCreateManualBooking', ops.token, {
    ...base, trainerId: 'mb_trainer', slotDate: base.slotDate, slotTime: '8 AM', userId: 'mb_existing_user',
    clientRequestId: 'req-discount-01', paymentMethod: 'cash', amountReceived: 1000,
  });
  assert.equal(noReason.status, 400);
  assert.match(noReason.body.error.message, /reason/i);
  // Cannot book (8 AM now taken) – so check the reason path on a different trainer slot via validation only:
  const missingMethod = await call('adminCreateManualBooking', ops.token, { ...base, userId: 'mb_existing_user', clientRequestId: 'req-nomethod-01', amountReceived: 1180 });
  assert.equal(missingMethod.status, 400);
  const missingId = await call('adminCreateManualBooking', ops.token, { ...base, userId: 'mb_existing_user', paymentMethod: 'cash', amountReceived: 1180 });
  assert.equal(missingId.status, 400);
});

test('Razorpay refund is blocked for offline-paid bookings with a clear message', async () => {
  const r = await call('adminRequestRefund', ops.token, { bookingId: first.bookingId, reason: 'test' });
  assert.equal(r.status, 400);
  assert.match(r.body.error.message, /paid offline/i);
});

test('a discounted amount with a reason is accepted and recorded in booking, ledger and audit', async () => {
  const r = await call('adminCreateManualBooking', ops.token, {
    ...base, trainerId: 'mb_trainer2', userId: 'mb_existing_user', clientRequestId: 'req-discount-02',
    paymentMethod: 'cash', amountReceived: 1000, adjustmentReason: 'Staff referral discount',
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const b = await get(`bookings/${r.body.result.bookingId}`);
  assert.equal(b.pricingBreakdown.discountAmount, 180);
  assert.equal(b.pricingBreakdown.finalAmount, 1000);
  assert.equal(b.paymentSnapshot.amount, 100000);
  assert.equal(b.manualBooking.adjustmentReason, 'Staff referral discount');
  const led = (await list('ledger')).find((l) => l.bookingId === r.body.result.bookingId);
  assert.equal(led.amount, 1000);
  assert.ok((await list('audit_logs')).some((a) => a.bookingId === r.body.result.bookingId && a.reason === 'Staff referral discount'));
});

test('two simultaneous requests for the same slot: exactly one wins, no double booking', async () => {
  const mk = (id, phone) => call('adminCreateManualBooking', ops.token, {
    ...base, trainerId: 'mb_trainer3', phone, fullName: 'Race Client', clientRequestId: id, paymentMethod: 'cash', amountReceived: 1180,
  });
  const [a, b] = await Promise.all([mk('req-race-000001', '9876500011'), mk('req-race-000002', '9876500012')]);
  const ok = [a, b].filter((x) => x.status === 200);
  const bad = [a, b].filter((x) => x.status !== 200);
  assert.equal(ok.length, 1, JSON.stringify([a.body, b.body]));
  assert.equal(bad.length, 1);
  assert.match(bad[0].body.error.message, /already booked/i);
  const winner = ok[0].body.result.bookingId;
  const locks = (await list('slot_locks')).filter((l) => l.trainerId === 'mb_trainer3');
  assert.equal(locks.length, 24);
  assert.ok(locks.every((l) => l.bookingId === winner));
  assert.equal((await list('sessions')).filter((x) => x.trainerId === 'mb_trainer3').length, 24);
});

// ---------- availability keyed by display name (real data) + per-slot availability ----------
test('slots are found when availability is keyed by display name ("Mon-Sat") not id ("mon_sat")', async () => {
  const { slotTime, ...noSlot } = base;
  const r = await call('adminPreviewManualBooking', ops.token, { ...noSlot, trainerId: 'mb_trainer5' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  // sorted by hour, entries without AM/PM ignored
  assert.deepEqual(r.body.result.slots.map((x) => x.slotTime), ['7 AM', '8 AM', '5 PM']);
  assert.ok(r.body.result.slots.every((x) => x.available && x.conflicts.length === 0));
  assert.equal(r.body.result.totalAmount, 1180);
});

test('after a booking, that slot is listed as unavailable while the others stay free', async () => {
  const b = await call('adminCreateManualBooking', ops.token, {
    ...base, trainerId: 'mb_trainer5', slotTime: '8 AM', userId: 'mb_existing_user', clientRequestId: 'req-slotlist-01', paymentMethod: 'cash', amountReceived: 1180,
  });
  assert.equal(b.status, 200, JSON.stringify(b.body));
  const { slotTime, ...noSlot } = base;
  const r = await call('adminPreviewManualBooking', ops.token, { ...noSlot, trainerId: 'mb_trainer5' });
  const by = Object.fromEntries(r.body.result.slots.map((x) => [x.slotTime, x]));
  assert.equal(by['8 AM'].available, false);
  assert.equal(by['8 AM'].conflicts.length, 24);
  assert.equal(by['7 AM'].available, true);
  assert.equal(by['5 PM'].available, true);
});

test('switching trainer shows that trainer\'s own slots', async () => {
  const { slotTime, ...noSlot } = base;
  const a = await call('adminPreviewManualBooking', ops.token, { ...noSlot, trainerId: 'mb_trainer' });
  const b = await call('adminPreviewManualBooking', ops.token, { ...noSlot, trainerId: 'mb_trainer5' });
  assert.deepEqual(a.body.result.slots.map((x) => x.slotTime), ['7 AM', '8 AM']);
  assert.deepEqual(b.body.result.slots.map((x) => x.slotTime), ['7 AM', '8 AM', '5 PM']);
});

test('trainer with no slots for the schedule: listing is empty and booking is refused with a clear message', async () => {
  const { slotTime, ...noSlot } = base;
  const list = await call('adminPreviewManualBooking', ops.token, { ...noSlot, trainerId: 'mb_trainer4' }); // MWF only, schedule Mon-Sat
  assert.equal(list.status, 200, JSON.stringify(list.body));
  assert.deepEqual(list.body.result.slots, []);
  const create = await call('adminCreateManualBooking', ops.token, { ...base, trainerId: 'mb_trainer4', userId: 'mb_existing_user', clientRequestId: 'req-noslots-001', paymentMethod: 'cash', amountReceived: 1180 });
  assert.equal(create.status, 400);
  assert.match(create.body.error.message, /no time slots set/i);
  const none = await call('adminCreateManualBooking', ops.token, { ...base, trainerId: 'mb_trainer6', userId: 'mb_existing_user', clientRequestId: 'req-noavail-001', paymentMethod: 'cash', amountReceived: 1180 });
  assert.equal(none.status, 400);
  assert.match(none.body.error.message, /no time slots set/i);
});

test('a slot the trainer does not offer is rejected even when other slots exist', async () => {
  const r = await call('adminCreateManualBooking', ops.token, { ...base, trainerId: 'mb_trainer5', slotTime: '6 AM', userId: 'mb_existing_user', clientRequestId: 'req-notoffered1', paymentMethod: 'cash', amountReceived: 1180 });
  assert.equal(r.status, 400);
  assert.match(r.body.error.message, /does not offer/i);
});
