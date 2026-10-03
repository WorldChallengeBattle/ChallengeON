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
- Production network: World Chain, chain id `480`
- Explicit test network: World Chain Sepolia, chain id `4801`
- Contract addresses: loaded from backend `GET /api/chain-config`
- Canonical address book: `config/unon-networks.json`
- Vote cost: `1 UNON` per video vote
- Operations fee: `3%` from prize pools and vote pools

Note: ChallengeON defaults to the existing World Chain mainnet deployments. Sepolia is available only when explicitly selected for isolated testing. Because the old token was deployed before the final `U&On` naming decision, its on-chain ERC-20 `name()` may remain `Unon` until a fresh token deployment is made.

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
VITE_WORLD_CHAIN_ID=480
```

Backend `.env` selects the network and points to the central config. Private keys remain in `.env`.

```env
DEPLOY_NETWORK=worldchain
UNON_NETWORK_CONFIG_PATH=../config/unon-networks.json
WORLD_CHAIN_CHAIN_ID=480
WORLD_CHAIN_RPC=https://worldchain-mainnet.g.alchemy.com/public
PRIZE_REGISTRAR_PRIVATE_KEY=<entry authorization signer private key>
```

Do not expose `PRIZE_REGISTRAR_PRIVATE_KEY` in frontend files or documentation. The key signs verified entry payloads only; users submit entry registrations through MiniKit.

## Network Config API

- `GET /api/chain-config` returns the active network, chain id, explorer, public contract addresses, tokenomics policy, and feature flags.
- The response is sourced from `config/unon-networks.json`.
- Secrets such as private keys, API keys, and signer keys are never returned.
- Production and explicit Sepolia test addresses remain separated under `worldchain` and `worldchainSepolia`.

## Verification

See [System and Experience Review](docs/SYSTEM_FLOW_REVIEW.md) for the current user flow, discovery controls, safety fixes, browser checks and release gates.

Latest local checks:

```bash
npm run build
npm run test:discovery
node --check backend/server.js
node backend/challenge-matcher.test.js
node backend/region-classifier.test.js
```

The UNON contract project also passes its Hardhat test suite with the prize manager included.

## Cloud Deployment

The selected deployment layout uses GitHub, Vercel for the Vite frontend, Supabase PostgreSQL, and Google Cloud Run for the Express API and YouTube upload path.

See [`docs/CLOUD_DEPLOYMENT.md`](docs/CLOUD_DEPLOYMENT.md) for secrets, service settings, scheduled jobs, verification, and free-tier constraints.

## World Developer Portal MCP

This repository includes a project-scoped Codex connection to the official World Developer Portal MCP. It is a local development tool and is not used by the Vercel frontend or Cloud Run backend.

1. In the World Developer Portal, open the ChallengeON team and create a project-specific API key.
2. Before starting Codex, expose the key to that process in PowerShell:

```powershell
$env:WORLD_DEVELOPER_API_KEY = "api_..."
codex
```

3. Trust this repository when Codex asks whether project configuration may be loaded.
4. Start a new Codex session, then call `get_team_context` before reading or changing app configuration.

Never add the API key to `.env.example`, a `VITE_` variable, Vercel, Cloud Run, Git, logs, or chat messages. Creating or modifying apps, rotating signing keys, uploading assets, and submitting an app for review require explicit confirmation at the time of the action.
