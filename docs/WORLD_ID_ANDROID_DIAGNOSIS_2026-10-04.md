# Android World ID Request Diagnosis

## Device evidence

User-reported device: Android, World App 4.0.4203.
Inspected local screenshot/1.jpg, 2.jpg, and 3.jpg:

- 1: Profile unavailable; please sign in with your wallet again.
- 2: Native World App dialog: link not supported (Korean).
- 3: World ID sign-in failed (malformed_request).

These images are user files, not staged or included in deployment sources.

## Read-only production checks

Cloud Run request logs (UTC; local timezone is UTC+9):

| Time | Path | Status |
| --- | --- | --- |
| 2026-10-03 18:59:15 | POST /api/auth/complete-siwe | 200 |
| 2026-10-03 18:59:17 | GET /api/auth/profile | 403 |
| 2026-10-03 18:59:28 | GET /api/auth/profile | 200 |
| 2026-10-03 18:59:28 | POST /api/auth/world-id/session/request | 200 |

The read-only one-hour log sample contained no user session/verify request
after session issuance. Earlier anonymous deployment probes returned 401.
Profile lookup recovers on retry; its first failure cause is not established
because the route intentionally does not return internal exception details.

Portal configuration was read, not changed: production app active, RP and
staging mirror registered, humans-only enabled, metadata awaiting_review.
Registration alone does not establish phone session-proof compatibility.

## Local changes and validation

- Session widget errors now show only fixed, allowlisted transport/platform/
  command-version/source labels when the SDK provides a native debug report.
  Example: [mini_app/android/verify-v2/native-error].
- No request payload, signature, nonce, wallet, session ID, bridge connector,
  raw response message, or debug report is logged or displayed by this change.
- Existing UI tests cover secret omission, untrusted diagnostic values,
  backend failure retention, and denial of access after native errors.
- New offline test uses installed IDKit 4.3.0 and its real WASM serializer,
  a public fixture signing key, and a mocked Android.postMessage bridge.
  It checks initial-session and returning-session envelopes, timestamp,
  production environment, Proof of Human schema 1, native malformed_request
  propagation, listener cleanup, and refusal of verify-v1-only hosts.
- npm run test:world-id-ui, npm run build, and git diff --check passed.
  The existing build chunk-size warning remains.

## Limits and next step

The SDK emits the documented session envelope, including top-level empty
action and proof_request.session_id=create for initial sessions. The mock
does not validate World App's parser or produce a genuine proof. No public
primary source located in this investigation confirms the session support
matrix for Android build 4.0.4203. Do not claim that updating World App fixes it.

The native dialog suggests a request-processing/compatibility problem, but
does not identify the exact rejected field. This is not a login fix.
After separate approval, publish only the frontend diagnostic change and
ask the user for a fresh error screenshot to distinguish a native rejection
from SDK response parsing/preflight failure. Use sanitized evidence for World
developer support if needed; never send a full SDK debug report unredacted.

No Git commit/push, production deployment, DB modification, action creation,
key rotation, scheduler change, reward enabling, or review resubmission was
performed in this investigation. Human-only enforcement remains unchanged.

## Primary References

- https://docs.world.org/world-id/idkit/mini-apps
- https://docs.world.org/world-id/idkit/session-proofs
- https://github.com/worldcoin/idkit/blob/main/js/packages/core/src/transports/native.ts
- https://github.com/worldcoin/idkit/blob/main/rust/core/src/bridge.rs
- https://github.com/worldcoin/world-id-protocol/blob/main/crates/primitives/src/session.rs

Installed SDK types/source remain authoritative for the locally executable
API: session presets are unsupported in 4.3.0, despite the current session
documentation showing a preset example. The existing explicit constraints
were preserved; human assurance was not downgraded.
