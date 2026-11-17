// Tests the MERGED ruleset (live baseline + admin roles). Run: npm run test:rules
import { test, before, after, beforeEach } from 'node:test';
import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-threereps',
    firestore: { rules: fs.readFileSync('firebase-rules/firestore.merged.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const seed = {
      'admins/sa': { role: 'superadmin', isActive: true, email: 'sa@x.com' },
      'admins/ad': { role: 'admin', isActive: true, email: 'ad@x.com' },
      'admins/ops': { role: 'ops', isActive: true },
      'admins/fin': { role: 'finance', isActive: true },
      'admins/sup': { role: 'support', isActive: true },
      'admins/off': { role: 'admin', isActive: false },
      'admins/weird': { role: 'hacker', isActive: true },
      'admins/autoid1': { role: 'admin', isActive: true, email: 'legacy@x.com' },
      'users/u1': { name: 'U1' }, 'users/u2': { name: 'U2' },
      'trainers/t1': { name: 'T1' },
      'bookings/b1': { userId: 'u1', trainerId: 't1' },
      'bookings/b1/notes/n1': { text: 'hi' },
      'sessions/s1': { userId: 'u1', trainerId: 't1' },
      'payment_sessions/p1': { userId: 'u1' },
      'support_requests/r1': { userId: 'u1', status: 'open' },
      'ledger/l1': { amount: 5 }, 'audit_logs/a1': { action: 'x' }, 'manual_refund_queue/q1': { status: 'pending' },
      'banners/b1': { t: 1 }, 'cms/c1': { t: 1 }, 'landing_page/home': { t: 1 }, 'legal_content/tos': { t: 1 },
      'trainer_tiers/gold': { t: 1 }, 'app_config/x': { t: 1 },
    };
    for (const [path, data] of Object.entries(seed)) await setDoc(doc(db, path), data);
  });
});
const as = (uid, claims) => env.authenticatedContext(uid, claims).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const d = (db, path) => doc(db, path);

// ---------- Regression: behaviour the mobile apps depend on (unchanged from live) ----------
test('apps: guests browse public catalog, cannot write it', async () => {
  for (const p of ['trainers/t1', 'banners/b1', 'trainer_tiers/gold', 'legal_content/tos']) await assertSucceeds(getDoc(d(anon(), p)));
  await assertFails(setDoc(d(anon(), 'banners/x'), { t: 1 }));
  await assertFails(updateDoc(d(anon(), 'trainers/t1'), { name: 'x' }));
});
test('apps: users read/write only their own profile', async () => {
  await assertSucceeds(getDoc(d(as('u1'), 'users/u1')));
  await assertSucceeds(updateDoc(d(as('u1'), 'users/u1'), { name: 'New' }));
  await assertFails(getDoc(d(as('u1'), 'users/u2')));
  await assertFails(updateDoc(d(as('u1'), 'users/u2'), { name: 'x' }));
});
test('apps: users/trainers read their own bookings & sessions; no client writes', async () => {
  await assertSucceeds(getDoc(d(as('u1'), 'bookings/b1')));
  await assertSucceeds(getDoc(d(as('t1'), 'bookings/b1')));
  await assertSucceeds(getDoc(d(as('u1'), 'sessions/s1')));
  await assertFails(getDoc(d(as('u2'), 'bookings/b1')));
  await assertFails(updateDoc(d(as('u1'), 'bookings/b1'), { x: 1 }));
  await assertFails(getDoc(d(as('u1'), 'bookings/b1/notes/n1')));
});
test('apps: users create their own support request only, and read only their own', async () => {
  await assertSucceeds(setDoc(d(as('u1'), 'support_requests/new'), { userId: 'u1', subject: 's', description: 'd', status: 'open' }));
  await assertFails(setDoc(d(as('u1'), 'support_requests/forged'), { userId: 'u2', subject: 's' }));
  await assertSucceeds(getDoc(d(as('u1'), 'support_requests/r1')));
  await assertFails(getDoc(d(as('u2'), 'support_requests/r1')));
  await assertFails(updateDoc(d(as('u1'), 'support_requests/r1'), { status: 'resolved' }));
});
test('apps: users cannot touch admin-panel collections', async () => {
  for (const p of ['ledger/l1', 'audit_logs/a1', 'manual_refund_queue/q1', 'admins/sa']) await assertFails(getDoc(d(as('u1'), p)));
  await assertFails(setDoc(d(as('u1'), 'cms/x'), { t: 1 }));
});
test('anonymous gets nothing private', async () => {
  for (const p of ['users/u1', 'bookings/b1', 'ledger/l1', 'admins/sa', 'support_requests/r1']) await assertFails(getDoc(d(anon(), p)));
});

// ---------- Legacy custom-claim admins keep full access (old Flutter admin) ----------
test('claim admin: full read/write like before', async () => {
  const db = as('legacy', { admin: true });
  await assertSucceeds(getDoc(d(db, 'users/u1')));
  await assertSucceeds(setDoc(d(db, 'banners/new'), { t: 1 }));
  await assertSucceeds(setDoc(d(db, 'trainers/t9'), { name: 'x' }));
  await assertSucceeds(setDoc(d(db, 'admins/someone'), { role: 'admin' }));
  await assertSucceeds(updateDoc(d(db, 'support_requests/r1'), { status: 'resolved' }));
  await assertFails(updateDoc(d(db, 'bookings/b1'), { x: 1 })); // still function-only
});

// ---------- Roster roles ----------
test('roster: inactive and unknown roles get nothing', async () => {
  await assertFails(getDoc(d(as('off'), 'ledger/l1')));
  await assertFails(getDoc(d(as('weird'), 'users/u1')));
  await assertFails(getDoc(d(as('nobody-listed'), 'users/u1')));
});
test('roster: all staff can read operational data, nobody writes bookings/money from the client', async () => {
  for (const uid of ['sa', 'ad', 'ops', 'fin', 'sup']) {
    await assertSucceeds(getDoc(d(as(uid), 'bookings/b1')));
    await assertSucceeds(getDoc(d(as(uid), 'bookings/b1/notes/n1')));
    await assertSucceeds(getDoc(d(as(uid), 'audit_logs/a1')));
    await assertFails(updateDoc(d(as(uid), 'bookings/b1'), { x: 1 }));
    await assertFails(updateDoc(d(as(uid), 'payment_sessions/p1'), { status: 'Refunded' }));
    await assertFails(setDoc(d(as(uid), 'audit_logs/forged'), { action: 'x' }));
  }
});
test('roster: ledger readable by finance/admin/superadmin only', async () => {
  for (const uid of ['sa', 'ad', 'fin']) await assertSucceeds(getDoc(d(as(uid), 'ledger/l1')));
  for (const uid of ['ops', 'sup']) await assertFails(getDoc(d(as(uid), 'ledger/l1')));
  await assertFails(updateDoc(d(as('sa'), 'ledger/l1'), { amount: 0 }));
});
test('roster: ops-level content (banners/trainers) vs admin-level content (cms/tiers/legal)', async () => {
  await assertSucceeds(setDoc(d(as('ops'), 'banners/o1'), { t: 1 }));
  await assertSucceeds(updateDoc(d(as('ops'), 'trainers/t1'), { name: 'ok' }));
  await assertFails(setDoc(d(as('ops'), 'cms/o2'), { t: 1 }));
  await assertFails(setDoc(d(as('ops'), 'trainer_tiers/silver'), { t: 1 }));
  await assertSucceeds(setDoc(d(as('ad'), 'cms/a1'), { t: 1 }));
  await assertSucceeds(setDoc(d(as('ad'), 'legal_content/privacy'), { t: 1 }));
  for (const uid of ['fin', 'sup']) {
    await assertFails(setDoc(d(as(uid), 'banners/x'), { t: 1 }));
    await assertFails(updateDoc(d(as(uid), 'trainers/t1'), { name: 'x' }));
    await assertFails(setDoc(d(as(uid), 'cms/x'), { t: 1 }));
  }
});
test('roster: support staff manage support requests; finance cannot', async () => {
  await assertSucceeds(getDoc(d(as('sup'), 'support_requests/r1')));
  await assertSucceeds(updateDoc(d(as('sup'), 'support_requests/r1'), { status: 'resolved' }));
  await assertFails(getDoc(d(as('fin'), 'support_requests/r1')));
  await assertFails(deleteDoc(d(as('sup'), 'support_requests/r1')));
  await assertSucceeds(deleteDoc(d(as('ad'), 'support_requests/r1')));
});
test('roster: only superadmin writes the roster; people read their own entry', async () => {
  await assertSucceeds(setDoc(d(as('sa'), 'admins/new'), { role: 'support', isActive: true }));
  await assertFails(setDoc(d(as('ad'), 'admins/new2'), { role: 'superadmin' }));
  await assertFails(updateDoc(d(as('ad'), 'admins/ad'), { role: 'superadmin' }));
  await assertSucceeds(getDoc(d(as('fin'), 'admins/fin')));
  await assertFails(getDoc(d(as('u1'), 'admins/sa')));
});
test('roster: legacy auto-ID admin docs are readable by their own email only (login fallback)', async () => {
  const db = env.authenticatedContext('some-uid', { email: 'legacy@x.com' }).firestore();
  await assertSucceeds(getDocs(query(collection(db, 'admins'), where('email', '==', 'legacy@x.com'))));
  await assertFails(getDocs(query(collection(db, 'admins'), where('email', '==', 'sa@x.com'))));
});
