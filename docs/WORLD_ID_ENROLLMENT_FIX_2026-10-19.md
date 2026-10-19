# World ID Enrollment and Wallet Login Fix

## Behavior

First enrollment uses the official IDKit `IDKitRequestWidget` with the fixed
`challengeon-human-login` action, `proofOfHuman`, and `allow_legacy_proofs: true`.
The server accepts only v4 Proof of Human schema 1 or legacy v3 Orb, bound to the
authenticated wallet, its login time, and a single-use request nonce. It verifies
the full result with World before storing the unique human-to-wallet binding.

Returning users prove wallet ownership through SIWE. The server checks their
existing verified enrollment and binds authorization to the current Firebase
`auth_time`. It does not repeat a one-time uniqueness action. A native error,
client profile flag, wallet balance, or wallet-auth claim alone cannot establish
human enrollment. Older login tokens cannot downgrade a newer login binding.

This checks the stored human enrollment on each login; it does not generate a
new biometric proof every time. A newly revoked/changed World credential is not
detected merely by reading an existing enrollment. Fresh human-session proofs
are no longer required for entry. Existing server-verified session authorizations
remain valid for their original login while older clients transition.

Same-wallet reauthentication now waits for the server's enrollment check and
profile confirmation before returning a token to a protected operation. The UI
locks during wallet reauthentication. Concurrent callers share one refresh.
The wallet refresh threshold leaves time for the full five-minute proof request
within the backend's fifteen-minute recent-wallet policy.

## Verification

- Backend `npm run test:auth`: passed, including exact v3/v4 proof validation,
  transactional binding, replay/cross-wallet denial, returning enrollment reuse,
  old-login downgrade denial, API gates, and profile store failures.
- Root `npm run test:world-id-ui`: passed, including the actual active component
  matching the standard SDK request and the same-UID wallet-refresh regression.
- `npm run build`: passed; existing large-chunk warning remains.
- Production Supabase schema read: both existing human-login tables have RLS
  and expected constraints. No schema migration was applied.
- Public legacy precheck for the existing login action: 200, active action,
  production app, max_verifications=1. No action was created or edited.
- The same fixed action is already configured in the Cloud Run environment.

Tests use offline signing, mocked native completion and mocked upstream proof
responses. They do not establish successful production-phone authentication.
The previous Android session `malformed_request` rejection predicate remains
unidentified; this release removes that session request from the entry flow.

## Release Scope

Targets: WorldChallengeBattle/ChallengeON main; GCP challengeon-wcbflow,
asia-northeast3, challengeon-api; Vercel un-on/challenge-on and its operating
aliases. Build a zero-traffic backend revision, smoke-test it, then switch
traffic and publish the matching frontend. Preserve environment values, secret
versions, service account, reward pause, scheduler settings and contracts.

No private credentials, real proof material, screenshot files, existing
untracked reports, or unrelated project changes belong in this publication.

## References

- https://docs.world.org/world-id/idkit/mini-apps
- https://docs.world.org/world-id/idkit/credentials
- https://docs.world.org/mini-apps/commands/wallet-auth
