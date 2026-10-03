# World ID Verification Fix - 2026-10-04

## Live Read-Only Findings

- Recent POST `/api/auth/world-id/verify` calls on backend revision
  `challengeon-api-00020-sux` returned HTTP 400.
- Read-only aggregate query found four issued requests, zero consumed requests
  and zero persisted identity bindings. No wallet, nullifier or proof printed.
- The profile's Human Identity Verified badge was unconditional. Wallet login
  therefore displayed a human status that the server had not established.
- IDKit 4.3.0's installed `hashSignal` interprets valid 0x-prefixed signals as
  bytes. Our server hashed wallet address text instead. The hashes differ,
  so a correctly wallet-bound SDK proof fails the existing server comparison.
- World App proof completion is not backend acceptance. The SDK calls
  `handleVerify` before app `onSuccess`; host rejection invokes `onError`.

## Local Fix

- Match SDK signal hashing for wallet bytes while preserving UTF-8 text signals.
- Show the human badge only for a trusted `worldIdVerified === true` profile.
- Preserve the backend error instead of replacing it with a generic transport
  failure. Ignore late error callbacks only after successful server validation.
- Retain production, nonce, action, wallet, credential and uniqueness checks.
  No legacy-proof policy, key, contract, reward flag or production record changes.

## Evidence and Release Gate

- Backend authentication tests passed with SDK hash comparison for a wallet
  and text, and explicit rejection of the obsolete wallet-text hash.
- Frontend callback test passed using mocked widget/transport/backend: failed
  host verification remains failure, and late errors cannot override a server
  success. Badge gating has a static regression check.
- Frontend build passed, with the existing large-bundle warning.
- These are local regression checks, not real native proof verification.
- User approved Cloud Run deployment and Git push/Vercel publication on
  2026-10-04. No reward activation, key, contract or DB changes approved.
- Rebuilt backend image
  `sha256:b1d649f387a2eca3bda80cd5b0651ac73a8e504c65292b462792370fd91c39b4`.
  Verified zero-traffic revision `challengeon-api-00022-vav`, then routed 100%
  of production traffic to it. Previous revision `challengeon-api-00020-sux`
  remains available for rollback.
- Verified App ID, RP ID, action, signing-key secret version 1 and explicit
  `ONBOARDING_REWARDS_ENABLED=false` on the new revision. Preview health and
  chain config returned 200, chain 480; unauthenticated proof request returned
  401. No fake authenticated identity used against production.
- Frontend publication follows through the approved `main` push. This record
  does not claim real-account proof success; Vercel Ready and public assets
  must be checked after the push.
- After deployment, retry in World App and verify persisted binding plus profile
  state. If it still fails, inspect the returned server error without logging
  raw proof, identity or signing secrets. Keep rewards disabled.

References:
- https://docs.world.org/world-id/idkit/mini-apps
- https://docs.world.org/world-id/idkit/integrate
