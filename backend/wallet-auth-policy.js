const { getAddress, ZeroAddress } = require('ethers');

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function validateSiweContext(message, challenge, now = Date.now()) {
  if (!challenge || challenge.expiresAt <= now || challenge.createdAt > now ||
      message.nonce !== challenge.nonce || message.domain !== challenge.domain ||
      new URL(message.uri).origin !== challenge.origin || Number(message.chainId) !== 480 || message.version !== '1') {
    throw new Error('Invalid or expired wallet login challenge');
  }
  const issuedAt = Date.parse(message.issuedAt);
  const expiresAt = Date.parse(message.expirationTime);
  if (!Number.isFinite(issuedAt) || issuedAt < challenge.createdAt - 30000 || issuedAt > now + 30000 ||
      !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > challenge.expiresAt + 30000) {
    throw new Error('Invalid wallet login lifetime');
  }
}

function authenticatedWalletRecipient(decoded, requested, now = Date.now()) {
  const wallet = getAddress(requested);
  if (wallet === ZeroAddress || decoded.wallet_verified !== true || decoded.wallet_auth_version !== 2 ||
      String(decoded.uid).toLowerCase() !== wallet.toLowerCase() ||
      String(decoded.wallet_address).toLowerCase() !== wallet.toLowerCase()) {
    throw new Error('Sign in again with the recipient wallet');
  }
  if (!Number.isFinite(decoded.auth_time) || decoded.auth_time * 1000 > now || now - decoded.auth_time * 1000 > 15 * 60 * 1000) {
    throw new Error('A recent wallet login is required');
  }
  return wallet;
}

function authenticatedRewardRecipient(decoded, requested, rewardsEnabled, now = Date.now()) {
  const wallet = authenticatedWalletRecipient(decoded, requested, now);
  if (!rewardsEnabled || decoded.world_id_verified !== true) {
    throw new Error('Welcome rewards are paused pending human verification');
  }
  return wallet;
}

module.exports = { CHALLENGE_TTL_MS, validateSiweContext, authenticatedWalletRecipient, authenticatedRewardRecipient };
