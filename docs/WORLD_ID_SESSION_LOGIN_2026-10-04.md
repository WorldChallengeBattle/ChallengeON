# World ID Session Login Recovery

## Scope

Replace login use of `challengeon-welcome-reward` uniqueness proofs with native
World ID v4 session proofs. Keep Proof of Human/schema 1, production environment,
fresh SIWE wallet authentication, trusted backend verification and human-only
API access. Do not accept a native replay error as authentication.

The welcome action, nullifier bindings, `identityForClaim`, reward signatures,
on-chain duplicate checks, keys and disabled reward policy are unchanged.
Login sessions do not establish welcome eligibility. The reward endpoint still
requires the independently verified welcome-action binding.

Session ownership is bound to one wallet. Sessions are not global person
identifiers: standalone session creation does not enforce one person/one wallet
across independently created sessions. Person-level reward uniqueness remains
in the separate welcome-action flow. Do not describe sessions as Sybil dedup.

## Implementation

- New `/api/auth/world-id/session/request` signs without an action, binds nonce
  to wallet/auth_time for five minutes, and rate-limits issuance. Existing
  sessions are returned only to their authenticated wallet for proving again.
- New `/api/auth/world-id/session/verify` checks nonce, wallet signal, current
  auth_time, production v4, exact session ID shape, one Proof of Human response
  and session nullifier tuple. The unmodified result goes to the pinned RP's
  official v4 verifier. Overall and credential success, environment, session
  ID and returned nullifier must match before persistence.
- A transaction revalidates the locked request, rejects reused proof tuples,
  binds the session to one wallet, and consumes the request. It cannot replace
  an existing wallet session with an unrelated session or older auth_time.
- API gate and profile use the new trusted session record for the current
  Firebase wallet auth_time, not client claims or welcome eligibility.
- React uses `IDKitSessionWidget` and an explicit wallet-bound Proof of Human
  credential constraint. It creates the initial session or proves the persisted
  session on a new wallet login. Proof callbacks grant access only after server
  success and profile confirmation. No session is stored in browser storage.

## Verification

- `npm run test:auth` in backend passes old reward uniqueness/signing tests,
  new session validation/HTTP tests, in-memory PostgreSQL replay/rollback tests,
  and global access policy tests. Upstream verification is mocked; signatures
  use the existing ignored local key offline. No real human proof is fabricated.
- `npm run test:world-id-ui` passes automatic entry, state reset, cancellation,
  stale-profile, exact-origin token transport, session widget/server callbacks,
  existing-session propagation and sanitized native error checks.
- `npm run test:discovery`, `npm run build`, and `git diff --check` pass.
  Existing bundle size warning remains.
- Read-only production migration preflight:
  `node backend/apply-world-id-migration.js --cloud --sessions` reports no target
  session tables yet. No production DB writes occurred during implementation.
- Local/mock checks do not establish native World App E2E success. The real
  production verifier's session response and phone session support must be
  checked after approved release; missing/mismatched fields fail closed.

## Approval-Gated Release

1. Add `world_id_login_sessions`, `world_id_login_requests`,
   `world_id_login_proofs` to Supabase project `lkblcvkdwwyotcnhuunm` using
   `node backend/apply-world-id-migration.js --cloud --sessions --apply`.
   Migration refuses to apply if any target table exists. It does not alter
   old reward/request tables or user records. New tables have RLS enabled and
   no public privileges/client policies.
2. Deploy `challengeon-api` in GCP `challengeon-wcbflow`, `asia-northeast3`,
   first to zero-traffic preview. Preserve RP key version, reward/job/maintenance
   disable flags, network 480 and CORS. Verify anonymous API denial and public
   health/config without triggering authenticated jobs or payouts.
3. Commit only this recovery and previous unpublished replay diagnostic edits
   to `WorldChallengeBattle/ChallengeON` main; exclude `.env` and `screenshot/`.
   Push to trigger Vercel `un-on/challenge-on`. Coordinate backend cutover with
   frontend publication; verify Ready and live public assets on both aliases.
4. User tests native login, cancellation, retry after server/network failure,
   app reopen, and a fresh wallet login that reuses the persisted session.
   Confirm authenticated feed and zero welcome writes/payouts. Never print raw
   proofs/session IDs/wallet identities in handoff or debug logs.
5. If native/session verification fails, do not bypass it. Diagnose the
   sanitized error and request-level logs. Previous Cloud Run revision and Git
   commit remain rollback candidates, but restoring the welcome login flow
   also restores its known replay problem. Rollback needs approval.

No Portal action creation, key rotation, contract or reward activation is
needed for this session-based login implementation.

## Official References

- https://docs.world.org/api-reference/developer-portal/verify
- https://docs.world.org/world-id/idkit/react
- https://docs.world.org/world-id/idkit/signatures
- https://github.com/worldcoin/world-id-protocol/blob/main/docs/world-id-4-specs/README.md
