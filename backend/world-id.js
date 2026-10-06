const { Wallet, keccak256, getBytes, toUtf8Bytes, toBeHex, AbiCoder } = require('ethers');
const { authenticatedWalletRecipient } = require('./wallet-auth-policy');

const ACTION = 'challengeon-welcome-reward';
const APP_ID = 'app_a5a8b0a2d65c376bf242d317a9f4ac78';
const RP_ID = 'rp_cba96127b0447fa4';
const SIGNER = '0xD6790da916e0a46bf570EA037121c68f9340AAcc';
// IDKit interprets valid 0x-prefixed signals as bytes, not UTF-8 text.
const signalHash = (signal) => toBeHex(BigInt(keccak256(
  /^0x(?:[0-9a-fA-F]{2})+$/.test(signal) ? getBytes(signal) : toUtf8Bytes(signal)
)) >> 8n, 32);

function normalizedNullifier(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(value) || BigInt(value) === 0n) {
    throw new Error('Invalid identity nullifier');
  }
  return BigInt(value).toString();
}

function identityForClaim(nullifier) {
  return keccak256(AbiCoder.defaultAbiCoder().encode(['string', 'string', 'uint256'], [RP_ID, ACTION, nullifier]));
}

function validateProof(result, challenge, wallet, now = Date.now()) {
  const expiry = new Date(challenge?.expires_at).getTime();
  if (!challenge || challenge.wallet !== wallet || challenge.rp_id !== RP_ID || challenge.action !== ACTION ||
      challenge.consumed_at || !Number.isFinite(expiry) || expiry <= now ||
      result?.nonce !== challenge.nonce || result.environment !== 'production' || result.action !== ACTION ||
      result.protocol_version !== '4.0' || result.session_id || !Array.isArray(result.responses) || result.responses.length !== 1) {
    throw new Error('Invalid or expired human verification request');
  }
  const proof = result.responses[0];
  if (proof.identifier !== 'proof_of_human' || proof.issuer_schema_id !== 1 ||
      !Number.isSafeInteger(proof.expires_at_min) || proof.expires_at_min < 0 ||
      typeof proof.signal_hash !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(proof.signal_hash) ||
      BigInt(proof.signal_hash) !== BigInt(signalHash(wallet)) ||
      !Array.isArray(proof.proof) || proof.proof.length !== 5 ||
      !proof.proof.every(p => typeof p === 'string' && /^0x[0-9a-fA-F]{1,64}$/.test(p))) {
    throw new Error('A wallet-bound Proof of Human is required');
  }
  return normalizedNullifier(proof.nullifier);
}

function validateVerification(verification, nullifier) {
  const result = verification?.results?.find(r => r.identifier === 'proof_of_human');
  if (verification?.success !== true || verification.environment !== 'production' ||
      verification.action !== ACTION || result?.success !== true || normalizedNullifier(result.nullifier) !== nullifier) {
    throw new Error('Human verification failed');
  }
}

async function bindIdentity(pool, result, wallet, nullifier) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM world_id_requests WHERE nonce = $1 FOR UPDATE', [result.nonce]);
    if (validateProof(result, rows[0], wallet) !== nullifier) throw new Error('Identity changed');
    // Unique constraints bind one identity to one wallet, and one wallet to one identity.
    await client.query(`INSERT INTO world_id_welcome_bindings (rp_id, action, nullifier, wallet)
      VALUES ($1, $2, $3, $4)`, [RP_ID, ACTION, nullifier, wallet]);
    await client.query('UPDATE world_id_requests SET consumed_at = now() WHERE nonce = $1', [result.nonce]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getWelcomeBinding(pool, wallet) {
  const { rows } = await pool.query('SELECT nullifier FROM world_id_welcome_bindings WHERE rp_id = $1 AND action = $2 AND wallet = $3',
    [RP_ID, ACTION, wallet.toLowerCase()]);
  return rows[0] || null;
}

function registerWorldIdRoutes(app, pool, requireAuthenticatedUser, env = process.env, fetchProof = fetch) {
  function configured() {
    return env.WORLD_ID_APP_ID === APP_ID && env.WORLD_ID_RP_ID === RP_ID && env.WORLD_ID_ACTION === ACTION &&
      env.WORLD_ID_SIGNING_KEY && new Wallet(env.WORLD_ID_SIGNING_KEY).address === SIGNER;
  }
  const recipient = (req) => authenticatedWalletRecipient(req.authUser, req.authUser.wallet_address).toLowerCase();
  app.post('/api/auth/world-id/request', requireAuthenticatedUser, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let wallet;
    try { wallet = recipient(req); } catch { return res.status(403).json({ error: 'Sign in again with your wallet' }); }
    try {
      if (!configured()) return res.status(503).json({ error: 'Human verification is not configured' });
      if (await getWelcomeBinding(pool, wallet)) return res.json({ verified: true });
      const count = await pool.query(`SELECT count(*) FROM world_id_requests WHERE wallet = $1 AND created_at > now() - interval '10 minutes'`, [wallet]);
      if (Number(count.rows[0].count) >= 10) return res.status(429).json({ error: 'Try human verification again later' });
      const { signRequest } = await import('@worldcoin/idkit-core/signing');
      const signed = signRequest({ signingKeyHex: env.WORLD_ID_SIGNING_KEY, action: ACTION, ttl: 300 });
      await pool.query(`INSERT INTO world_id_requests (nonce, rp_id, action, wallet, expires_at) VALUES ($1, $2, $3, $4, $5)`,
        [signed.nonce, RP_ID, ACTION, wallet, new Date(signed.expiresAt * 1000)]);
      return res.json({ app_id: APP_ID, action: ACTION, signal: wallet, rp_context: {
        rp_id: RP_ID, nonce: signed.nonce, created_at: signed.createdAt, expires_at: signed.expiresAt, signature: signed.sig
      } });
    } catch { return res.status(503).json({ error: 'Human verification is temporarily unavailable' }); }
  });

  app.post('/api/auth/world-id/verify', requireAuthenticatedUser, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let wallet;
    try { wallet = recipient(req); } catch { return res.status(403).json({ error: 'Sign in again with your wallet' }); }
    try {
      if (!configured()) return res.status(503).json({ error: 'Human verification is not configured' });
      const result = req.body?.result;
      if (typeof result?.nonce !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(result.nonce)) throw new Error('Invalid nonce');
      const { rows } = await pool.query('SELECT * FROM world_id_requests WHERE nonce = $1', [result.nonce]);
      const nullifier = validateProof(result, rows[0], wallet);
      const response = await fetchProof(`https://developer.world.org/api/v4/verify/${RP_ID}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result), signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error('Verification failed');
      validateVerification(await response.json(), nullifier);
      await bindIdentity(pool, result, wallet, nullifier);
      return res.json({ success: true });
    } catch (error) {
      if (error.code === '42P01' || error.code === '42501') return res.status(503).json({ error: 'Human verification storage is not ready' });
      return res.status(error.code === '23505' ? 409 : 400).json({ error: error.code === '23505'
        ? 'This identity or wallet is already registered for the welcome reward' : 'Human verification failed; request a new proof' });
    }
  });
}

const uint256Decimal = value => typeof value === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(value) && BigInt(value) < (1n << 256n);

module.exports = { ACTION, APP_ID, RP_ID, SIGNER, signalHash, normalizedNullifier, uint256Decimal, identityForClaim,
  validateProof, validateVerification, bindIdentity, getWelcomeBinding, registerWorldIdRoutes };
