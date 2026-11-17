# Deploying the 3REPS admin panel

Firebase project: `reps-2f5f8` (shared with the user and trainer apps; there is no staging project).
Web hosting: Vercel (region `bom1`, close to the `asia-south1` functions).

## 0. Pre-flight (once)
- [ ] **Admin roles.** Cloud Functions now accept only `superadmin | admin | ops | finance | support`
      (`validateAdmin` in `functions/index.js`). In Firebase console > Firestore > `admins`, make sure every
      active admin has one of these `role` values and `isActive` is not `false`. Others are locked out.
- [ ] **Admin doc IDs.** Firestore rules match `admins/{auth uid}`. Any roster doc with an auto-ID must be
      recreated under the person's Auth UID (the panel's email fallback works, rules cannot).
- [ ] `npm test` passes (needs JDK 21: `export JAVA_HOME=$(/usr/libexec/java_home -v 21)`).
- [ ] `npm run build` and `npm run lint` pass.

## 1. Cloud Functions (admin codebase only)
```bash
firebase deploy --only functions:admin --project reps-2f5f8
```
- Touches only functions labelled codebase `admin` (the 6 existing `admin*` ones + `adminQueuePaymentRefund`,
  `adminFlagLedgerEntry`, `adminUpdateSupportTicket`). The user-app backend (default codebase) is untouched.
- Runtime is Node.js 22 (`functions/package.json`); Node 20 was decommissioned 2026-10-30.
- Do not pass `--force`. If the CLI proposes deleting a function you don't recognise, answer **No**.
- Name note: the user-app backend already has its own `adminRefundPayment` (us-central1). Ours is
  `adminQueuePaymentRefund` on purpose.

## 2. Firestore / Storage rules (MERGE, don't replace)
The live ruleset also serves the mobile apps. Do not deploy `firebase-rules/*` as-is.
1. Firebase console > Firestore > Rules: copy the live rules.
2. Merge the helpers/blocks from `firebase-rules/admin-panel.firestore.rules` (see its header).
3. Add `|| isAdmin()` to the shared collections it lists. Check the mobile apps' writes to `support_tickets`
   before locking client writes.
4. Test with the Rules Playground, then Publish. Repeat for Storage with `admin-panel.storage.rules`.
Indexes: `firestore.indexes.json` may not include the mobile apps' indexes. Do **not** run
`firebase deploy --only firestore:indexes` blindly (it offers to delete indexes missing from the file).

## 3. Web app on Vercel
1. Push the repo to GitHub, then Vercel > Add New Project > import it (framework: Next.js, auto-detected).
2. Set the env vars from `.env.example` for Production **and** Preview. `FIREBASE_PRIVATE_KEY` is a secret.
   Leave `NEXT_PUBLIC_USE_FIREBASE_EMULATORS` unset or `false`.
3. Deploy. Open the Preview URL first and verify (section 4) before promoting to Production.
4. Firebase console > Authentication > Settings > Authorized domains: add the `*.vercel.app` domain
   (and your custom domain later).
5. Rotate the service-account key if it was ever shared or committed; keep it only in Vercel.

## 4. Smoke test on the deployed URL
- `/dashboard` while logged out redirects to `/login`.
- Log in as superadmin; the sidebar shows all sections. Log in as a finance/support user; only their sections.
- Support: update a ticket; check `audit_logs` has an entry.
- Payments: queue a refund on a TEST booking only; confirm `manual_refund_queue/{paymentId}` is `pending`
  and that `processRefundQueue` (user-app backend) picks it up.
- Log out; `/dashboard` redirects to `/login` again.
- Check Vercel and `firebase functions:log` for errors.

## 5. Rollback
- Web: Vercel > Deployments > previous deployment > Promote.
- Functions: redeploy the previous git commit with the same command.
- Rules: Firebase console > Rules > History > restore.

## Known follow-ups
- `testDeleteBooking` (asia-south1) is still live in the user-app backend. The panel no longer calls it;
  confirm it checks admin auth, or delete it there.
- Custom domain (`admin.threereps.com`) later: add in Vercel, add DNS record, add to Auth authorized domains.
- ~95 `any` types still warn in lint; the `/dashboard/trainer-tiers` etc. older pages lack some error states.
