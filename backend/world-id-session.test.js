const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { Wallet, verifyMessage, getBytes } = require('ethers');
const { RP_ID, SIGNER, APP_ID, signalHash } = require('./world-id');
const { getHumanSession, validateSessionProof, validateSessionVerification,
  bindHumanSession, registerWorldIdSessionRoutes } = require('./world-id-session');

async function main() {
  const wallet = Wallet.createRandom().address.toLowerCase();
  const other = Wallet.createRandom().address.toLowerCase();
  const authTime = Math.floor(Date.now() / 1000);
  const session = 'session_' + 'ab'.repeat(64);
  const nonce = '0x' + '12'.repeat(32);
  const challenge = { nonce, rp_id: RP_ID, wallet, wallet_auth_time: authTime,
    expires_at: new Date(Date.now() + 300000), expected_session_id: null };
  const result = { protocol_version: '4.0', environment: 'production', session_id: session, nonce,
    responses: [{ identifier: 'proof_of_human', issuer_schema_id: 1, expires_at_min: 0,
      signal_hash: signalHash(wallet), session_nullifier: ['0xa', '0xb'], proof: ['0x1', '0x2', '0x3', '0x4', '0x5'] }] };
  const verification = { success: true, environment: 'production', session_id: session,
    results: [{ identifier: 'proof_of_human', success: true, nullifier: '0xa' }] };
  const identity = validateSessionProof(result, challenge, wallet, authTime);
  assert.deepEqual(identity, { nullifier: '10', action: '11' });
  assert.throws(() => validateSessionProof(result, challenge, other, authTime));
  assert.throws(() => validateSessionProof(result, challenge, wallet, authTime + 1));
  for (const change of [{ consumed_at: new Date() }, { expires_at: new Date(0) }, { rp_id: 'wrong' },
    { expected_session_id: 'session_' + 'cd'.repeat(64) }]) {
    assert.throws(() => validateSessionProof(result, { ...challenge, ...change }, wallet, authTime));
  }
  for (const change of [{ protocol_version: '3.0' }, { action: 'challengeon-welcome-reward' },
    { environment: 'staging' }, { session_id: 'session_short' }, { nonce: 'wrong' }]) {
    assert.throws(() => validateSessionProof({ ...result, ...change }, challenge, wallet, authTime));
  }
  for (const change of [{ identifier: 'selfie', issuer_schema_id: 11 }, { issuer_schema_id: 11 },
    { signal_hash: signalHash(other) }, { proof: [] }, { session_nullifier: ['0x0', '0xb'] },
    { session_nullifier: ['0xa'] }, { nullifier: '0xa' }, { expires_at_min: -1 }]) {
    assert.throws(() => validateSessionProof({ ...result, responses: [{ ...result.responses[0], ...change }] }, challenge, wallet, authTime));
  }
  validateSessionVerification(verification, result, identity);
  for (const change of [{ success: false }, { environment: 'staging' }, { session_id: 'wrong' },
    { action: 'reward' }, { results: [] }, { results: [{ identifier: 'proof_of_human', success: true, nullifier: '0xc' }] },
    { results: [{ identifier: 'selfie', success: true, nullifier: '0xa' }] }]) {
    assert.throws(() => validateSessionVerification({ ...verification, ...change }, result, identity));
  }
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(__dirname, 'migrations/20261003_world_id.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname, 'migrations/20261004_world_id_sessions.sql'), 'utf8'));
  let tail = Promise.resolve();
  const pool = { query: (sql, args) => db.query(sql, args), connect: async () => {
    const prior = tail; let release; tail = new Promise(resolve => { release = resolve; }); await prior;
    return { query: (sql, args) => db.query(sql, args), release };
  } };
  const issue = (n, w = wallet, at = authTime, expected = null) => db.query(`INSERT INTO world_id_login_requests
    (nonce, rp_id, wallet, wallet_auth_time, expected_session_id, expires_at) VALUES ($1,$2,$3,$4,$5,$6)`,
  [n, RP_ID, w, at, expected, challenge.expires_at]);
  await issue(nonce);
  const attempts = await Promise.allSettled([bindHumanSession(pool, result, wallet, authTime, identity),
    bindHumanSession(pool, result, wallet, authTime, identity)]);
  assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await getHumanSession(pool, wallet, authTime)).session_id, session);
  assert.equal(await getHumanSession(pool, wallet, authTime + 1), null);
  assert.equal(await getHumanSession(pool, wallet), null);
  assert.equal((await db.query('SELECT count(*) FROM world_id_welcome_bindings')).rows[0].count, 0);
  const nextNonce = '0x' + '34'.repeat(32);
  await issue(nextNonce, wallet, authTime + 1, session);
  const next = { ...result, nonce: nextNonce, responses: [{ ...result.responses[0], session_nullifier: ['0xc', '0xd'] }] };
  await bindHumanSession(pool, next, wallet, authTime + 1, { nullifier: '12', action: '13' });
  assert.equal(await getHumanSession(pool, wallet, authTime), null);
  assert.equal((await getHumanSession(pool, wallet, authTime + 1)).session_id, session);
  const replayNonce = '0x' + '56'.repeat(32);
  await issue(replayNonce, wallet, authTime + 1, session);
  await assert.rejects(bindHumanSession(pool, { ...next, nonce: replayNonce }, wallet, authTime + 1,
    { nullifier: '12', action: '13' }), e => e.code === '23505');
  const conflictNonce = '0x' + '78'.repeat(32);
  await issue(conflictNonce, other);
  const conflict = { ...result, nonce: conflictNonce, responses: [{ ...result.responses[0],
    signal_hash: signalHash(other), session_nullifier: ['0xe', '0xf'] }] };
  await assert.rejects(bindHumanSession(pool, conflict, other, authTime, { nullifier: '14', action: '15' }), e => e.code === '23505');
  assert.equal((await db.query('SELECT consumed_at FROM world_id_login_requests WHERE nonce=$1', [conflictNonce])).rows[0].consumed_at, null);
  assert.equal((await db.query('SELECT count(*) FROM world_id_login_proofs')).rows[0].count, 2);

  const app = require('express')(); app.use(require('express').json());
  const authenticate = (req, res, next) => {
    if (req.headers.authorization !== 'Bearer fixture') return res.sendStatus(401);
    req.authUser = { uid: other, wallet_address: other, wallet_verified: true, wallet_auth_version: 2, auth_time: authTime };
    next();
  };
  const envPath = path.join(__dirname, '.env');
  const env = fs.existsSync(envPath) ? require('dotenv').parse(fs.readFileSync(envPath)) : {};
  let called = 0;
  registerWorldIdSessionRoutes(app, pool, authenticate, env, async (url, opts) => {
    called++; assert.equal(url, `https://developer.world.org/api/v4/verify/${RP_ID}`);
    const body = JSON.parse(opts.body);
    assert.equal(body.action, undefined);
    return { ok: true, json: async () => ({ ...verification, session_id: body.session_id,
      results: [{ identifier: 'proof_of_human', success: true, nullifier: body.responses[0].session_nullifier[0] }] }) };
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/auth/world-id/session`;
  try {
    assert.equal((await fetch(base + '/request', { method: 'POST' })).status, 401);
    if (env.WORLD_ID_SIGNING_KEY) {
      assert.equal(new Wallet(env.WORLD_ID_SIGNING_KEY).address, SIGNER); assert.equal(env.WORLD_ID_APP_ID, APP_ID);
      const data = await (await fetch(base + '/request', { method: 'POST', headers: { Authorization: 'Bearer fixture' } })).json();
      assert.equal(data.action, undefined); assert.equal(data.existing_session_id, null);
      const { computeRpSignatureMessage } = await import('@worldcoin/idkit-core/signing');
      assert.equal(verifyMessage(computeRpSignatureMessage(getBytes(data.rp_context.nonce), data.rp_context.created_at,
        data.rp_context.expires_at), data.rp_context.signature), SIGNER);
      const fixture = { ...conflict, nonce: data.rp_context.nonce, session_id: 'session_' + 'ef'.repeat(64) };
      const send = result => fetch(base + '/verify', { method: 'POST',
        headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' }, body: JSON.stringify({ result }) });
      assert.equal((await send({ ...fixture, environment: 'staging' })).status, 400); assert.equal(called, 0);
      assert.equal((await send(fixture)).status, 200); assert.equal(called, 1);
      assert.equal((await send(fixture)).status, 400); assert.equal(called, 1);
      const bound = await fetch(base + '/request', { method: 'POST', headers: { Authorization: 'Bearer fixture' } });
      assert.deepEqual(await bound.json(), { verified: true });
    } else console.log('Configured session HTTP signing test skipped: no local key');
  } finally { await new Promise(resolve => server.close(resolve)); await db.close(); }
  console.log('Human sessions: wallet/nonce/credential/session/auth-time validation, reuse, replay and transactional rollback passed; rewards untouched.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
