# Login-only Proof of Human candidate

## Status and scope

This document records the local implementation/validation snapshot before publication. The user subsequently approved the exact operational scope below on 2026-10-05. The production login action was registered and the two new verification tables were applied after that approval. Deployment/phone results are recorded separately in the release handoff; local tests are not phone E2E evidence.

The implementation uses the existing app/RP/signer and adds a separate action, challengeon-human-login. The welcome reward action, signing key, legacy session implementation, contracts, rewards, and Scheduler jobs are unchanged. No live service startup, authenticated production proof request, or operational job was performed during local testing.

## Authentication contract

- Wallet login remains required; the backend validates wallet ownership claims and recent auth_time.
- POST /api/auth/world-id/login/request issues a server-signed production uniqueness request for the login-only action, expiring after 300 seconds. Issuance is limited to ten requests per wallet per ten minutes.
- The signal is wallet:auth_time:nonce. Both protocols cryptographically bind this fresh signal, so replacing a legacy envelope nonce alone cannot reuse an old proof.
- The UI uses IDKitRequestWidget and proofOfHuman with Orb legacy compatibility, instead of the failing session command. It checks wallet, action, app/RP IDs, nonce shape, and challenge signal before opening the widget.
- Verification uses the original request token, not a token fetched from a possibly replaced Firebase User object.
- POST /api/auth/world-id/login/verify accepts only v4 Proof of Human schema 1 or v3 Orb. Device, selfie, document, staging, session proofs, and wrong-action proofs are rejected.
- Forward the complete original IDKit result to the official v4 verifier. Require the correct production action, credential result, and matching nullifier. Do not fabricate verification_level or rewrite response identifiers.
- Lock and revalidate the challenge in a DB transaction; update the trusted same-owner identity and consume the nonce atomically.
- The trusted row is bound to auth_time. Reopening within the same authenticated login may reuse it; a new wallet login requires a fresh proof. Older concurrent login requests cannot replace a more recent verified login.
- Profile flags, JWT human flags, old reward bindings, and old World ID sessions cannot unlock the new access gate. Only the trusted new login row can.
- Each protocol/credential nullifier has one wallet owner. An existing wallet cannot silently replace its identity or switch proof protocol. Protocol switching fails closed and will need a separately reviewed migration if required; v3 and v4 nullifiers are not assumed interchangeable.
- Welcome reward claims remain separate and unchanged. Repeated login never creates a welcome binding or grants tokens.

## Local verification evidence

- npm run test:world-id-ui: passed, including fresh-token use, invalid request denial, server-success-only callbacks, cancellation, sanitized native diagnostics, and both native request serializers.
- The real installed IDKit 4.4.0 normalizes a mocked verify-v1 Orb response; that unchanged result passes the new backend structural validator.
- backend npm run test:auth: passed. New tests use PGlite and local HTTP, offline RP signing, and a MOCKED upstream verifier. They cover first/repeated login, fresh signal, consumed nonce, cross-wallet binding, identity/protocol replacement, older auth_time, verifier rejection, storage failure, rate limit, RLS, and reward/session table isolation.
- Protected API HTTP tests: wallet-only/forged-human claims denied; new verified login allowed; new auth_time denied until a fresh proof succeeds; unavailable storage denies access.
- npm run test:discovery: passed.
- npm run build: passed; existing bundle-size warning remains.
- Targeted frontend ESLint: zero errors; one warning on unchanged AuthContext effect cleanup remains.
- git diff --check: passed.
- Existing local frontend http://localhost:5179 returns 200. Actual desktop UI shows World App-only denial and Retry sign-in; protected feed remains hidden.

These checks do NOT establish Android World App acceptance, production proof validity, legacy action availability, or repeated native login support. Actual phone first AND repeat login are release acceptance requirements. Native nullifier_replayed must remain a failed verification, never a shortcut to access.

## Proposed operational targets - approval required

1. World Portal app_a5a8b0a2d65c376bf242d317a9f4ac78: create production action challengeon-human-login. No welcome-action change, key rotation, metadata edit, or review resubmission.
2. Supabase lkblcvkdwwyotcnhuunm: add world_id_human_login_requests and world_id_human_logins using backend/migrations/20261005_world_id_human_login.sql. Both have RLS enabled and PUBLIC privileges revoked. Existing user/reward/session tables and rows are not rewritten or deleted.
3. GCP challengeon-wcbflow / asia-northeast3 / challengeon-api: add only WORLD_ID_LOGIN_ACTION=challengeon-human-login, retain existing secret versions and all other settings, build a zero-traffic candidate, and validate it before traffic cutover.
4. GitHub WorldChallengeBattle/ChallengeON main and Vercel un-on/challenge-on: publish the coordinated backend/frontend implementation after approval. Exclude real .env files, credentials, screenshots, and inspection artifacts.
5. Verify the actual commit, live bundle, backend revision/traffic, CORS, anonymous denial, and unchanged job/reward settings. Then test on the affected phone and inspect only safe status/path evidence.

Apply the new tables/config before routing to the candidate. Publishing just the frontend would produce missing login endpoints. Switching just the backend would temporarily require re-verification which the old frontend cannot complete; coordinate cutover and reopen the mini app after publication. Existing session attestations are deliberately not imported as fresh login attestations.

Prepared migration command, NOT executed:

```powershell
node backend/apply-world-id-migration.js --human-login --cloud
node backend/apply-world-id-migration.js --human-login --cloud --apply
```

Do not reapply when target tables already exist. Rollback must restore the compatible prior frontend/backend pair; keep new tables rather than deleting identity/replay records. Obtain action-time approval for rollback.

## Primary sources

- https://docs.world.org/world-id/idkit/mini-apps
- https://docs.world.org/api-reference/developer-portal/verify
