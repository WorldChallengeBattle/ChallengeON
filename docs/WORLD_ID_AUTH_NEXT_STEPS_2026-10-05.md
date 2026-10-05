# World ID authentication follow-up - 2026-10-05

## Evidence and limits

- Android World App 4.0.4203 was the last user-reported version.
- The user reports unchanged native failure after the IDKit 4.4.0 candidate.
- The recorded diagnostic identifies native Android verify-v2 rejection, not a specific invalid field.
- This does not prove that all World App versions reject session proofs.
- A profile lookup failure and native proof rejection are separate failure stages.

## Local fixes, not yet published

- Reuse the freshly validated wallet token for profile lookups during access preparation, including the returning-session confirmation.
- A regression fixture with distinct cached and fresh tokens failed before this fix and passed afterwards. It is not proof of the cause of the production 403.
- Profile wallet-policy failures remain 403. Firestore and human-session storage failures now return 503 instead of suggesting a wallet login failure.
- Server diagnostics contain only a fixed event name and stage: wallet_policy, profile_store, or human_session_store. No exception contents, tokens, wallet addresses, or proofs are logged by these diagnostics.
- Tests cover false profile verification flags, storage failures, wallet rejection, and new profile creation. Authentication remains fail-closed.

## Next focused experiment

Evaluate a login-only uniqueness Proof of Human action through IDKitRequestWidget, separate from the welcome reward action and from the current session request.

Required before release:

1. Sign a fresh server request and bind the proof to the authenticated wallet, login auth_time, and a single-use challenge.
2. Verify the complete unmodified IDKit result server-side. Require the intended action, production environment, matching signal, and the human credential.
3. Test both first and repeated native verification on the affected phone. Do not infer native repeat support from server verifier behavior.
4. Reject consumed challenges, cross-wallet proofs, wrong actions, wrong environments, and weaker credentials. Repeated legitimate login must not grant a repeated welcome reward.
5. If using legacy compatibility, explicitly validate v3 Orb proofs and their challenge binding. Do not accept device verification or silently relabel a legacy credential.
6. Maintain the human-only API gate. Do not grant access from a cached profile flag, wallet login alone, or a native error.

This alternative is a design for an experiment, not implemented or proven on the phone. Production action creation, database migration, deployment, Git publication, and review changes require fresh scoped approval.

## Official references

- https://docs.world.org/world-id/idkit/mini-apps : native IDKit transport, proofOfHuman request widget, server-side signing and verification, legacy-enabled example.
- https://docs.world.org/api-reference/developer-portal/verify : v4 verifier accepts World ID 4.0 and legacy 3.0 proofs; forward the complete IDKit result without rewriting identifiers.

## Unchanged exclusions

Welcome rewards remain disabled. Existing external Scheduler jobs remain enabled by user decision. No token transactions, key rotation, review resubmission, production DB writes, or deployment are part of this local follow-up.
