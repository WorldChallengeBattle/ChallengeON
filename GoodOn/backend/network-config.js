const fs = require('fs');
const path = require('path');

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

const CONTRACT_ENV_KEYS = {
  unonToken: ['UNON_TOKEN_ADDRESS', 'WCT_TOKEN_ADDRESS'],
  onboardingManager: ['UNON_ONBOARDING_MANAGER_ADDRESS', 'WCT_ONBOARDING_MANAGER_ADDRESS'],
  settlementManager: ['SETTLEMENT_MANAGER_ADDRESS', 'UNON_CREATOR_REWARDS_ADDRESS', 'WCT_CREATOR_REWARDS_ADDRESS'],
  stakingLevelManager: ['UNON_STAKING_MANAGER_ADDRESS', 'STAKING_LEVEL_MANAGER_ADDRESS'],
  stakingRewardPool: ['UNON_STAKING_REWARD_POOL_ADDRESS', 'STAKING_REWARD_POOL_ADDRESS'],
  fanSupportManager: ['UNON_FAN_SUPPORT_MANAGER_ADDRESS', 'FAN_SUPPORT_MANAGER_ADDRESS'],
  missionRewardManager: ['UNON_MISSION_REWARD_MANAGER_ADDRESS', 'MISSION_REWARD_MANAGER_ADDRESS'],
  creatorAwardsDistributor: ['UNON_CREATOR_AWARDS_DISTRIBUTOR_ADDRESS', 'CREATOR_AWARDS_DISTRIBUTOR_ADDRESS'],
  prizeChallengeManager: ['UNON_PRIZE_MANAGER_ADDRESS', 'WCT_PRIZE_MANAGER_ADDRESS', 'PRIZE_CHALLENGE_MANAGER_ADDRESS'],
  migrationManager: ['MIGRATION_MANAGER_ADDRESS', 'UNON_RESERVE_ADDRESS', 'WCT_RESERVE_ADDRESS'],
  treasuryVault: ['TREASURY_VAULT_ADDRESS', 'UNON_TREASURY_ADDRESS', 'WCT_TREASURY_ADDRESS'],
  vestingVault: ['VESTING_VAULT_ADDRESS', 'UNON_TEAM_ADDRESS', 'WCT_TEAM_ADDRESS'],
  wldToken: ['WLD_TOKEN_ADDRESS']
};

const WALLET_ENV_KEYS = {
  governanceAdmin: ['GOVERNANCE_ADMIN'],
  onboardingVerifier: ['ONBOARDING_VERIFIER'],
  prizeRegistrar: ['PRIZE_REGISTRAR'],
  growthRecipient: ['GROWTH_RECIPIENT', 'UNON_MARKETING_ADDRESS', 'WCT_MARKETING_ADDRESS'],
  liquidityRecipient: ['LIQUIDITY_RECIPIENT', 'UNON_LIQUIDITY_ADDRESS', 'WCT_LIQUIDITY_ADDRESS']
};

function clean(value) {
  const normalized = String(value ?? '').trim();
  return normalized === '' ? undefined : normalized;
}

function normalizeNetworkName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.includes('sepolia') || normalized === 'testnet' || normalized === 'test') {
    return 'worldchainSepolia';
  }
  if (normalized.includes('worldchain') || normalized === 'mainnet' || normalized === 'production') {
    return 'worldchain';
  }
  return undefined;
}

function networkFromChainId(value) {
  const chainId = Number(value || 0);
  if (chainId === 480) return 'worldchain';
  if (chainId === 4801) return 'worldchainSepolia';
  return undefined;
}

function defaultConfigPath() {
  return path.resolve(__dirname, '..', 'config', 'unon-networks.json');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function firstEnv(keys) {
  for (const key of keys) {
    const value = clean(process.env[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function overrideObject(base, envKeyMap) {
  const next = { ...(base || {}) };
  for (const [key, envKeys] of Object.entries(envKeyMap)) {
    const value = firstEnv(envKeys);
    if (value !== undefined) {
      next[key] = value;
    }
  }
  return next;
}

function parseTrackedWalletsEnv() {
  return String(process.env.UNON_TRACKED_WALLETS || process.env.WCT_TRACKED_WALLETS || '')
    .split(',')
    .map((item, index) => {
      const parts = item.split('|').map((part) => String(part || '').trim());
      const isBareAddress = parts.length === 1 && ADDRESS_PATTERN.test(parts[0]);
      const rawLabel = isBareAddress ? `Tracked Wallet ${index + 1}` : parts[0];
      const rawAddress = isBareAddress ? parts[0] : parts[1];
      const rawCategory = isBareAddress ? 'Custom' : parts[2];
      if (!rawLabel || !ADDRESS_PATTERN.test(rawAddress || '')) return null;
      return {
        key: `custom_${index}_${rawLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        label: rawLabel,
        category: rawCategory || 'Custom',
        address: rawAddress
      };
    })
    .filter(Boolean);
}

function validateAddressMap(map, prefix, warnings, errors, requiredKeys = []) {
  for (const [key, value] of Object.entries(map || {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) || typeof value === 'object') continue;
    if (!ADDRESS_PATTERN.test(String(value))) {
      errors.push(`${prefix}.${key} is not a valid address.`);
    }
  }

  for (const key of requiredKeys) {
    const value = map?.[key];
    if (!value || value === ZERO_ADDRESS) {
      errors.push(`${prefix}.${key} is required for production.`);
    }
  }

  if (requiredKeys.length === 0 && prefix === 'contracts') {
    for (const key of ['unonToken', 'onboardingManager']) {
      if (!map?.[key]) warnings.push(`${prefix}.${key} is not configured.`);
    }
  }
}

function buildPublicConfig(config) {
  return {
    networkKey: config.networkKey,
    chainId: config.chainId,
    label: config.label,
    networkName: config.networkName,
    rpcUrl: config.publicRpcUrl || config.rpcUrl,
    explorerBaseUrl: config.explorerBaseUrl,
    contracts: config.contracts,
    policy: config.policy,
    features: {
      onboarding: !!config.contracts.onboardingManager,
      prizeChallenges: !!(config.contracts.unonToken && config.contracts.prizeChallengeManager),
      staking: !!config.contracts.stakingLevelManager,
      fanSupport: !!config.contracts.fanSupportManager,
      missionRewards: !!config.contracts.missionRewardManager,
      creatorAwards: !!config.contracts.creatorAwardsDistributor,
      migration: !!config.contracts.migrationManager
    }
  };
}

function loadNetworkConfig() {
  const configPath = path.resolve(process.env.UNON_NETWORK_CONFIG_PATH || defaultConfigPath());
  const root = readJson(configPath);
  const selectedNetwork =
    normalizeNetworkName(process.env.DEPLOY_NETWORK) ||
    networkFromChainId(process.env.WORLD_CHAIN_CHAIN_ID || process.env.UNON_CHAIN_ID) ||
    root.defaultNetwork ||
    'worldchainSepolia';

  const rawNetwork = root.networks?.[selectedNetwork];
  if (!rawNetwork) {
    throw new Error(`Unknown U&On network config: ${selectedNetwork}`);
  }

  const chainIdOverride = clean(process.env.WORLD_CHAIN_CHAIN_ID || process.env.UNON_CHAIN_ID);
  const contracts = overrideObject(rawNetwork.contracts, CONTRACT_ENV_KEYS);
  const wallets = overrideObject(rawNetwork.wallets, WALLET_ENV_KEYS);
  const trackedWallets = [
    ...(Array.isArray(rawNetwork.wallets?.trackedWallets) ? rawNetwork.wallets.trackedWallets : []),
    ...parseTrackedWalletsEnv()
  ];
  wallets.trackedWallets = trackedWallets;

  const resolved = {
    configPath,
    networkKey: selectedNetwork,
    chainId: Number(chainIdOverride || rawNetwork.chainId),
    label: rawNetwork.label,
    networkName: rawNetwork.networkName,
    rpcUrl: clean(process.env.WORLD_CHAIN_RPC) || rawNetwork.rpcUrl,
    publicRpcUrl: rawNetwork.rpcUrl,
    explorerBaseUrl:
      clean(process.env.UNON_EXPLORER_BASE_URL || process.env.WCT_EXPLORER_BASE_URL) ||
      rawNetwork.explorerBaseUrl,
    contracts,
    wallets,
    policy: rawNetwork.policy || {}
  };

  const warnings = [];
  const errors = [];
  const productionRequired = selectedNetwork === 'worldchain'
    ? ['unonToken', 'onboardingManager', 'treasuryVault']
    : [];
  validateAddressMap(resolved.contracts, 'contracts', warnings, errors, productionRequired);
  validateAddressMap(resolved.wallets, 'wallets', warnings, errors, []);

  if (resolved.networkKey === 'worldchain' && resolved.chainId !== 480) {
    errors.push('worldchain config must use chainId 480.');
  }
  if (resolved.networkKey === 'worldchainSepolia' && resolved.chainId !== 4801) {
    errors.push('worldchainSepolia config must use chainId 4801.');
  }
  if (!resolved.rpcUrl) {
    errors.push('rpcUrl is required.');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid U&On network config: ${errors.join(' ')}`);
  }

  return {
    ...resolved,
    warnings,
    publicConfig: buildPublicConfig(resolved)
  };
}

module.exports = {
  CONTRACT_ENV_KEYS,
  WALLET_ENV_KEYS,
  buildPublicConfig,
  loadNetworkConfig,
  normalizeNetworkName
};
