# Challenge On Backend

The backend handles challenge data, video uploads, YouTube upload integration, admin operations, UNON monitoring, prize challenge coordination, ON section routing, donation ranking, follows, and notifications.

Challenge hashtags should include `#UNON #challengeon`. Use `node migrate-hashtags.js` to remove legacy project tags from existing challenge rows and append the canonical tags.

## ON Product APIs

- `GET /api/on-sections`: returns `Trend ON`, `Battle ON`, `Now ON`, and tutorial checklist data.
- `GET /api/challenges?mode=trend|battle|now`: filters challenges by ON surface.
- `GET /api/rankings/donations?period=month|quarter|year&token=all|UNON|WLD`: returns Gold support rankings.
- `POST /api/video-support/confirm`: records confirmed UNON/WLD support transactions.
- `POST /api/follows`, `DELETE /api/follows/:followedUid`, `GET /api/follows/me`: follow graph.
- `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/permissions`: in-app notification and World App push fallback.
- `POST /api/missions/say-hello/reward-signature`: signs the 2 UNON Say Hello reward after a qualifying upload.

## UNON Prize Challenge Backend Role

The backend does not choose prize winners. Winner selection and settlement are handled by `PrizeChallengeManager` on World Chain.

Backend responsibilities:

- Store prize challenge metadata after on-chain creation is confirmed.
- Accept only WorldID-authenticated uploads for prize challenge entries.
- Verify the upload user matches the Firebase/WorldID wallet UID.
- Store the participant wallet as `author_wallet_address`.
- Sign verified entry registration payloads after upload.
- Confirm user-submitted `registerEntryWithSignature` transactions.
- Confirm UNON vote and finalization transaction events.
- Mirror on-chain state for the frontend and admin UI.

## Network Config

Public contract addresses are centralized in `../config/unon-networks.json`.
The backend loads the selected network with `DEPLOY_NETWORK` and exposes safe frontend values through `GET /api/chain-config`.

```env
DEPLOY_NETWORK=worldchain
UNON_NETWORK_CONFIG_PATH=../config/unon-networks.json
WORLD_CHAIN_CHAIN_ID=480
WORLD_CHAIN_RPC=https://worldchain-mainnet.g.alchemy.com/public
```

Keep private keys and API keys in `.env`. Keep `UNON_*_ADDRESS` env vars empty unless you intentionally need a temporary local override. ChallengeON defaults to World Chain (`chainId 480`) and uses the `worldchain` section of the central config. Select World Chain Sepolia (`chainId 4801`) explicitly only for isolated testing.

## Entry Authorization Signer

`PRIZE_REGISTRAR_PRIVATE_KEY` belongs to the backend-only entry authorization signer.

Important:

- The signer authorizes verified videos for `registerEntryWithSignature`.
- Users submit the registration transaction through World App MiniKit.
- It is not the video creator.
- It does not receive prize funds.
- Prize payouts go to the participant's WorldID wallet address.
- It does not need World Chain ETH for entry registration gas.

## Prize Challenge APIs

- `POST /api/prize-challenges/prepare`
- `POST /api/prize-challenges/confirm`
- `POST /api/prize-challenges/:id/status`
- `POST /api/prize-challenges/:id/videos/:videoId/register/confirm`
- `POST /api/prize-challenges/:id/videos/:videoId/vote/confirm`
- `POST /api/prize-challenges/:id/finalize/confirm`

## Database Additions

Prize challenge fields were added to `challenges`, including:

- `challenge_type`
- `prize_status`
- `prize_pool_unon`
- `prize_pool_wei`
- `prize_onchain_challenge_id`
- `prize_manager_address`
- `prize_create_tx_hash`
- `prize_finalize_tx_hash`
- `prize_submission_start`
- `prize_submission_end`
- `prize_voting_end`
- `prize_winner_count`
- `prize_winner_splits_bps`

Prize entry fields were added to `challenge_videos`:

- `onchain_video_id`
- `prize_eligible`
- `entry_registered_tx`

Prize vote confirmations are stored in `prize_video_votes`.
