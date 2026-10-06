# World ID repeated-login session candidate

Candidate publication approved by the user on 2026-10-07. Actual publication evidence will be recorded separately. User reports Android World App 4.0.4300; real-device acceptance is pending.

## Why change

- Device retest on 2026-10-05 showed nullifier_replayed before any authenticated login/verify call. A fixed uniqueness action is not a repeat-login protocol.
- Current npm registry version of @worldcoin/idkit remains 4.4.0; no speculative package upgrade was made.
- Published docs and installed SDK differ: the SDK throws when a session builder uses preset(). This candidate retains the SDK's supported CredentialRequest('proof_of_human') constraints path rather than copying the incompatible preset example.
- The prior malformed_request was native, before backend verification. Its precise cause remains unconfirmed. Neither the new app version nor mocked success proves it is fixed.

## Candidate behavior

- First arrival: create a World ID 4.0 session using a fresh RP signature without an action.
- Returning arrival: request the backend's saved session ID, then prove that same session. Do not silently replace a wallet's saved session.
- Credential requirement remains Proof of Human schema 1. There is no legacy v3 session support or Selfie/Device/Document fallback.
- Bind the proof signal to wallet, Firebase auth_time and single-use request nonce, not merely the wallet. Require complete unchanged SDK results at the external verifier before saving ownership.
- Accept SDK-native decimal proof coordinates. Use the same unsigned-256 decimal guard as the action validator; keep nullifier normalization unchanged.
- Preserve the exact fresh Firebase token through request, proof submission and final profile refresh.
- Profile and protected API checks now require a trusted session for that exact wallet/auth_time; old uniqueness/reward bindings and profile/JWT flags cannot grant access.
- Failed external verification, unknown/mismatched sessions, altered signals, consumed or expired challenges and duplicate accepted proof nullifiers remain blocked.
- Failure logs contain only a fixed event/phase and optional HTTP status; no proof, nonce, session, wallet, signature, token or raw upstream errors.

## Verification

- npm run test:world-id-ui passed: UI callbacks, initial/return entry, original-token profile refresh, malformed request fields, cancellation/error denial and actual installed SDK conversion.
- backend npm run test:auth passed: PGlite transaction/replay/ownership tests, HTTP first and returning session checks, external verifier failures and protected API denial until trusted binding.
- Real installed SDK creates Android verify-v2 envelopes and decodes mocked session success for creation and return. The backend accepts normalized decimal coordinates and rejects envelope-nonce substitution. These are not real cryptographic or native phone proofs.
- The installed SDK rejects presets for sessions and rejects session requests when only native verify-v1 is advertised. No force-version or custom native payload rewrite was added.
- npm run build passed with the existing large-chunk warning.
- Targeted ESLint has zero errors and one existing generation-ref cleanup warning.
- Read-only production schema check: node backend/apply-world-id-migration.js --sessions --cloud, applied=false. Existing world_id_login_requests, world_id_login_sessions and world_id_login_proofs all have RLS and their constraints. No migration is required.
- Local development server is available at http://localhost:5179; it returns HTTP 200. Desktop cannot establish World App native E2E.

## Publication and acceptance gate

- User approved GitHub WorldChallengeBattle/ChallengeON main push and GCP challengeon-wcbflow / asia-northeast3 / challengeon-api candidate deployment and traffic switch. Vercel will automatically build the new frontend.
- Stage the backend without traffic first, verify unchanged environment/secrets and basic health/anonymous denial, then switch as approved. Backend and frontend must be released together because the trusted access source changes from action binding to session binding.
- Current rollback pair: commit 7b38edaf2e727062f829a35fd616a50d87979149 and Cloud Run challengeon-api-00032-ney. Rollback restores the known fixed-action replay problem; it is not a successful authentication solution.
- Do not change production DB rows/schema, Portal actions/metadata, signing keys, contract balances, rewards or external scheduler jobs.
- Acceptance requires two real-device tests on Android 4.0.4300: first session creation and return after a fresh wallet login. Require external verification and trusted app/API access, not just the native green check.
- If native malformed_request persists, no server-verification call will occur. Record the sanitized error/version and obtain provider clarification or a demonstrated supported transport before declaring success. Never grant access from native errors or create rotating uniqueness actions to avoid replay policy.

## References

- https://docs.world.org/world-id/idkit/react
- https://docs.world.org/world-id/idkit/javascript
- https://docs.world.org/world-id/idkit/session-proofs
- Installed node_modules/@worldcoin/idkit-core/dist/index.js: session preset rejection, native compile/response conversion.
