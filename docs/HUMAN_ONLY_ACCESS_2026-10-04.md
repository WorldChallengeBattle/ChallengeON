# Human-Only App Access - 2026-10-04

## Policy

- World App availability settings alone are not trusted as proof in our backend.
- On entry, complete or renew wallet ownership authentication, then request
  server-backed human verification automatically before mounting the app.
- First-time wallets receive the existing signed IDKit Proof of Human request.
  Cancellation, rejection and unavailable storage keep the app locked.
- Returning wallets are checked against the persisted RP/action/wallet binding
  on each entry; this reuses an already verified identity, not a new native proof
  on every launch. No duplicate proof prompt or reward is generated.
- Trusted profile confirmation is required after successful proof storage.
  Wallet/account changes reset access and ignore stale initialization results.
- The profile's separate Verify World ID button is removed; verification status
  remains visible. Reward-specific signatures retain all existing server gates.

## API Boundary

- Global middleware denies anonymous application API access with 401 and
  authenticated but unbound wallets with 403. Database failure denies with 503.
  A user-supplied or token human flag cannot replace the PostgreSQL binding.
- Read, write, upload, vote, support and admin paths are covered. Admin role
  checks remain additional requirements, not bypasses.
- Exact method/path bootstrap exemptions: wallet nonce/completion, profile,
  human request/verification and public chain configuration. Bootstrap routes
  retain their existing authentication/validation. Health remains public.
- Internal jobs and maintenance routes retain separate cron-secret checks.
  They are not subject to an end-user human proof, so discovery remains usable.
- Frontend application calls attach Firebase bearer tokens through a shared
  API transport. Tokens are attached only to the configured API origin/path.
  External MiniKit user-operation requests are not given app bearer tokens.
- Human bindings persist until a separate reviewed policy changes them. This
  is not credential-revocation monitoring. The existing World ID 4.0-only and
  one-human/one-wallet RP/action uniqueness policies are unchanged.
- This protects our app and backend, not direct calls to public blockchain
  contracts or externally hosted videos.

## Verification

- Backend auth/uniqueness/signature tests and global access tests passed.
  Covered anonymous/unbound/forged claims, wallet mismatch, DB unavailability,
  bound-wallet access and separately authenticated operational jobs.
- UI callback and entry-state tests passed with explicit mocked native/auth
  fixtures: initial automatic proof, returning binding, cancellation, rejection,
  stale profile, wallet switch and outside-World-App denial.
- API transport tests passed for exact-origin token attachment, external-origin
  isolation and missing-login rejection. Existing discovery/playback tests pass.
- Frontend build passed with the existing bundle warning. Actual desktop
  preview at http://127.0.0.1:5179 shows the locked entry screen and retry button;
  no app navigation or feed rendered. Native World App E2E remains untested.

## Production Gate

- User explicitly approved production publication, including loss of anonymous
  browser feed/API access, on 2026-10-04.
- Built Cloud Run revision `challengeon-api-00024-fod` with image
  `sha256:5fd8b1aa514baf49d7175f5288060279ad1623ef90a3c311dac8baadcbebc65b`.
  Verified zero-traffic preview before frontend publication; previous production
  revision is `challengeon-api-00022-vav`.
- Preview checks: health/chain config 200; anonymous challenges, admin, upload,
  human-request, internal job and sync-now requests all 401. No authenticated
  real-user identity fabricated and no operational job triggered.
- App/RP/action configuration, secret key version 1, disabled rewards, disabled
  in-process jobs and startup maintenance verified. Frontend publication and
  production traffic cutover follow this checked preview.
- Deploy frontend/API as a coordinated release; an old frontend without bearer
  transport will receive 401 from the protected new application endpoints.
- No keys, contracts, production records, reward activation or Portal settings
  changed by this implementation. Keep welcome rewards disabled.
- After approved deployment, verify fresh/returning real World App sessions,
  proof cancellation and authenticated feed/actions before claiming E2E success.

Reference: https://docs.world.org/world-id/idkit/mini-apps
