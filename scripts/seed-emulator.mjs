// Seeds the LOCAL emulators only (refuses to run otherwise). Usage: node scripts/seed-emulator.mjs
const PROJECT = 'demo-threereps';
const AUTH = 'http://127.0.0.1:9099';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const enc = (v) =>
  typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? { integerValue: String(v) }
  : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } }
  : { stringValue: v };
async function put(path, fields) {
  const r = await fetch(`${FS}/${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, enc(v)])) }),
  });
  if (!r.ok) throw new Error(`${path}: ${await r.text()}`);
}
async function user(email, password) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  return (await r.json()).localId;
}
const accounts = [
  ['superadmin@local.test', 'superadmin', 'Local Superadmin'],
  ['finance@local.test', 'finance', 'Local Finance'],
  ['support@local.test', 'support', 'Local Support'],
];
for (const [email, role, name] of accounts) {
  const uid = await user(email, 'localdev-pass-1');
  await put(`admins/${uid}`, { email, role, name, isActive: true });
}
await put('support_requests/t1', { userId: 'user_demo_1', subject: 'App crash on booking', description: 'It closes when I tap Pay', status: 'open' });
await put('ledger/l1', { transactionId: 'txn_demo_0001', type: 'credit', amount: 1500, userId: 'user_demo_1', status: 'failed', description: 'Subscription' });
await put('payment_sessions/order_demo_1', { orderId: 'order_demo_1', paymentId: 'pay_demo_1', userId: 'user_demo_1', amount: 150000, paymentState: 'success' });
await put('bookings/b1', { paymentId: 'pay_demo_1', orderId: 'order_demo_1', amount: 150000, bookingReference: 'REF-DEMO', paymentSnapshot: { amount: 150000 } });
await put('audit_logs/a1', { action: 'seed', entity: 'demo', adminName: 'Seeder', reason: 'sample row' });
console.log('Seeded. Logins: superadmin@local.test / finance@local.test / support@local.test (password in this script).');
