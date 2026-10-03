import { apiUrl } from './api';
import networkConfig from '../../config/unon-networks.json';

export type ChainContracts = {
  unonToken?: string;
  onboardingManager?: string;
  settlementManager?: string;
  stakingLevelManager?: string;
  stakingRewardPool?: string;
  fanSupportManager?: string;
  missionRewardManager?: string;
  creatorAwardsDistributor?: string;
  prizeChallengeManager?: string;
  migrationManager?: string;
  treasuryVault?: string;
  vestingVault?: string;
  wldToken?: string;
};

export type ChainPolicy = {
  welcomeBonusUnon?: number;
  welcomeBonusEndsAt?: string;
  sayHelloRewardUnon?: number;
  platinumMinimumUnon?: number;
  challengeReservationUnon?: number;
  prizeVoteAmountUnon?: number;
  fanSupportCreatorShareBps?: number;
  fanSupportPlatformFeeBps?: number;
};

export type PublicChainConfig = {
  networkKey: string;
  chainId: number;
  label: string;
  networkName: string;
  rpcUrl: string;
  explorerBaseUrl: string;
  contracts: ChainContracts;
  policy: ChainPolicy;
  features?: Record<string, boolean>;
};

const envChainId = Number(import.meta.env.VITE_WORLD_CHAIN_ID || '480');

export const fallbackChainConfig: PublicChainConfig = {
  networkKey: envChainId === 480 ? 'worldchain' : 'worldchainSepolia',
  chainId: envChainId,
  label: envChainId === 480 ? 'World Chain' : 'World Chain Sepolia',
  networkName: envChainId === 480 ? 'worldchain' : 'worldchain-sepolia',
  rpcUrl:
    import.meta.env.VITE_WORLDCHAIN_RPC_URL ||
    (envChainId === 480
      ? 'https://worldchain-mainnet.g.alchemy.com/public'
      : 'https://worldchain-sepolia.g.alchemy.com/public'),
  explorerBaseUrl: envChainId === 480 ? 'https://worldscan.org' : 'https://sepolia.worldscan.org',
  features: { onboarding: false, migration: false },
  contracts: envChainId === 480 ? networkConfig.networks.worldchain.contracts : {
    unonToken: import.meta.env.VITE_UNON_TOKEN_ADDRESS || '',
    onboardingManager: import.meta.env.VITE_UNON_ONBOARDING_MANAGER_ADDRESS || '',
    prizeChallengeManager: import.meta.env.VITE_UNON_PRIZE_MANAGER_ADDRESS || import.meta.env.VITE_WCT_PRIZE_MANAGER_ADDRESS || '',
    stakingLevelManager: import.meta.env.VITE_UNON_STAKING_MANAGER_ADDRESS || import.meta.env.VITE_STAKING_LEVEL_MANAGER_ADDRESS || '',
    fanSupportManager: import.meta.env.VITE_UNON_FAN_SUPPORT_MANAGER_ADDRESS || import.meta.env.VITE_FAN_SUPPORT_MANAGER_ADDRESS || '',
    wldToken: import.meta.env.VITE_WLD_TOKEN_ADDRESS || ''
  },
  policy: {
    welcomeBonusUnon: 100,
    welcomeBonusEndsAt: '2026-12-31',
    sayHelloRewardUnon: 2,
    platinumMinimumUnon: 10000,
    challengeReservationUnon: 10000,
    prizeVoteAmountUnon: 1,
    fanSupportCreatorShareBps: 9500,
    fanSupportPlatformFeeBps: 500
  }
};

export const fetchChainConfig = async (): Promise<PublicChainConfig> => {
  const response = await fetch(apiUrl('/api/chain-config'));
  if (!response.ok) {
    throw new Error(`Failed to load chain config: ${response.status}`);
  }

  const payload = await response.json();
  if (!payload?.success || !payload?.data) {
    throw new Error('Chain config response is invalid.');
  }
  if (envChainId === 480 && (Number(payload.data.chainId) !== 480 ||
      Object.entries(networkConfig.networks.worldchain.contracts).some(([key, address]) =>
        String(payload.data.contracts?.[key] || '').toLowerCase() !== address.toLowerCase()))) {
    throw new Error('The API has not switched to the current UNON deployment.');
  }

  return {
    ...fallbackChainConfig,
    ...payload.data,
    contracts: {
      ...fallbackChainConfig.contracts,
      ...(payload.data.contracts || {})
    },
    policy: {
      ...fallbackChainConfig.policy,
      ...(payload.data.policy || {})
    }
  };
};
