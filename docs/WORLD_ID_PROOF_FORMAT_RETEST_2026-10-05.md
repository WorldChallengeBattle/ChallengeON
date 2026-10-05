# Native success and backend proof-format follow-up

## Observed device and production evidence

- User supplied refreshed screenshot/1.jpg, 2.jpg and 3.jpg on 2026-10-05.
- The native consent dialog now opens and World App displays verification success.
- The application then displays: Human login verification failed; start a new sign-in request.
- Cloud Run revision challengeon-api-00030-jug recorded POST /api/auth/world-id/login/verify HTTP 400 at 05:52:28 and 05:53:01 UTC. Request latencies were 0.114 and 0.039 seconds.
- Native success does not establish upstream verification or trusted database binding. Production does not currently record the failing verification phase or raw proof payload.

## Reproduced local defect

- Installed @worldcoin/idkit-core 4.4.0 parses the native v4 proof into five decimal strings (parseProof), while its nullifier remains hexadecimal (parseNullifier/fieldElement).
- A synthetic native v4 success response passed through the actual installed SDK produced proof ["1", "2", "3", "4", "5"]. The previous backend rejected that SDK output with Proof of Human schema 1 is required.
- The login-only v4 validator now accepts canonical unsigned decimal proof coordinates below 2^256. Legacy v3 proof encoding and shared nullifier normalization are unchanged.
- Results continue to be forwarded unchanged to the official verifier. Cryptographic verification, schema 1, production environment, action, wallet/auth-time/nonce signal binding, single-use challenges and unique identity ownership remain mandatory.
- Added secret-free failure diagnostics containing fixed phase names and optional HTTP status only. No request, proof, nonce, wallet, signature, token or raw upstream errors are logged.

## Verification and rollout boundary

- Real installed SDK test reproduces the pre-fix failure and passes after the fix. Native v3 compatibility also passes.
- Local frontend auth/UI/native regression tests and backend auth tests pass; these are mock/local checks, not live cryptographic or phone E2E verification.
- The precise production failure phase remains unconfirmed; this is a demonstrated compatibility defect, not a claim that all login failures are resolved.
- Candidate publication requires new approval: GitHub WorldChallengeBattle/ChallengeON main and Cloud Run challengeon-wcbflow / asia-northeast3 / challengeon-api. Vercel will rebuild from the approved commit.
- No production DB migration, Portal action/metadata change, signing-key rotation, reward enablement, scheduler change or contract transaction is required.
- After publication, verify the active revision and frontend commit, then retest native consent, server proof verification, trusted profile and access on the user's Android World App. If rejected, inspect only the sanitized failure phase/status.
