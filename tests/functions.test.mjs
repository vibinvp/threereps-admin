// Integration tests: run against the Auth + Firestore + Functions emulators.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const PROJECT = 'demo-threereps';
const AUTH = 'http://127.0.0.1:9099';
const FS = 'http://127.0.0.1:8080';
const FN = `http://127.0.0.1:5001/${PROJECT}/asia-south1`;

async function makeUser(email) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'pass1234', returnSecureToken: true }),
  });
  const j = await r.json();
  return { uid: j.localId, token: j.idToken };
}
const fsUrl = (path) => `${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`;
const hdr = { 'content-type': 'application/json', Authorization: 'Bearer owner' };
const enc = (v) =>
  typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? { integerValue: String(v) }
  : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } }
  : { stringValue: v };
async function put(path, fields) {
  const f = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, enc(v)]));
  const r = await fetch(fsUrl(path), { method: 'PATCH', headers: hdr, body: JSON.stringify({ fields: f }) });
  assert.ok(r.ok, `seed ${path}: ${await r.text()}`);
}
async function get(path) {
  const r = await fetch(fsUrl(path), { headers: hdr });
  return r.json();
}
async function list(col) {
  const r = await fetch(fsUrl(col), { headers: hdr });
  return (await r.json()).documents ?? [];
}
async function call(name, token, data) {
  const r = await fetch(`${FN}/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  });
  return { status: r.status, body: await r.json() };
}

let sa, fin, sup, nobody, off;
before(async () => {
  [sa, fin, sup, nobody, off] = await Promise.all(['sa', 'fin', 'sup', 'nobody', 'off'].map((n) => makeUser(`${n}@t.com`)));
  await put(`admins/${sa.uid}`, { email: 'sa@t.com', role: 'superadmin', isActive: true, name: 'Sa' });
  await put(`admins/${fin.uid}`, { email: 'fin@t.com', role: 'finance', isActive: true, name: 'Fin' });
  await put(`admins/${sup.uid}`, { email: 'sup@t.com', role: 'support', isActive: true, name: 'Sup' });
  await put(`admins/${off.uid}`, { email: 'off@t.com', role: 'admin', isActive: false, name: 'Off' });
  await put('support_tickets/t1', { status: 'Pending' });
  await put('ledger/l1', { amount: 100, status: 'failed' });
  await put('payment_sessions/ps1', { razorpayPaymentId: 'pay_1', status: 'Captured' });
  await put('bookings/b1', { paymentId: 'pay_1', orderId: 'order_1', amount: 50000, bookingReference: 'REF1', paymentSnapshot: { amount: 50000 } });
});

test('rejects unauthenticated callers', async () => {
  const r = await call('adminUpdateSupportTicket', null, { ticketId: 't1', status: 'Resolved' });
  assert.equal(r.status, 401);
});
test('rejects signed-in non-admins and deactivated admins', async () => {
  assert.equal((await call('adminUpdateSupportTicket', nobody.token, { ticketId: 't1', status: 'Resolved' })).status, 403);
  assert.equal((await call('adminUpdateSupportTicket', off.token, { ticketId: 't1', status: 'Resolved' })).status, 403);
});
test('support role can update a ticket, and it is audit-logged', async () => {
  const r = await call('adminUpdateSupportTicket', sup.token, { ticketId: 't1', status: 'Resolved', adminNotes: 'fixed' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await get('support_tickets/t1')).fields.status.stringValue, 'Resolved');
  const logs = await list('audit_logs');
  assert.ok(logs.some((d) => d.fields.action?.stringValue === 'support_ticket_updated' && d.fields.adminName?.stringValue === 'Sup'));
});
test('ticket input validation', async () => {
  const bad = await call('adminUpdateSupportTicket', sup.token, { ticketId: 't1', status: 'Hacked' });
  assert.equal(bad.status, 400);
  const missing = await call('adminUpdateSupportTicket', sup.token, { ticketId: 'nope', status: 'Resolved' });
  assert.equal(missing.status, 404);
});
test('finance cannot edit tickets; support cannot flag ledger or refund', async () => {
  assert.equal((await call('adminUpdateSupportTicket', fin.token, { ticketId: 't1', status: 'Pending' })).status, 403);
  assert.equal((await call('adminFlagLedgerEntry', sup.token, { ledgerId: 'l1', note: 'x' })).status, 403);
  assert.equal((await call('adminRefundPayment', sup.token, { paymentSessionId: 'ps1', reason: 'x' })).status, 403);
});
test('finance can flag a ledger entry without changing status', async () => {
  const r = await call('adminFlagLedgerEntry', fin.token, { ledgerId: 'l1', note: 'webhook missing' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const doc = await get('ledger/l1');
  assert.equal(doc.fields.status.stringValue, 'failed');
  assert.equal(doc.fields.reconciliation.mapValue.fields.status.stringValue, 'flagged');
  assert.equal((await call('adminFlagLedgerEntry', fin.token, { ledgerId: 'l1', note: '' })).status, 400);
});
test('refund queues once, never edits payment status, and blocks duplicates', async () => {
  const r = await call('adminRefundPayment', fin.token, { paymentSessionId: 'ps1', reason: 'customer request' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const q = await get('manual_refund_queue/pay_1');
  assert.equal(q.fields.status.stringValue, 'pending');
  assert.equal(q.fields.bookingId.stringValue, 'b1');
  assert.equal((await get('payment_sessions/ps1')).fields.status.stringValue, 'Captured');
  const dup = await call('adminRefundPayment', fin.token, { paymentSessionId: 'ps1', reason: 'again' });
  assert.equal(dup.status, 409);
  const noReason = await call('adminRefundPayment', sa.token, { paymentSessionId: 'ps1', reason: '' });
  assert.equal(noReason.status, 400);
});
