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

## 2. Firestore rules (merged file, tested)
Live rules were pulled from `reps-2f5f8` on 2026-11-17 and equal `threereps_user/firestore.rules`
(`firebase-rules/firestore.live-baseline.rules`). The merged file is `firebase-rules/firestore.merged.rules`:
- Keeps every existing mobile-app rule and the legacy `admin` custom-claim access unchanged.
- Adds roster-based roles (`admins/{uid}`: superadmin | admin | ops | finance | support).
- Adds rules for panel collections that were missing and therefore denied: `cms`, `landing_page`,
  `session_patterns`, `ledger`, `audit_logs`, `manual_refund_queue`, `app_config_audit`, `bookings/{id}/notes`.
- `npm run test:rules` (14 tests). Run against the live baseline, the 8 app/claim tests pass and the 6 role tests fail,
  proving the merge changes only what it should.

To publish: Firebase console > Firestore > Rules, paste `firestore.merged.rules`, review the diff, Publish.
(Or `firebase deploy --only firestore:rules` after adding a `firestore.rules` entry to `firebase.json`.)
Rollback: Rules > History > restore the previous release.

Note: staff who log in WITHOUT the `admin` claim get access purely from their `admins/{uid}` roster doc.
Auto-ID roster docs only work for the login fallback; give them the claim or recreate under their Auth UID.

### Storage (optional, higher risk)
Live storage rules let any signed-in user read/write every file. `firebase-rules/storage.proposed.rules`
is a tightened draft but is NOT safe to publish until all app upload paths are listed (see its header).

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
- Support: open a request submitted from the user app (`support_requests`), change its status; check `audit_logs`.
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

## Manual (admin) bookings
Staff with role `admin`, `ops` or `superadmin` can book for a client who isn't using the app: Bookings > New Manual Booking.
- Functions: `adminLookupClient`, `adminPreviewManualBooking`, `adminCreateManualBooking` (`functions/manualBooking.js`).
  They reuse the booking engine's pricing/schedule code (`functions/bookingEngine/pricingResolver.js` is a verbatim copy of
  `threereps_user/functions/bookingEngine/pricingResolver.js`; re-copy it if the engine's pricing changes).
- One transaction creates the booking (`bookingSource: "admin_manual"`, `paymentSnapshot.gateway: "offline"`), a permanent lock
  and a session per date, bumps `counters/bookings`, and writes a `ledger` entry (rupees) and an audit log. Retry-safe via `clientRequestId`.
- New clients get a Firebase Auth user + `users/{uid}` keyed by phone number, so they can later sign in with the same number
  (phone OTP) and see the booking. Google-login clients would not be linked automatically.
- Offline bookings cannot use "Request Refund" (no Razorpay payment); the UI and `adminRequestRefund` say so.
- Not done: service-area check, merge tool for duplicate client accounts, cancel flow that records an offline refund.
- Before first production use, create one test manual booking and open it in the user app to confirm the app tolerates
  `paymentId: null` / `orderId: null` on booking documents.
