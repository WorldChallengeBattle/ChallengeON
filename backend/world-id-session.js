const { Wallet } = require('ethers');
const { authenticatedWalletRecipient } = require('./wallet-auth-policy');
const { APP_ID, RP_ID, SIGNER, signalHash, normalizedNullifier, uint256Decimal } = require('./world-id');

const sessionPattern = /^session_[0-9a-f]{128}$/;
const hexPattern = /^0x[0-9a-fA-F]{1,64}$/;
const sessionSignal = (wallet, authTime, nonce) => `${wallet.toLowerCase()}:${authTime}:${nonce}`;

async function getHumanSession(pool, wallet, authTime) {
  if (!Number.isSafeInteger(authTime) || authTime <= 0) return null;
  const { rows } = await pool.query(`SELECT session_id FROM world_id_login_sessions
    WHERE rp_id = $1 AND wallet = $2 AND wallet_auth_time = $3`, [RP_ID, wallet.toLowerCase(), authTime]);
  return rows[0] || null;
}

function validateSessionProof(result, challenge, wallet, authTime, now = Date.now()) {
  const expiry = new Date(challenge?.expires_at).getTime();
  if (!challenge || challenge.wallet !== wallet || challenge.rp_id !== RP_ID ||
      Number(challenge.wallet_auth_time) !== authTime || !Number.isSafeInteger(authTime) || authTime <= 0 ||
      challenge.consumed_at || !Number.isFinite(expiry) || expiry <= now ||
      result?.nonce !== challenge.nonce || result.protocol_version !== '4.0' ||
      result.environment !== 'production' || result.action !== undefined ||
      typeof result.session_id !== 'string' || !sessionPattern.test(result.session_id) ||
      (challenge.expected_session_id && result.session_id !== challenge.expected_session_id) ||
      !Array.isArray(result.responses) || result.responses.length !== 1) {
    throw new Error('Invalid or expired human session request');
  }
  const proof = result.responses[0];
  if (!proof || proof.identifier !== 'proof_of_human' || proof.issuer_schema_id !== 1 ||
      !Number.isSafeInteger(proof.expires_at_min) || proof.expires_at_min < 0 ||
      typeof proof.signal_hash !== 'string' || !hexPattern.test(proof.signal_hash) ||
      BigInt(proof.signal_hash) !== BigInt(signalHash(sessionSignal(wallet, authTime, challenge.nonce))) ||
      !Array.isArray(proof.proof) || proof.proof.length !== 5 ||
      !proof.proof.every(uint256Decimal) ||
      !Array.isArray(proof.session_nullifier) || proof.session_nullifier.length !== 2 ||
      !proof.session_nullifier.every(p => typeof p === 'string' && hexPattern.test(p)) ||
      proof.nullifier !== undefined) throw new Error('A wallet-bound Proof of Human session is required');
  return { nullifier: normalizedNullifier(proof.session_nullifier[0]),
    action: BigInt(proof.session_nullifier[1]).toString() };
}

function validateSessionVerification(verification, result, identity) {
  const proofs = verification?.results;
  if (verification?.success !== true || verification.environment !== 'production' ||
      verification.session_id !== result.session_id || verification.action !== undefined ||
      !Array.isArray(proofs) || proofs.length !== 1 || proofs[0]?.identifier !== 'proof_of_human' ||
      proofs[0].success !== true || normalizedNullifier(proofs[0].nullifier) !== identity.nullifier) {
    throw new Error('Human session verification failed');
  }
}

async function bindHumanSession(pool, result, wallet, authTime, identity) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM world_id_login_requests WHERE nonce = $1 FOR UPDATE', [result.nonce]);
    const checked = validateSessionProof(result, rows[0], wallet, authTime);
    if (checked.nullifier !== identity.nullifier || checked.action !== identity.action) throw new Error('Session proof changed');
    await client.query(`INSERT INTO world_id_login_proofs (rp_id, nullifier, proof_action, nonce)
      VALUES ($1, $2, $3, $4)`, [RP_ID, identity.nullifier, identity.action, result.nonce]);
    // Never replace a wallet's existing session with an unrelated freshly created one.
    const updated = await client.query(`INSERT INTO world_id_login_sessions (rp_id, wallet, session_id, wallet_auth_time)
      VALUES ($1, $2, $3, $4) ON CONFLICT (rp_id, wallet) DO UPDATE
      SET wallet_auth_time = EXCLUDED.wallet_auth_time, verified_at = now()
      WHERE world_id_login_sessions.session_id = EXCLUDED.session_id
        AND world_id_login_sessions.wallet_auth_time <= EXCLUDED.wallet_auth_time RETURNING wallet`,
    [RP_ID, wallet, result.session_id, authTime]);
    if (!updated.rows.length) throw new Error('Session ownership changed');
    await client.query('UPDATE world_id_login_requests SET consumed_at = now() WHERE nonce = $1', [result.nonce]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

function registerWorldIdSessionRoutes(app, pool, authenticate, env = process.env, verifyProof = fetch) {
  const configured = () => env.WORLD_ID_APP_ID === APP_ID && env.WORLD_ID_RP_ID === RP_ID &&
    env.WORLD_ID_SIGNING_KEY && new Wallet(env.WORLD_ID_SIGNING_KEY).address === SIGNER;
  const recipient = req => authenticatedWalletRecipient(req.authUser, req.authUser.wallet_address).toLowerCase();
  app.post('/api/auth/world-id/session/request', authenticate, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let wallet;
    try { wallet = recipient(req); } catch { return res.status(403).json({ error: 'Sign in again with your wallet' }); }
    try {
      if (!configured()) return res.status(503).json({ error: 'Human verification is not configured' });
      const authTime = req.authUser.auth_time;
      if (await getHumanSession(pool, wallet, authTime)) return res.json({ verified: true });
      const count = await pool.query(`SELECT count(*) FROM world_id_login_requests
        WHERE wallet = $1 AND created_at > now() - interval '10 minutes'`, [wallet]);
      if (Number(count.rows[0].count) >= 10) return res.status(429).json({ error: 'Try human verification again later' });
      const { rows } = await pool.query('SELECT session_id FROM world_id_login_sessions WHERE rp_id = $1 AND wallet = $2', [RP_ID, wallet]);
      const existing = rows[0]?.session_id || null;
      const { signRequest } = await import('@worldcoin/idkit-core/signing');
      const signed = signRequest({ signingKeyHex: env.WORLD_ID_SIGNING_KEY, ttl: 300 });
      await pool.query(`INSERT INTO world_id_login_requests
        (nonce, rp_id, wallet, wallet_auth_time, expected_session_id, expires_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [signed.nonce, RP_ID, wallet, authTime, existing, new Date(signed.expiresAt * 1000)]);
      return res.json({ app_id: APP_ID, wallet, wallet_auth_time: authTime,
        signal: sessionSignal(wallet, authTime, signed.nonce), existing_session_id: existing, rp_context: {
        rp_id: RP_ID, nonce: signed.nonce, created_at: signed.createdAt, expires_at: signed.expiresAt, signature: signed.sig
      } });
    } catch { return res.status(503).json({ error: 'Human session verification is temporarily unavailable' }); }
  });
  app.post('/api/auth/world-id/session/verify', authenticate, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let wallet;
    try { wallet = recipient(req); } catch { return res.status(403).json({ error: 'Sign in again with your wallet' }); }
    let phase = 'configuration';
    let upstreamStatus;
    try {
      if (!configured()) return res.status(503).json({ error: 'Human verification is not configured' });
      phase = 'challenge_lookup';
      const result = req.body?.result;
      if (typeof result?.nonce !== 'string' || !/^0x[0-9a-f]{64}$/.test(result.nonce)) throw new Error('Invalid nonce');
      const { rows } = await pool.query('SELECT * FROM world_id_login_requests WHERE nonce = $1', [result.nonce]);
      phase = 'proof_validation';
      const identity = validateSessionProof(result, rows[0], wallet, req.authUser.auth_time);
      phase = 'upstream_request';
      const response = await verifyProof(`https://developer.world.org/api/v4/verify/${RP_ID}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result), signal: AbortSignal.timeout(15000)
      });
      if (Number.isInteger(response.status) && response.status >= 100 && response.status <= 599) upstreamStatus = response.status;
      if (!response.ok) throw new Error('Verification failed');
      phase = 'upstream_validation';
      validateSessionVerification(await response.json(), result, identity);
      phase = 'session_binding';
      await bindHumanSession(pool, result, wallet, req.authUser.auth_time, identity);
      return res.json({ success: true });
    } catch (error) {
      console.warn(JSON.stringify({ event: 'human_session_verification_failed', phase, upstream_status: upstreamStatus }));
      if (error.code === '42P01' || error.code === '42501') return res.status(503).json({ error: 'Human session storage is not ready' });
      return res.status(error.code === '23505' ? 409 : 400).json({ error: 'Human session verification failed; start a new sign-in request' });
    }
  });
}

module.exports = { sessionSignal, getHumanSession, validateSessionProof, validateSessionVerification, bindHumanSession, registerWorldIdSessionRoutes };
