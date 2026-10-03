const { getAddress, ZeroAddress } = require('ethers');
const { getWelcomeBinding } = require('./world-id');

function createHumanAccessGate(pool, authenticate) {
  const bootstrap = new Set(['GET /auth/nonce', 'POST /auth/complete-siwe', 'GET /auth/profile',
    'POST /auth/world-id/request', 'POST /auth/world-id/verify', 'GET /chain-config']);
  const jobs = new Set(['GET /sync-now', 'POST /sync-empty-now', 'POST /videos/maintenance']);
  return function humanAccess(req, res, next) {
    const route = `${req.method} ${req.path}`;
    if (bootstrap.has(route) || jobs.has(route) ||
        (req.method === 'POST' && /^\/internal\/jobs\/[a-z-]+$/.test(req.path))) return next();
    return authenticate(req, res, async () => {
      let wallet;
      try {
        wallet = getAddress(req.authUser.wallet_address);
        if (wallet === ZeroAddress || req.authUser.wallet_verified !== true || req.authUser.wallet_auth_version !== 2 ||
            String(req.authUser.uid).toLowerCase() !== wallet.toLowerCase()) throw new Error('Wallet login required');
      } catch { return res.status(403).json({ error: 'Wallet login required', code: 'wallet_required' }); }
      try {
        if (!await getWelcomeBinding(pool, wallet)) {
          return res.status(403).json({ error: 'World ID human verification required', code: 'human_required' });
        }
        res.set('Cache-Control', 'no-store');
        next();
      } catch { return res.status(503).json({ error: 'Human verification is temporarily unavailable' }); }
    });
  };
}

module.exports = { createHumanAccessGate };
