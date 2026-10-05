# Native World ID retest after profile release

## Confirmed

- User reports the initial profile error disappeared after the latest release; subsequent native verification remains unchanged.
- Inspected screenshot/1.jpg and screenshot/2.jpg: link-not-supported dialog and malformed_request with mini_app/android/verify-v2/native-error.
- The supplied files retain October 4 modification timestamps. The user's current retest report, not those timestamps, establishes the post-release outcome.
- Read-only production revision challengeon-api-00028-rok logs show:
  - 2026-10-05 03:56:53 UTC: complete-siwe 200.
  - 03:56:55 UTC: profile 200.
  - 03:56:56 UTC: session/request 200.
  - 03:57:12 UTC: profile 200.
  - 03:57:13 UTC: session/request 200.
- No authenticated session/verify request appears for these attempts. Earlier anonymous 401 checks were deployment smoke tests, not successful user proof submission.
- Therefore wallet/profile and request issuance succeed; failure occurs before a proof reaches the backend. This does not identify the precise native rejection cause.

## Locally tested next candidate

The real installed IDKit 4.4.0 serializer was exercised offline with a public fixture signing key and mocked native transport. No Portal action was created.

- Current session flow: verify-v2, empty action, session proof, no legacy support.
- Login-only uniqueness candidate: action challengeon-human-login, action-bound RP signature, verify-v2, Proof of Human schema 1, Orb legacy compatibility.
- When the mock host advertises only verify-v1, the candidate produces an Orb request; the current session flow refuses that host.
- Assertions include the SDK-generated hashed proof action, legacy level, and listener cleanup. No custom payload rewrite is used.
- Serialization passing is NOT proof that Android World App accepts the candidate or permits repeated native login.

## Implementation / release requirements

The candidate is not wired into the app. Keep the reward action separate, and never accept a native error as verification.

Before operational rollout: implement a fresh single-use server challenge bound to wallet and auth_time; verify the complete original result through the official verifier; permit only v4 Proof of Human schema 1 or explicitly validated v3 Orb; bind legacy signals to the unique login challenge to prevent reuse of old proofs; test same-owner repeated login and cross-wallet/replay denial. Store the trusted login result separately from welcome claims and actual World ID session IDs.

Portal login-action creation, new verification storage, GitHub/Vercel publication, and Cloud Run rollout require scoped approval. No such operation was performed in this retest investigation. Existing rewards and Scheduler settings remain unchanged.

## Official sources

- https://docs.world.org/world-id/idkit/mini-apps
- https://docs.world.org/api-reference/developer-portal/verify
