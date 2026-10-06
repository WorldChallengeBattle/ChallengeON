const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { Wallet, verifyMessage, getBytes } = require('ethers');
const { APP_ID, RP_ID, SIGNER, signalHash } = require('./world-id');
const { LOGIN_ACTION, loginSignal, getHumanLogin, validateLoginProof, validateLoginVerification,
  bindHumanLogin, registerWorldIdLoginRoutes } = require('./world-id-login');
const { createHumanAccessGate } = require('./human-access');

async function main() {
  const wallet = Wallet.createRandom().address.toLowerCase();
  const other = Wallet.createRandom().address.toLowerCase();
  const authTime = Math.floor(Date.now() / 1000) - 10;
  const nonce = '0x' + '12'.repeat(32);
  const challenge = { nonce, rp_id: RP_ID, action: LOGIN_ACTION, wallet, wallet_auth_time: authTime,
    expires_at: new Date(Date.now() + 300000) };
  const proofFor = (n = nonce, w = wallet, at = authTime, legacy = false, nullifier = '0xa') => ({
    protocol_version: legacy ? '3.0' : '4.0', environment: 'production', action: LOGIN_ACTION, nonce: n,
    responses: [{ identifier: legacy ? 'orb' : 'proof_of_human', nullifier,
      signal_hash: signalHash(loginSignal(w, at, n)), ...(legacy
        ? { merkle_root: '0x' + 'ab'.repeat(32), proof: '0x' + '12'.repeat(256) }
        : { issuer_schema_id: 1, expires_at_min: 0, proof: ['1', '2', '3', '4', '5'] }) }]
  });
  const result = proofFor();
  const identity = validateLoginProof(result, challenge, wallet, authTime);
  for (const value of ['0x1', '-1', '1.5', '1e2', '01', '', ' 1', 1, null, (1n << 256n).toString(), '9'.repeat(79)]) {
    assert.throws(() => validateLoginProof({ ...result, responses: [{ ...result.responses[0], proof: [value, '2', '3', '4', '5'] }] }, challenge, wallet, authTime));
  }
  validateLoginProof({ ...result, responses: [{ ...result.responses[0], proof: ['0', ((1n << 256n) - 1n).toString(), '3', '4', '5'] }] }, challenge, wallet, authTime);
  assert.deepEqual(identity, { protocol: '4.0', identifier: 'proof_of_human', nullifier: '10' });
  const legacy = proofFor(nonce, wallet, authTime, true);
  assert.equal(validateLoginProof(legacy, challenge, wallet, authTime).identifier, 'orb');
  assert.throws(() => validateLoginProof(result, challenge, other, authTime));
  assert.throws(() => validateLoginProof(result, challenge, wallet, authTime + 1));
  for (const change of [{ consumed_at: new Date() }, { expires_at: new Date(0) }, { rp_id: 'wrong' }, { action: 'reward' }]) {
    assert.throws(() => validateLoginProof(result, { ...challenge, ...change }, wallet, authTime));
  }
  for (const change of [{ environment: 'staging' }, { protocol_version: '2.0' }, { nonce: 'wrong' },
    { action: 'challengeon-welcome-reward' }, { session_id: 'session_fixture' }, { responses: [] },
    { responses: [result.responses[0], result.responses[0]] }]) {
    assert.throws(() => validateLoginProof({ ...result, ...change }, challenge, wallet, authTime));
  }
  for (const change of [{ identifier: 'selfie', issuer_schema_id: 11 }, { issuer_schema_id: 11 },
    { nullifier: '0x0' }, { signal_hash: signalHash(wallet) }, { proof: [] }, { session_nullifier: ['0xa','0xb'] }, { expires_at_min: -1 }]) {
    assert.throws(() => validateLoginProof({ ...result, responses: [{ ...result.responses[0], ...change }] }, challenge, wallet, authTime));
  }
  for (const change of [{ identifier: 'device' }, { identifier: 'document' }, { proof: '0x12' }, { merkle_root: 'bad' }]) {
    assert.throws(() => validateLoginProof({ ...legacy, responses: [{ ...legacy.responses[0], ...change }] }, challenge, wallet, authTime));
  }
  const verifiedFor = proof => ({ success: true, environment: 'production', action: LOGIN_ACTION,
    results: [{ identifier: proof.responses[0].identifier, success: true, nullifier: proof.responses[0].nullifier }] });
  const verification = verifiedFor(result);
  validateLoginVerification(verification, identity);
  validateLoginVerification({ ...verification, session_id: null }, identity);
  validateLoginProof({ ...result, session_id: null }, challenge, wallet, authTime);
  validateLoginVerification(verifiedFor(legacy), validateLoginProof(legacy, challenge, wallet, authTime));
  for (const change of [{ success: false }, { environment: 'staging' }, { action: 'reward' }, { session_id: 'session_fixture' },
    { results: [] }, { results: [{ identifier: 'orb', success: true, nullifier: '0xa' }] },
    { results: [{ identifier: 'proof_of_human', success: true, nullifier: '0xb' }] }]) {
    assert.throws(() => validateLoginVerification({ ...verification, ...change }, identity));
  }

  const db = new PGlite();
  for (const migration of ['20261003_world_id.sql', '20261004_world_id_sessions.sql', '20261005_world_id_human_login.sql']) {
    await db.exec(fs.readFileSync(path.join(__dirname, 'migrations', migration), 'utf8'));
  }
  let tail = Promise.resolve();
  const pool = { query: (sql, args) => db.query(sql, args), connect: async () => {
    const prior = tail; let release; tail = new Promise(resolve => { release = resolve; }); await prior;
    return { query: (sql, args) => db.query(sql, args), release };
  } };
  const issue = (n, w = wallet, at = authTime) => db.query(`INSERT INTO world_id_human_login_requests
    (nonce,rp_id,action,wallet,wallet_auth_time,expires_at) VALUES ($1,$2,$3,$4,$5,$6)`,
  [n, RP_ID, LOGIN_ACTION, w, at, challenge.expires_at]);
  await issue(nonce);
  const attempts = await Promise.allSettled([bindHumanLogin(pool, result, wallet, authTime, identity),
    bindHumanLogin(pool, result, wallet, authTime, identity)]);
  assert.equal(attempts.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal((await getHumanLogin(pool, wallet, authTime)).nullifier, '10');
  assert.equal(await getHumanLogin(pool, wallet, authTime + 1), null);
  assert.equal(await getHumanLogin(pool, wallet), null);
  const nextNonce = '0x' + '34'.repeat(32);
  await issue(nextNonce, wallet, authTime + 1);
  const next = proofFor(nextNonce, wallet, authTime + 1);
  await bindHumanLogin(pool, next, wallet, authTime + 1, identity);
  assert.equal(await getHumanLogin(pool, wallet, authTime), null);
  assert.equal((await getHumanLogin(pool, wallet, authTime + 1)).nullifier, '10');
  // Changing only the envelope nonce cannot replay an old proof's signed signal.
  const replayNonce = '0x' + '56'.repeat(32);
  await issue(replayNonce, wallet, authTime + 1);
  await assert.rejects(bindHumanLogin(pool, { ...next, nonce: replayNonce }, wallet, authTime + 1, identity));
  const ownerNonce = '0x' + '78'.repeat(32);
  await issue(ownerNonce, other);
  const owner = proofFor(ownerNonce, other);
  await assert.rejects(bindHumanLogin(pool, owner, other, authTime, identity), e => e.code === '23505');
  assert.equal((await db.query('SELECT consumed_at FROM world_id_human_login_requests WHERE nonce=$1', [ownerNonce])).rows[0].consumed_at, null);
  const replacement = proofFor(replayNonce, wallet, authTime + 1, false, '0xb');
  await assert.rejects(bindHumanLogin(pool, replacement, wallet, authTime + 1,
    validateLoginProof(replacement, { ...challenge, nonce: replayNonce, wallet_auth_time: authTime + 1 }, wallet, authTime + 1)));
  // Legacy replay protection uses the fresh signal, not the untrusted envelope nonce.
  const legacyNonce = '0x' + '9a'.repeat(32);
  await issue(legacyNonce, other);
  const legacyProof = proofFor(legacyNonce, other, authTime, true);
  const legacyIdentity = validateLoginProof(legacyProof, { ...challenge, nonce: legacyNonce, wallet: other }, other, authTime);
  await bindHumanLogin(pool, legacyProof, other, authTime, legacyIdentity);
  const legacyNextNonce = '0x' + 'bc'.repeat(32);
  await issue(legacyNextNonce, other, authTime + 1);
  await assert.rejects(bindHumanLogin(pool, { ...legacyProof, nonce: legacyNextNonce }, other, authTime + 1, legacyIdentity));
  await bindHumanLogin(pool, proofFor(legacyNextNonce, other, authTime + 1, true), other, authTime + 1, legacyIdentity);
  const switchNonce = '0x' + 'ef'.repeat(32);
  await issue(switchNonce, other, authTime + 1);
  const switched = proofFor(switchNonce, other, authTime + 1);
  await assert.rejects(bindHumanLogin(pool, switched, other, authTime + 1, identity));
  const oldNonce = '0x' + 'de'.repeat(32);
  await issue(oldNonce, wallet);
  await assert.rejects(bindHumanLogin(pool, proofFor(oldNonce), wallet, authTime, identity));
  assert.equal((await getHumanLogin(pool, wallet, authTime + 1)).nullifier, '10');
  assert.equal((await db.query('SELECT count(*) FROM world_id_welcome_bindings')).rows[0].count, 0);
  assert.equal((await db.query('SELECT count(*) FROM world_id_login_sessions')).rows[0].count, 0);
  const tables = (await db.query("SELECT relrowsecurity FROM pg_class WHERE relname IN ('world_id_human_logins','world_id_human_login_requests')")).rows;
  assert.equal(tables.length, 2); assert(tables.every(table => table.relrowsecurity));

  const app = require('express')(); app.use(require('express').json());
  const httpWallet = Wallet.createRandom().address.toLowerCase();
  let httpAuthTime = authTime, upstreamFailure = false, wrongVerification = false, calls = 0, invalidWallet = false, storageFailure = false;
  const authenticate = (req, res, next) => {
    if (req.headers.authorization !== 'Bearer fixture') return res.sendStatus(401);
    req.authUser = { uid: httpWallet, wallet_address: httpWallet, wallet_verified: !invalidWallet,
      world_id_verified: true, wallet_auth_version: 2, auth_time: httpAuthTime };
    next();
  };
  const envPath = path.join(__dirname, '.env');
  const env = fs.existsSync(envPath) ? require('dotenv').parse(fs.readFileSync(envPath)) : {};
  const config = { ...env, WORLD_ID_LOGIN_ACTION: LOGIN_ACTION };
  const sent = [];
  const httpPool = { ...pool, query: (sql, args) => {
    if (storageFailure) { const error = new Error('private fixture'); error.code = '42P01'; throw error; }
    return pool.query(sql, args);
  } };
  app.use('/api', createHumanAccessGate(httpPool, authenticate));
  app.get('/api/challenges', (_req, res) => res.sendStatus(200));
  registerWorldIdLoginRoutes(app, httpPool, authenticate, config, async (url, options) => {
    calls++; assert.equal(url, `https://developer.world.org/api/v4/verify/${RP_ID}`);
    const body = JSON.parse(options.body); sent.push(body);
    return { ok: !upstreamFailure, status: upstreamFailure ? 422 : 200,
      json: async () => wrongVerification ? { ...verifiedFor(body), success: false } : verifiedFor(body) };
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/auth/world-id/login`;
  const request = () => fetch(base + '/request', { method: 'POST', headers: { Authorization: 'Bearer fixture' } });
  const send = proof => fetch(base + '/verify', { method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' },
    body: JSON.stringify({ result: proof }) });
  const protectedRequest = () => fetch(base.replace('/api/auth/world-id/login', '/api/challenges'), { headers: { Authorization: 'Bearer fixture' } });
  const warnings = [];
  const previousWarn = console.warn;
  console.warn = message => warnings.push(JSON.parse(message));
  try {
    assert.equal((await fetch(base + '/request', { method: 'POST' })).status, 401);
    assert.equal((await fetch(base + '/verify', { method: 'POST' })).status, 401);
    invalidWallet = true; assert.equal((await request()).status, 403); invalidWallet = false;
    assert.equal((await protectedRequest()).status, 403);
    storageFailure = true; assert.equal((await protectedRequest()).status, 503); storageFailure = false;
    if (env.WORLD_ID_SIGNING_KEY) {
      assert.equal(new Wallet(env.WORLD_ID_SIGNING_KEY).address, SIGNER);
      assert.equal(config.WORLD_ID_APP_ID, APP_ID);
      config.WORLD_ID_LOGIN_ACTION = 'challengeon-welcome-reward';
      assert.equal((await request()).status, 503); config.WORLD_ID_LOGIN_ACTION = LOGIN_ACTION;
      const response = await request(); assert.equal(response.status, 200);
      const data = await response.json(); assert.equal(data.action, LOGIN_ACTION);
      assert.equal(data.signal, loginSignal(httpWallet, httpAuthTime, data.rp_context.nonce));
      const { computeRpSignatureMessage } = await import('@worldcoin/idkit-core/signing');
      assert.equal(verifyMessage(computeRpSignatureMessage(getBytes(data.rp_context.nonce), data.rp_context.created_at,
        data.rp_context.expires_at, LOGIN_ACTION), data.rp_context.signature), SIGNER);
      const fixture = proofFor(data.rp_context.nonce, httpWallet, httpAuthTime, false, '0xc');
      storageFailure = true;
      const unavailable = await send(fixture); assert.equal(unavailable.status, 503);
      assert.doesNotMatch(JSON.stringify(await unavailable.json()), /private fixture/); storageFailure = false;
      assert.equal((await send({ ...fixture, environment: 'staging' })).status, 400); assert.equal(calls, 0);
      upstreamFailure = true; assert.equal((await send(fixture)).status, 400); upstreamFailure = false;
      assert.equal(await getHumanLogin(pool, httpWallet, httpAuthTime), null);
      wrongVerification = true; assert.equal((await send(fixture)).status, 400); wrongVerification = false;
      assert.equal(await getHumanLogin(pool, httpWallet, httpAuthTime), null);
      assert.equal((await send(fixture)).status, 200); assert.deepEqual(sent.at(-1), fixture);
      assert.equal((await protectedRequest()).status, 403);
      const verifiedCalls = calls;
      assert.equal((await send(fixture)).status, 400); assert.equal(calls, verifiedCalls);
      assert.deepEqual(await (await request()).json(), { verified: true });
      httpAuthTime++;
      assert.equal((await protectedRequest()).status, 403);
      const repeated = await (await request()).json();
      assert.notEqual(repeated.rp_context.nonce, data.rp_context.nonce);
      assert.equal((await send(fixture)).status, 400);
      assert.equal((await send(proofFor(repeated.rp_context.nonce, httpWallet, httpAuthTime, false, '0xc'))).status, 200);
      assert.equal((await protectedRequest()).status, 403);
      assert.equal(await getHumanLogin(pool, httpWallet, httpAuthTime - 1), null);
      httpAuthTime++;
      for (let i = 0; i < 8; i++) assert.equal((await request()).status, 200);
      assert.equal((await request()).status, 429);
      assert.deepEqual([...new Set(warnings.map(warning => warning.stage))].sort(),
        ['challenge_lookup', 'proof_validation', 'upstream_request', 'upstream_validation']);
      assert(warnings.some(warning => warning.stage === 'upstream_request' && warning.upstream_status === 422));
      assert(warnings.every(warning => warning.event === 'human_login_verification_failed' &&
        Object.keys(warning).every(key => ['event', 'stage', 'upstream_status'].includes(key))));
      console.log('Login HTTP: offline RP action signing, exact upstream forwarding, first/repeated login, and verifier failure/replay denial passed.');
    } else console.log('Configured login HTTP signing skipped: no local RP key; structural/DB tests still ran.');
  } finally { console.warn = previousWarn; await new Promise(resolve => server.close(resolve)); await db.close(); }
  console.log('Human login: v4 PoH/v3 Orb, fresh signal, same-owner repeat, cross-wallet/replay/identity replacement/old-login denial and RLS passed; rewards/sessions untouched.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
