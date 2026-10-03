# Production Release - 2026-10-04

## Approved Scope

The user approved the two Supabase authentication tables, server-only World ID
signing key registration, Cloud Run and Vercel deployment, and Git publication
including the existing UX changes. Reward activation, reward-pool funding, Safe
transactions and World Portal contract allowlist changes are excluded.

## Applied Production Changes

- Supabase project `lkblcvkdwwyotcnhuunm`: applied
  `backend/migrations/20261003_world_id.sql` once. Both tables have RLS enabled;
  request nonce primary key and identity/wallet uniqueness constraints verified.
  Existing application records were not rewritten by this migration.
- GCP project `challengeon-wcbflow`: created server-only secret
  `challengeon-world-id-signing-key`, version 1; granted secret access to
  `challengeon-api@challengeon-wcbflow.iam.gserviceaccount.com`.
- Locally recovered the signing address and checked it matches registered RP
  signer `0xD6790da916e0a46bf570EA037121c68f9340AAcc`. No key is in Git.
- Cloud Run service `challengeon-api`, region `asia-northeast3`: built image
  `sha256:4bd5d5035eecb14d9bb81d4909590a94ed5890f58d79e7f44b9d201bf1845d5b`,
  verified a zero-traffic preview, then routed 100% to
  `challengeon-api-00018-sig`.
- CORS permits `https://challenge-on-un-on.vercel.app` and
  `https://challenge-on-gamma.vercel.app`; unrelated origins receive no CORS
  permission. Existing runtime secret bundle remains pinned to version 4.
- Startup maintenance and in-process jobs remain disabled. Welcome rewards
  remain disabled; migration is disabled. No token or Safe transaction sent.

## Verification

- Preview `/health` and `/api/chain-config` returned 200. Config reports chain
  480 and the replacement UNON token and managers; onboarding and migration
  are false. Both configured frontend origins passed preflight.
- Unauthenticated `/api/auth/world-id/request` returned 401.
- Production read API returned 77 challenges in the release checks; older
  documents' 72-item snapshots describe earlier checks, not current counts.
- Local frontend build and backend authentication tests passed. Discovery and
  playback safety checks are rerun before publication. IDKit WASM is emitted.
- Profile has separate World ID verification so actual-account proof can be
  tested while token rewards are disabled. Verification state comes from the
  trusted backend binding, not a client profile flag.
- `.gcloudignore` excludes local secrets, credentials and unrelated frontend/
  GoodOn files from backend source uploads. Source upload and Git candidate
  scans found no RP private key or PEM private key.

## Remaining Gates

- Git push triggers the Vercel production build from `main`; verify Ready and
  the published commit before reporting frontend deployment as complete.
- A real user must reopen World App, sign in and use Profile > Verify World ID.
  Native transport, real Proof of Human and authenticated profile writes have
  not been established by mock tests or desktop inspection.
- Keep rewards off until real proof verification, historical duplicate
  eligibility review and separate reward activation approval are complete.
- World ID 4.0-only policy currently excludes legacy-only credentials.
- Historical obligation audit, approved pool funding and World Portal
  transaction allowlist review remain separate work. Existing dependency
  audit still reports 17 high backend production findings; no critical findings
  remain. Bundle size warning remains.
- Bounded expired-request cleanup and Firestore nonce TTL are not configured;
  server-side request expiration does not depend on those cleanup jobs.

## Rollback

Previous production backend revision: `challengeon-api-00011-gv9`. Rollback
traffic only after assessing frontend contract compatibility: that revision
serves old configuration, which the new frontend deliberately rejects. Do not
restore old reward paths, signing keys or token deployment execution.

The preparation document `UNON_APP_CUTOVER_2026-10-03.md` is historical;
this release record supersedes its pending schema/key/backend publication
statements. It does not assert real-account or token-claim E2E success.
