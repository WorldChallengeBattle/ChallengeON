# Challenge On

Challenge On is a World App mini app for short-form challenge participation, video upload, U&On holder badges, admin video management, UNON prize challenges, and the `Trend ON / Battle ON / Now ON` experience.

Challenge metadata and generated tracking tags now use `#UNON #challengeon` as the canonical project tags. Legacy project tags should be normalized with `backend/migrate-hashtags.js` before production challenge data is reused.

## Current Product Structure

- `Trend ON`: daily AI-curated global trend discovery.
- `Battle ON`: PLATINUM+ staker-created challenges with notices, periods, custom event rules, and prize escrow.
- `Now ON`: official missions. The first mission is `Say Hello`, with a `2 UNON` reward after upload and backend signature approval.
- `Ranking`: monthly, quarterly, and yearly Gold support rankings for UNON/WLD donations.
- Gold support uses the new tokenomics target of `95% creator / 5% platform fee`.

## Current UNON Prize Challenge Integration

Prize challenges are available for PLATINUM and higher UNON stakers.

- PLATINUM threshold: `10,000 UNON` staked
- Active challenge lock: `10,000 UNON` reserved per open challenge until settlement/refund
- Test network: World Chain Sepolia, chain id `4801`
- Production network: World Chain, chain id `480`
- Contract addresses: loaded from backend `GET /api/chain-config`
- Canonical address book: `config/unon-networks.json`
- Vote cost: `1 UNON` per video vote
- Operations fee: `3%` from prize pools and vote pools

Note: existing mainnet addresses are historical production deployments. Local testing now defaults to World Chain Sepolia and must use fresh Sepolia contract addresses. Because the old token was deployed before the final `U&On` naming decision, its on-chain ERC-20 `name()` may remain `Unon` until a fresh token deployment is made.

## Prize Challenge Flow

1. A PLATINUM+ user creates a prize challenge from the app.
2. MiniKit stakes any missing PLATINUM shortfall, then sends prize `approve` and `PrizeChallengeManager.createChallenge`.
3. Backend confirms the on-chain event and stores the challenge as `challenge_type = prize`.
4. Only WorldID-authenticated uploads can be registered as prize entries.
5. Backend signs a verified entry registration payload after YouTube upload.
6. MiniKit sends `PrizeChallengeManager.registerEntryWithSignature`, so the user registers their own entry through World App gas sponsorship.
7. Users vote on each eligible video with `1 UNON`.
8. After voting ends, `finalize` selects winners on-chain.
9. Winning-video voters can claim their vote-pool reward from the contract.

## Required Environment Values

Frontend `.env` keeps app/client settings. Contract addresses should normally stay empty because the app reads `/api/chain-config`.

```env
VITE_API_BASE_URL=
VITE_WORLD_CHAIN_ID=4801
```

Backend `.env` selects the network and points to the central config. Private keys remain in `.env`.

```env
DEPLOY_NETWORK=worldchainSepolia
UNON_NETWORK_CONFIG_PATH=../config/unon-networks.json
WORLD_CHAIN_CHAIN_ID=4801
WORLD_CHAIN_RPC=https://worldchain-sepolia.g.alchemy.com/public
PRIZE_REGISTRAR_PRIVATE_KEY=<entry authorization signer private key>
```

Do not expose `PRIZE_REGISTRAR_PRIVATE_KEY` in frontend files or documentation. The key signs verified entry payloads only; users submit entry registrations through MiniKit.

## Network Config API

- `GET /api/chain-config` returns the active network, chain id, explorer, public contract addresses, tokenomics policy, and feature flags.
- The response is sourced from `config/unon-networks.json`.
- Secrets such as private keys, API keys, and signer keys are never returned.
- Sepolia testing and production World Chain addresses are separated under `worldchainSepolia` and `worldchain`.

## Verification

Latest local checks:

```bash
npm run build
node --check backend/server.js
node backend/challenge-matcher.test.js
node backend/region-classifier.test.js
```

The UNON contract project also passes its Hardhat test suite with the prize manager included.
