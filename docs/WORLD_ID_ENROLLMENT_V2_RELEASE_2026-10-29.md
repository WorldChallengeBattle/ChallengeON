# Fixed Enrollment V2 Release

## Scope

- User authorized the fixed-action recovery and production deployment.
- App: `app_a5a8b0a2d65c376bf242d317a9f4ac78`.
- RP: `rp_cba96127b0447fa4`; signer and signing secret unchanged.
- New fixed action: `challengeon-human-enroll-v2`, production registration confirmed.
- No rotating per-login action, native-error bypass, or reward-eligibility reset.
- Nonce, signal, wallet, auth-time, upstream proof validation, and binding checks
  remain required. Returning verified wallets reuse their binding.

## Migration

`backend/migrations/20261027_world_id_enrollment_v2.sql` was applied to Supabase
project `lkblcvkdwwyotcnhuunm` using the approved cloud configuration.

The migration locks both enrollment tables and aborts if any verified enrollment
exists. It keeps historical requests, RLS, ownership constraints, and all other
tables. Only the new action may create a verified enrollment. Both application
validators reject old-action proofs. No identity or request rows were deleted.

## Local Verification

- `npm run test:world-id-ui`: passed, including native replay never granting access.
- Backend `npm run test:auth`: passed, including refusal to migrate a nonempty
  enrollment table, rollback without binding loss, historical request retention,
  old-action rejection, and first/returning wallet authorization.
- Backend `npm run test:cron` and `npm run test:secrets`: passed.
- `npm run build`: passed; existing large-bundle warning remains.
- Cloud upload inventory: no environment files, private keys, Firebase service
  account files, screenshots, or GoodOn tree included.

These checks use local fixtures and mocked native/upstream completion. They do
not establish that an Android production proof succeeds.

## Deployment Targets

- Cloud Run: `challengeon-wcbflow / asia-northeast3 / challengeon-api`.
- Candidate revision: `challengeon-api-human-enroll-v2-1029`.
- Runtime override: `WORLD_ID_LOGIN_ACTION=challengeon-human-enroll-v2`.
- Existing runtime/signing secret references are preserved.
- GitHub: `WorldChallengeBattle/ChallengeON`, `main`.
- Vercel: `un-on/challenge-on`.
- `challengeon-trend-sync` and `challengeon-video-maintenance` remain enabled.
- `ONBOARDING_REWARDS_ENABLED=false` remains unchanged.

Cloud Run cutover completed: revision `challengeon-api-human-enroll-v2-1029`
serves 100% of production traffic. Image digest:
`sha256:5b342079a2517c35b0d546d732485367065fdbec57e5f78a53cc7aa3d9c7aaaf`.

Candidate smoke checks passed: health/config 200; anonymous profile, challenges,
login request/verify, and internal job requests 401; both production frontend
origins receive the expected CORS preflight 204. Runtime inspection confirms the
new fixed action, paused rewards, and unchanged runtime/signing secret versions.
Portal production precheck returns 200 and the new action is active. This is
configuration evidence, not a human-proof verification.

Expected frontend entry asset from the verified local build:
`/assets/index-BfSJRdj_.js`. GitHub publication triggers Vercel deployment; the
production alias check must additionally confirm this entry asset and fixed action.

## Device Acceptance Check

Close and reopen the Mini App, sign in with the same wallet, and approve human
verification. Confirm `/login/verify` succeeds and exactly one binding is stored.
Then reopen it again and confirm the verified binding avoids another uniqueness
proof. If it fails, record the displayed error and attempt time; never grant
access based solely on `nullifier_replayed`.
