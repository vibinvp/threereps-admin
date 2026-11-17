import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

// Compose the admin snippet with stub "shared" rules, mimicking a merged live ruleset.
const snippet = fs.readFileSync('firebase-rules/admin-panel.firestore.rules', 'utf8');
const rules = `rules_version = '2';
service cloud.firestore { match /databases/{database}/documents {
${snippet}
match /users/{id} { allow read, write: if request.auth != null && request.auth.uid == id || isAdmin(); }
}}`;

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-threereps',
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
});
after(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins/sa'), { role: 'superadmin', isActive: true, email: 'sa@x.com' });
    await setDoc(doc(db, 'admins/ad'), { role: 'admin', isActive: true });
    await setDoc(doc(db, 'admins/fin'), { role: 'finance', isActive: true });
    await setDoc(doc(db, 'admins/ops'), { role: 'ops', isActive: true });
    await setDoc(doc(db, 'admins/off'), { role: 'admin', isActive: false });
    await setDoc(doc(db, 'admins/weird'), { role: 'hacker', isActive: true });
    await setDoc(doc(db, 'ledger/l1'), { amount: 5 });
    await setDoc(doc(db, 'payment_sessions/p1'), { status: 'Captured' });
    await setDoc(doc(db, 'support_tickets/t1'), { status: 'Pending' });
    await setDoc(doc(db, 'audit_logs/a1'), { action: 'x' });
    await setDoc(doc(db, 'banners/b1'), { title: 'hi' });
    await setDoc(doc(db, 'landing_page/home'), { hero: 'x' });
  });
});
const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

test('anonymous users cannot read admin data', async () => {
  await assertFails(getDoc(doc(anon(), 'ledger/l1')));
  await assertFails(getDoc(doc(anon(), 'audit_logs/a1')));
  await assertFails(getDoc(doc(anon(), 'admins/sa')));
});
test('public content is world-readable but not writable', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'banners/b1')));
  await assertSucceeds(getDoc(doc(anon(), 'landing_page/home')));
  await assertFails(setDoc(doc(anon(), 'banners/b2'), { t: 1 }));
});
test('active admins read finance + audit data', async () => {
  await assertSucceeds(getDoc(doc(as('fin'), 'ledger/l1')));
  await assertSucceeds(getDoc(doc(as('ad'), 'payment_sessions/p1')));
  await assertSucceeds(getDoc(doc(as('ad'), 'audit_logs/a1')));
});
test('client writes to money/support/audit collections are denied even for superadmin', async () => {
  await assertFails(updateDoc(doc(as('sa'), 'ledger/l1'), { amount: 0 }));
  await assertFails(updateDoc(doc(as('sa'), 'payment_sessions/p1'), { status: 'Refunded' }));
  await assertFails(updateDoc(doc(as('sa'), 'support_tickets/t1'), { status: 'Resolved' }));
  await assertFails(setDoc(doc(as('sa'), 'audit_logs/a2'), { action: 'forged' }));
});
test('deactivated admins and unknown roles get no access', async () => {
  await assertFails(getDoc(doc(as('off'), 'ledger/l1')));
  await assertFails(getDoc(doc(as('weird'), 'ledger/l1')));
});
test('non-admin signed-in users get no admin access', async () => {
  await assertFails(getDoc(doc(as('random-user'), 'ledger/l1')));
  await assertFails(setDoc(doc(as('random-user'), 'banners/b3'), { t: 1 }));
});
test('content writes are role-scoped: admin yes; finance/support/anon no', async () => {
  await assertSucceeds(setDoc(doc(as('ad'), 'banners/b4'), { t: 1 }));
  await assertFails(setDoc(doc(anon(), 'banners/b5'), { t: 1 }));
  await assertFails(setDoc(doc(as('fin'), 'banners/b6'), { t: 1 }));
  await assertFails(setDoc(doc(as('fin'), 'cms/c1'), { t: 1 }));
});
test('ops can edit banners but not cms/legal', async () => {
  await assertSucceeds(setDoc(doc(as('ops'), 'banners/b7'), { t: 1 }));
  await assertFails(setDoc(doc(as('ops'), 'cms/c2'), { t: 1 }));
  await assertSucceeds(setDoc(doc(as('ad'), 'cms/c3'), { t: 1 }));
});
test('admins roster: only superadmin writes; admins can read; self-read ok', async () => {
  await assertSucceeds(setDoc(doc(as('sa'), 'admins/new'), { role: 'support', isActive: true }));
  await assertFails(setDoc(doc(as('ad'), 'admins/new2'), { role: 'superadmin', isActive: true }));
  await assertFails(updateDoc(doc(as('ad'), 'admins/ad'), { role: 'superadmin' }));
  await assertSucceeds(getDoc(doc(as('fin'), 'admins/fin')));
  await assertFails(getDoc(doc(as('random-user'), 'admins/sa')));
});
