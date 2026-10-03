# World ID Session Login Release

## Approval and Targets

User approved the production DB addition, Cloud Run deployment, GitHub/Vercel
publication, and review submission on 2026-10-04 after implementation/testing.

- Supabase: `lkblcvkdwwyotcnhuunm`
- GCP: `challengeon-wcbflow`, `asia-northeast3`, `challengeon-api`
- GitHub: `WorldChallengeBattle/ChallengeON`, `main`
- Vercel: `un-on/challenge-on`
- World Portal: `app_a5a8b0a2d65c376bf242d317a9f4ac78`, World Challenge On / U&On
- Existing RP signer: `0xD6790da916e0a46bf570EA037121c68f9340AAcc`, unchanged

## Progress

- Complete: automated backend auth/session/reward tests, UI callback/entry
  tests, discovery/playback tests and production frontend build pass.
- Complete: approved migration added `world_id_login_sessions`,
  `world_id_login_requests`, `world_id_login_proofs`; RLS and uniqueness/replay
  constraints confirmed. No existing reward or user rows rewritten.
- Complete: zero-traffic backend preview `challengeon-api-00026-bab`; health
  and chain config 200, anonymous application/admin/session/job requests 401,
  both production frontend origins passed CORS preflight (204).
- In progress: production cutover and GitHub/Vercel publication.
- Pending: Portal review submission and post-submit status confirmation.
- Pending user E2E: real World App initial session, returning session, cancelled
  consent, and authenticated feed. Mock tests do not prove native phone success.

Cloud source uploads now also exclude `screenshot/`. Git excludes the user's
screenshots and all real environment/credential files. Runtime secrets remain
on bundle version 4 and World ID signing-key version 1. Welcome rewards,
in-process jobs and startup maintenance stay disabled. No key rotation,
Portal action creation, reward activation, Safe transaction or contract change.

Backend image:
`sha256:6a91c81146ea97e8a0101816878975e752a52125482a3ca8c5c6bea074be7077`.
Preview config confirms World Chain 480, onboarding false and migration false.
No authenticated operational job was triggered by the preview checks.

## Changelog Shown Before Submission

```text
- Separated World ID v4 session-based sign-in from the one-time welcome-reward verification flow.
- Added server-side Proof of Human verification bound to the signed request, wallet, and authenticated login session.
- Restricted application screens and APIs to users with backend-confirmed human verification.
- Preserved existing sessions for returning-user authentication and added proof replay and session-ownership protections.
- Improved sign-in cancellation handling and sanitized verification error messages.
- Kept World Chain mainnet configuration and existing reward duplicate-claim protections unchanged. Welcome rewards and automated collection remain disabled.
Validation: Automated authentication, UI callback, discovery, and playback safety tests passed. Native World App first-session and returning-session login still require real-account confirmation.
```

Review submission does not constitute approval by World or establish real-user
login success. Preserve existing developer allow-listing behavior when submitting.

## Rollback Reference

Previous production backend: `challengeon-api-00024-fod`.
Previous production Git commit: `e0eb7458608ea85a867d46f5cbc447602f349e6a`.
Rolling back authentication restores the known welcome-action replay issue;
assess frontend/backend compatibility and obtain approval before rollback.
