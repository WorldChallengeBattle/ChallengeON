const { Wallet } = require('ethers');
const { authenticatedWalletRecipient } = require('./wallet-auth-policy');
const { APP_ID, RP_ID, SIGNER, signalHash, normalizedNullifier } = require('./world-id');

const LOGIN_ACTION = 'challengeon-human-login';
const hex = /^0x[0-9a-fA-F]{1,64}$/;
const uint256Decimal = value => typeof value === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(value) && BigInt(value) < (1n << 256n);
const loginSignal = (wallet, authTime, nonce) => `${wallet.toLowerCase()}:${authTime}:${nonce}`;

async function getHumanLogin(pool, wallet, authTime) {
  if (!Number.isSafeInteger(authTime) || authTime <= 0) return null;
  const { rows } = await pool.query(`SELECT nullifier FROM world_id_human_logins
    WHERE rp_id = $1 AND wallet = $2 AND wallet_auth_time = $3 AND action = $4`,
  [RP_ID, wallet.toLowerCase(), authTime, LOGIN_ACTION]);
  return rows[0] || null;
}

function validateLoginProof(result, challenge, wallet, authTime, now = Date.now()) {
  const expiry = new Date(challenge?.expires_at).getTime();
  if (!challenge || challenge.wallet !== wallet || challenge.rp_id !== RP_ID || challenge.action !== LOGIN_ACTION ||
      Number(challenge.wallet_auth_time) !== authTime || !Number.isSafeInteger(authTime) || authTime <= 0 ||
      challenge.consumed_at || !Number.isFinite(expiry) || expiry <= now || result?.nonce !== challenge.nonce ||
      result.environment !== 'production' || result.action !== LOGIN_ACTION || result.session_id != null ||
      !['4.0', '3.0'].includes(result.protocol_version) || !Array.isArray(result.responses) || result.responses.length !== 1) {
    throw new Error('Invalid or expired human login request');
  }
  const proof = result.responses[0];
  if (!proof || proof.session_nullifier != null || typeof proof.signal_hash !== 'string' || !hex.test(proof.signal_hash) ||
      BigInt(proof.signal_hash) !== BigInt(signalHash(loginSignal(wallet, authTime, challenge.nonce)))) {
    throw new Error('A fresh wallet-bound human proof is required');
  }
  if (result.protocol_version === '4.0') {
    if (proof.identifier !== 'proof_of_human' || proof.issuer_schema_id !== 1 ||
        !Number.isSafeInteger(proof.expires_at_min) || proof.expires_at_min < 0 ||
        !Array.isArray(proof.proof) || proof.proof.length !== 5 ||
        !proof.proof.every(uint256Decimal)) {
      throw new Error('Proof of Human schema 1 is required');
    }
  } else if (proof.identifier !== 'orb' || typeof proof.merkle_root !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(proof.merkle_root) ||
      typeof proof.proof !== 'string' || !/^0x[0-9a-fA-F]{512}$/.test(proof.proof)) {
    throw new Error('Only legacy Orb human verification is supported');
  }
  return { protocol: result.protocol_version, identifier: proof.identifier, nullifier: normalizedNullifier(proof.nullifier) };
}

function validateLoginVerification(verification, identity) {
  const verified = verification?.results;
  if (verification?.success !== true || verification.environment !== 'production' || verification.action !== LOGIN_ACTION ||
      verification.session_id != null || !Array.isArray(verified) || verified.length !== 1 ||
      verified[0]?.identifier !== identity.identifier || verified[0].success !== true ||
      normalizedNullifier(verified[0].nullifier) !== identity.nullifier) {
    throw new Error('Human login verification failed');
  }
}

async function bindHumanLogin(pool, result, wallet, authTime, identity) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM world_id_human_login_requests WHERE nonce = $1 FOR UPDATE', [result.nonce]);
    const checked = validateLoginProof(result, rows[0], wallet, authTime);
    if (checked.protocol !== identity.protocol || checked.identifier !== identity.identifier || checked.nullifier !== identity.nullifier) {
      throw new Error('Human identity changed');
    }
    // Repeated proofs refresh the same owner, never transfer or replace the identity.
    const updated = await client.query(`INSERT INTO world_id_human_logins
      (rp_id, action, wallet, protocol_version, identifier, nullifier, wallet_auth_time)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (rp_id, action, wallet) DO UPDATE
      SET wallet_auth_time = EXCLUDED.wallet_auth_time, verified_at = now()
      WHERE world_id_human_logins.protocol_version = EXCLUDED.protocol_version
        AND world_id_human_logins.identifier = EXCLUDED.identifier
        AND world_id_human_logins.nullifier = EXCLUDED.nullifier
        AND world_id_human_logins.wallet_auth_time <= EXCLUDED.wallet_auth_time RETURNING wallet`,
    [RP_ID, LOGIN_ACTION, wallet, identity.protocol, identity.identifier, identity.nullifier, authTime]);
    if (!updated.rows.length) throw new Error('Human login ownership changed');
    await client.query('UPDATE world_id_human_login_requests SET consumed_at = now() WHERE nonce = $1', [result.nonce]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

function registerWorldIdLoginRoutes(app, pool, authenticate, env = process.env, verifyProof = fetch) {
  const configured = () => env.WORLD_ID_APP_ID === APP_ID && env.WORLD_ID_RP_ID === RP_ID &&
    env.WORLD_ID_LOGIN_ACTION === LOGIN_ACTION && env.WORLD_ID_SIGNING_KEY && new Wallet(env.WORLD_ID_SIGNING_KEY).address === SIGNER;
  const recipient = req => authenticatedWalletRecipient(req.authUser, req.authUser.wallet_address).toLowerCase();
  app.post('/api/auth/world-id/login/request', authenticate, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let wallet;
    try { wallet = recipient(req); } catch { return res.status(403).json({ error: 'Sign in again with your wallet' }); }
    try {
      if (!configured()) return res.status(503).json({ error: 'Human login verification is not configured' });
      const authTime = req.authUser.auth_time;
      if (await getHumanLogin(pool, wallet, authTime)) return res.json({ verified: true });
      const count = await pool.query(`SELECT count(*) FROM world_id_human_login_requests
        WHERE wallet = $1 AND created_at > now() - interval '10 minutes'`, [wallet]);
      if (Number(count.rows[0].count) >= 10) return res.status(429).json({ error: 'Try human verification again later' });
      const { signRequest } = await import('@worldcoin/idkit-core/signing');
      const signed = signRequest({ signingKeyHex: env.WORLD_ID_SIGNING_KEY, action: LOGIN_ACTION, ttl: 300 });
      await pool.query(`INSERT INTO world_id_human_login_requests (nonce, rp_id, action, wallet, wallet_auth_time, expires_at)
        VALUES ($1,$2,$3,$4,$5,$6)`, [signed.nonce, RP_ID, LOGIN_ACTION, wallet, authTime, new Date(signed.expiresAt * 1000)]);
      return res.json({ app_id: APP_ID, action: LOGIN_ACTION, wallet, wallet_auth_time: authTime,
        signal: loginSignal(wallet, authTime, signed.nonce), rp_context: { rp_id: RP_ID, nonce: signed.nonce,
          created_at: signed.createdAt, expires_at: signed.expiresAt, signature: signed.sig } });
    } catch { return res.status(503).json({ error: 'Human login verification is temporarily unavailable' }); }
  });
  app.post('/api/auth/world-id/login/verify', authenticate, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let wallet;
    try { wallet = recipient(req); } catch { return res.status(403).json({ error: 'Sign in again with your wallet' }); }
    let stage = 'configuration';
    let upstreamStatus;
    try {
      if (!configured()) return res.status(503).json({ error: 'Human login verification is not configured' });
      stage = 'challenge_lookup';
      const result = req.body?.result;
      if (typeof result?.nonce !== 'string' || !/^0x[0-9a-f]{64}$/.test(result.nonce)) throw new Error('Invalid nonce');
      const { rows } = await pool.query('SELECT * FROM world_id_human_login_requests WHERE nonce = $1', [result.nonce]);
      stage = 'proof_validation';
      const identity = validateLoginProof(result, rows[0], wallet, req.authUser.auth_time);
      stage = 'upstream_request';
      const response = await verifyProof(`https://developer.world.org/api/v4/verify/${RP_ID}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result), signal: AbortSignal.timeout(15000)
      });
      if (Number.isInteger(response.status) && response.status >= 100 && response.status <= 599) upstreamStatus = response.status;
      if (!response.ok) throw new Error('Verification failed');
      stage = 'upstream_validation';
      validateLoginVerification(await response.json(), identity);
      stage = 'identity_binding';
      await bindHumanLogin(pool, result, wallet, req.authUser.auth_time, identity);
      return res.json({ success: true });
    } catch (error) {
      console.warn(JSON.stringify({ event: 'human_login_verification_failed', stage, upstream_status: upstreamStatus }));
      if (error.code === '42P01' || error.code === '42501') return res.status(503).json({ error: 'Human login storage is not ready' });
      return res.status(error.code === '23505' ? 409 : 400).json({ error: 'Human login verification failed; start a new sign-in request' });
    }
  });
}

module.exports = { LOGIN_ACTION, loginSignal, getHumanLogin, validateLoginProof, validateLoginVerification,
  bindHumanLogin, registerWorldIdLoginRoutes };
