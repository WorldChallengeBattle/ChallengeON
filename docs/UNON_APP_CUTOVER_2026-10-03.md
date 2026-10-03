# UNON App Cutover Handoff

Date: 2026-10-03. Status: local code and read-only database audit completed; production deployment not performed.

## Changes

- Mainnet central configuration now uses the 11 verified replacement addresses. Legacy manager/source addresses are empty. Start block is 35840349; token mint block is 35840378.
- Mainnet contract addresses are pinned against stale runtime environment overrides. Frontend fallback uses the same central addresses. The API must match every configured contract and chain ID before any of the six active transaction paths can send. An unused seventh welcome handler was subsequently removed.
- Indexing uses the replacement token's own key and deployment block, without resetting old history. Historical welcome rewards remain two allocations of 100 UNON. The separate 500M legacy payout is not counted as a welcome reward or an unused migration reserve.
- Welcome signatures require a Firebase ID token, matching authenticated wallet UID/address, a recent v2 wallet login, enabled reward policy and a server-verified World ID binding in PostgreSQL. Caller/Firebase human-verification flags alone are not sufficient. Wallet login alone never establishes that binding.
- SIWE login verifies server-created nonce, domain, URI origin, chain 480 and five-minute lifetime. A shared Firestore transaction consumes the nonce once. Raw signature request logging was removed; login nonce issuance has a bounded per-instance abuse guard.
- Welcome rewards default to disabled. The profile distinguishes paused rewards from completed claims. Login copy describes wallet ownership, not verified humanity.

## Evidence

- `npm run build`: passed; existing large-bundle warning remains.
- Backend `npm run test:auth`: passed (context, lifetime, recipient binding, fresh login, human-proof gate, pinned addresses, disabled migration/rewards). Structural check now confirms six active guarded send paths and one underlying MiniKit send call.
- `npm run test:discovery`: passed (discovery and playback safety).
- `node --check backend/server.js`: passed.
- All 11 central addresses match `tmp/replacement-deployment-result.json`.
- Read-only PostgreSQL audit: `tmp/replacement-record-audit.json`, 2026-10-03 09:58:33 UTC. Transaction explicitly READ ONLY and rolled back. No production database writes performed.
- DB counts: 76 challenges, 983 videos, zero prize challenges, zero prize votes, zero donations; 18 indexed transfer records and two historical welcome claims.
- Old UNON index stopped at block 30839875; old records with null token attribution remain untouched. These incomplete indexes cannot prove absence of other historical mission/award events. No full-chain event or Firestore-user audit is claimed.
- Browser preview at `http://127.0.0.1:5179`: actual production read API returned 72 Trend items; old chain-config response was explicitly rejected. Profile login state and no horizontal overflow were checked at 1280x551. No actual World App wallet login or authenticated admin-screen verification performed.

## Required Before Production

1. Portal inspection confirmed Action ID `challengeon-welcome-reward` (description: `welcome-reward`), App ID `app_a5a8b0a2d65c376bf242d317a9f4ac78` and RP ID `rp_cba96127b0447fa4`. The RP is registered in production and staging. Its approved replacement key is saved locally to ignored `backend/.env`. IDKit, server verification and wallet binding are implemented locally; test real proof verification and wallet binding before enabling welcome rewards. Do not fabricate human verification from SIWE or a wallet hash.
2. Read-only Firestore rule inspection confirmed all client reads/writes are denied; `_walletAuthChallenges` is therefore server-only. Profile access was moved to authenticated Admin SDK routes without relaxing rules. Review/approve TTL cleanup on `_walletAuthChallenges.deleteAfter` and its cost; expiration is enforced regardless of cleanup. Test concurrent SIWE replay rejection against a test Firestore project.
3. Set exact frontend production origins in Cloud Run `CORS_ORIGINS`. Existing sessions predating wallet-auth v2 must sign in again for welcome rewards. Review legacy-session revocation separately.
4. Complete historical mission/award event auditing and authenticated admin-screen verification. Zero pool balances alone do not prove no unpaid obligations.
5. Approve release scope for Cloud Run `challengeon-api` in project `challengeon-wcbflow`, region `asia-northeast3`, and the Vercel frontend. Startup schema/seed/indexer writes must be reviewed; the backend was not started locally against production DB.
6. Confirm World Developer Portal transaction allowlist for the new contract addresses before sending from World App. This is a separate externally applied change.
7. Obtain Git publication approval. The worktree contains earlier, unrelated uncommitted UX changes; none were reverted or silently published.
8. Apply `backend/migrations/20261003_world_id.sql` only after approval, with a trusted backend DB role that can access the RLS-protected tables. After paired API/frontend deployment, verify public config, admin balances and actual-account login/claim/transaction behavior. Keep `ONBOARDING_REWARDS_ENABLED=false` until human proof is validated and historical duplicate eligibility is reviewed.
9. Reward-pool funding still needs explicit amounts and Safe approval. No pool funding, token transaction, service deployment or Git push occurred in this cutover-preparation step.

World wallet-auth reference: https://docs.world.org/mini-apps/commands/wallet-auth

## World ID Action Setup Follow-up

- Read-only Portal MCP inspection on 2026-10-03 found actual action `challengeon-welcome-reward`, description `welcome-reward`, environment `production`. Corrected the backend template with the actual action and public App ID / RP ID; no production settings changed.
- Installed MiniKit is 2.0.3 and has no verification command. The current official integration uses IDKit 4.x, a server-generated RP signature and the v4 verification endpoint. Do not restore an unsupported `MiniKit.verify` call or use the obsolete v2 response format.
- Before rotation, local environment presence check found no World ID App ID, RP ID or RP signing key in root/backend `.env`. Portal lookup confirmed existing managed RP `rp_cba96127b0447fa4` for `app_a5a8b0a2d65c376bf242d317a9f4ac78`; production and staging status were `registered`, and both on-chain initialization flags were true.
- Previous signer was `0xf76Bc0F9aC6f592b9dB950f03f0ae895FE1f81fD`. The MCP cannot retrieve its private key. The subsequent approved replacement is recorded below; no duplicate RP was created.
- Portal app-store metadata is currently `unverified`; this is separate from the RP registration status. The v4 action has no maximum-verification field in the returned configuration. Enforce one-human-one-reward in the application; do not assume a legacy API default guarantees it.
- Proposed reward policy is Proof of Human uniqueness, not Selfie Check alone. Backend must validate the expected production environment, action, server-issued nonce, authenticated wallet signal and the specific successful credential result. Store normalized nullifiers atomically so another wallet cannot receive a second reward for the same identity. Use that verified identity for the contract claim rather than a wallet-address hash.
- Review restored historical wallet-hash claims before rollout to avoid awarding the two migrated recipients another welcome reward under a new identity nullifier.
- The initial setup did not implement proof endpoints or IDKit UI. The subsequent local implementation is recorded below; real-account verification, reward reactivation and deployment remain pending.

## Approved World ID Signing Key Rotation

- Date: 2026-10-03. User approved this RP's signer replacement and local `backend/.env` storage, excluding deployer, Safe and token contracts.
- Target app: `app_a5a8b0a2d65c376bf242d317a9f4ac78`; existing managed RP: `rp_cba96127b0447fa4`.
- Old signer: `0xf76Bc0F9aC6f592b9dB950f03f0ae895FE1f81fD`.
- New signer: `0xD6790da916e0a46bf570EA037121c68f9340AAcc`.
- Returned operation hash: `0x001332e69e3e7230c1fe7cccb202027c8eb95d261601dc68a377ab019489fb62`. This is the rotation operation identifier, not a separately verified transaction hash.
- Rotation initially returned `pending`; subsequent registration sync returned production and staging `registered`, both initialized on-chain, and both sync flags true. A separate signing-key lookup returned the new signer address and no private key.
- Saved the one-time private key as `WORLD_ID_SIGNING_KEY` in ignored, untracked `backend/.env`, together with public App ID, RP ID and action. Derived its wallet address locally and verified it equals the new Portal signer. No private key is included in this document or chat.
- Existing environment variables were preserved. Root frontend environment, deployment wallet, Safe and UNON contracts were not edited.
- This is a live RP signer change, not merely local preparation. Cloud Run secret updates, API/frontend deployment, IDKit integration, real-account proof testing and welcome reward reactivation remain pending; none were performed by this rotation.

## Local World ID and Profile Integration

- Added IDKit 4.x React widget with `proofOfHuman`, production environment and no legacy proofs. The native World App transport is selected by IDKit. World ID 3.0-only users are not supported by this initial policy; review that limitation before reward activation.
- Authenticated `/api/auth/world-id/request` signs a five-minute RP context with the actual registered key and stores its nonce, wallet, action and RP in PostgreSQL. It returns an existing verified binding without re-requesting a proof. Per-wallet issuance is bounded to 10 requests per 10 minutes (a concurrency-burst guard, not a strict distributed rate limiter).
- `/api/auth/world-id/verify` validates production, protocol 4.0, action, issued nonce, wallet signal hash, freshness and Proof of Human credential. It forwards the original result to the pinned RP's v4 endpoint and checks the specific successful credential and matching nullifier, not just the overall success flag.
- The same SQL transaction locks and revalidates the challenge, inserts normalized decimal identity/wallet binding, and consumes the nonce. DB constraints reject another wallet for the same identity or another identity for the same wallet. No raw proof or private key is stored in these tables.
- Welcome signatures derive a stable, RP/action-scoped contract identity from the verified nullifier. The server also checks the restored wallet-hash claim and the new identity claim on the current contract, and checks its authorized onboarding verifier. RP signer rotation does not change that separate onboarding verifier.
- Added reviewed-but-unapplied SQL migration for `world_id_requests` and `world_id_welcome_bindings`; RLS enabled and no client policies. Schedule bounded deletion of expired request rows after rollout; retain identity bindings to preserve uniqueness. No production schema or data was changed.
- Read-only Firestore rules query for project `worldchallengebattle` returned ruleset `projects/worldchallengebattle/rulesets/0ce72c13-ca36-4e86-8d72-7d0fc32d4e64`: all client reads and writes denied. Frontend project configuration matches this project. No rules were modified.
- Moved profile initialization/read and pending/confirmed claim metadata to authenticated server routes using the existing Admin SDK. Confirmation checks mainnet receipt status, the current onboarding contract's `Claimed` event, the authenticated recipient and exactly 100 UNON before updating points/claim status. No user-submitted claim flags are trusted.
- Frontend renews a stale wallet-auth session through the existing SIWE flow before requesting a reward. Removed the unused direct-Firestore welcome handler and the incorrect inference that a balance of at least 100 UNON proves welcome receipt. Arbitrary `already claimed` error text no longer finalizes a claim.
- Verification: `npm run build`, backend `npm run test:auth`, `npm run test:discovery`, syntax checks and `git diff --check` passed. IDKit WASM asset is present in build output. Existing large-bundle warning remains.
- Tests use an isolated in-memory PostgreSQL engine (PGlite) for migration, uniqueness, transaction rollback, repeated request and duplicate wallet/identity checks. Test connections are serialized by the adapter; this does not establish cross-instance live PostgreSQL race behavior. HTTP tests use synthetic authentication and explicitly mocked upstream proof acceptance; offline signatures are verified with the real installed SDK and stored key without exposing it.
- Receipt tests reject unsuccessful receipts, wrong contracts, wrong recipients, missing claim logs and wrong amounts. They do not establish live mainnet claim success or live Firestore writes.
- Browser preview at `http://127.0.0.1:5179` still loads 72 Trend items and the unauthenticated profile; old production contract config is rejected and token sending stays blocked. Checked 1280x551 layout without horizontal overflow. The authenticated IDKit modal/native phone flow has not been visually verified.
- Initial backend production dependency audit reported 33 findings, including 2 critical (`protobufjs`, `websocket-driver`). Targeted compatible updates in root/backend lockfiles removed both critical findings. Re-audit reports 30 backend production findings (2 low, 11 moderate, 17 high, 0 critical); no IDKit package is named. Review remaining findings before release; no blanket or breaking audit fix was applied. Build and auth tests passed again after updates.
- `expires_at_min` is a credential minimum bound, not a proof issuance timestamp. Zero is accepted for the standard preset; request freshness is enforced by the server-issued five-minute nonce. Credential validity is checked by the Portal verification endpoint.
- Next release approval must cover the two new Supabase tables, server-only RP key deployment, Cloud Run `challengeon-api` (`challengeon-wcbflow`, `asia-northeast3`), frontend `https://challenge-on-un-on.vercel.app`, and any World Portal contract allowlist changes. Git publication must explicitly decide whether to include the pre-existing UX changes. No secret update, deployment, Git push, pool funding or token transaction occurred in this local implementation.

References:
- https://docs.world.org/world-id/idkit/mini-apps
- https://docs.world.org/world-id/idkit/integrate
- https://docs.world.org/api-reference/developer-portal/verify
