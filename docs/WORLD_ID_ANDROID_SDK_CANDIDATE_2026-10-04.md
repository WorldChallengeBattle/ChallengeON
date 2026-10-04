# Android SDK 4.4.0 Candidate

## Confirmed phone evidence

The refreshed screenshot/1.jpg, 2.jpg and 3.jpg show, respectively:

- Initial profile lookup failure.
- Native World App dialog: link not supported.
- malformed_request with [mini_app/android/verify-v2/native-error].

The final label confirms that the SDK received an error-status response from
the Android native transport, not merely a local response parsing error.
It does not identify the exact rejected field or prove that sessions are
unsupported in every World App version.

Read-only Cloud Run logs for 2026-10-04 (UTC):

| Time | Path | Status |
| --- | --- | --- |
| 04:00:05 | POST /api/auth/complete-siwe | 200 |
| 04:00:07 | GET /api/auth/profile | 403 |
| 04:00:22 | GET /api/auth/profile | 200 |
| 04:00:22 | POST /api/auth/world-id/session/request | 200 |
| 04:00:41 | GET /api/auth/profile | 200 |
| 04:00:42 | POST /api/auth/world-id/session/request | 200 |

No session/verify call occurred in this sample. The profile route collapses
wallet-policy and storage exceptions into the same 403; the initial failure
cause remains unknown. Do not claim this SDK candidate fixes that failure.

## Candidate

The npm registry now reports IDKit 4.4.0. Its official change replaces WASM
with portable JavaScript. It is not advertised as a fix for this phone error.

Using a public fixture key and mocked Android bridge, both 4.3.0 and 4.4.0
produced production verify-v2 session-create requests with Proof of Human
schema 1 and no legacy fallback. Structural differences observed:

- 4.4.0 explicitly sends proof_request.action=null for sessions; 4.3.0 omits it.
- 4.4.0 explicitly sends genesis_issued_at_min=null and expires_at_min=null
  for the selected credential; 4.3.0 omits those optional fields.

These differences are a compatibility hypothesis, not a proven root cause.
No payload was manually rewritten and no real signed request was disclosed.

The frontend SDK is locally pinned to 4.4.0 with its lockfile. The native test
now executes the real portable serializer with all network access disabled
and checks the explicit optional fields, session creation and return flow,
error propagation, cleanup and verify-v1 refusal. Existing error diagnostics
and human-only gating are unchanged. The backend SDK/signing package and
all backend sources, DB tables, keys, reward settings and jobs are unchanged.

## Local Validation

- npm run test:world-id-ui: passed.
- npm run test:discovery: passed.
- backend npm run test:auth: passed, including offline signing and mocked verification.
- npm run build: passed; existing chunk-size warning remains.
- git diff --check: passed.

These checks are local/mock evidence only. Production remains at ed8fad1
until separate approval to commit/push and automatically deploy this candidate
to Vercel. No Cloud Run redeploy, DB write or Portal action is needed for the
frontend candidate. Screenshots and downloaded inspection artifacts are excluded.

## Primary Sources

- https://github.com/worldcoin/idkit/pull/343
- https://github.com/worldcoin/idkit/pull/344
- https://github.com/worldcoin/idkit/pull/345
- https://registry.npmjs.org/@worldcoin/idkit/4.4.0

On approval, re-test on the user's Android device. If native rejection persists,
prepare a sanitized World developer support report; do not treat a native
error, wallet balance, or wallet login alone as a human proof.
