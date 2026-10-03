const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { Wallet, getBytes, verifyMessage, Interface } = require('ethers');
const { validateWelcomeReceipt } = require('./wallet-profile');
const { ACTION, APP_ID, RP_ID, SIGNER, signalHash, normalizedNullifier, identityForClaim,
  validateProof, validateVerification, bindIdentity, getWelcomeBinding, registerWorldIdRoutes } = require('./world-id');

async function main() {
  const wallet = Wallet.createRandom().address.toLowerCase();
  const other = Wallet.createRandom().address.toLowerCase();
  const nonce = '0x' + '12'.repeat(32);
  const challenge = { nonce, wallet, rp_id: RP_ID, action: ACTION, expires_at: new Date(Date.now() + 300000), consumed_at: null };
  const proof = { protocol_version: '4.0', environment: 'production', nonce, action: ACTION, responses: [{
    identifier: 'proof_of_human', issuer_schema_id: 1, expires_at_min: 0,
    signal_hash: signalHash(wallet), nullifier: '0x000A', proof: ['0x1', '0x2', '0x3', '0x4', '0x5']
  }] };
  const verification = { success: true, environment: 'production', action: ACTION,
    results: [{ identifier: 'proof_of_human', success: true, nullifier: '0xa' }] };
  assert.equal(normalizedNullifier('0x000A'), '10');
  assert.equal(identityForClaim('10'), identityForClaim(normalizedNullifier('0xa')));
  assert.throws(() => normalizedNullifier('0x0'));
  assert.throws(() => normalizedNullifier('0x' + 'f'.repeat(65)));
  assert.equal(signalHash('test_signal'), '0x00c1636e0a961a3045054c4d61374422c31a95846b8442f0927ad2ff1d6112ed');
  assert.equal(validateProof(proof, challenge, wallet), '10');
  assert.throws(() => validateProof(proof, challenge, other));
  assert.throws(() => validateProof(proof, { ...challenge, consumed_at: new Date() }, wallet));
  assert.throws(() => validateProof(proof, { ...challenge, expires_at: new Date(0) }, wallet));
  for (const changes of [{ environment: 'staging' }, { protocol_version: '3.0' }, { action: 'welcome-reward' },
    { nonce: '0x' + '13'.repeat(32) }, { session_id: 'session_123' }]) {
    assert.throws(() => validateProof({ ...proof, ...changes }, challenge, wallet));
  }
  for (const changes of [{ identifier: 'selfie', issuer_schema_id: 11 }, { signal_hash: signalHash(other) },
    { nullifier: '0x0' }, { proof: [] }, { expires_at_min: -1 }]) {
    assert.throws(() => validateProof({ ...proof, responses: [{ ...proof.responses[0], ...changes }] }, challenge, wallet));
  }
  validateVerification(verification, '10');
  for (const changes of [{ success: false }, { environment: 'sandbox' }, { action: 'wrong' },
    { results: [{ identifier: 'proof_of_human', success: false, nullifier: '0xa' }] },
    { results: [{ identifier: 'selfie', success: true, nullifier: '0xa' }] },
    { results: [{ identifier: 'proof_of_human', success: true, nullifier: '0xb' }] }]) {
    assert.throws(() => validateVerification({ ...verification, ...changes }, '10'));
  }

  const { signRequest, computeRpSignatureMessage } = await import('@worldcoin/idkit-core/signing');
  const signer = Wallet.createRandom();
  const signed = signRequest({ signingKeyHex: signer.privateKey, action: ACTION });
  assert.equal(verifyMessage(computeRpSignatureMessage(getBytes(signed.nonce), signed.createdAt, signed.expiresAt, ACTION), signed.sig), signer.address);
  assert.equal(signed.expiresAt - signed.createdAt, 300);

  const contract = Wallet.createRandom().address;
  const eventAbi = new Interface(['event Claimed(bytes32 indexed identityNullifier, address indexed recipient, uint256 amount)']);
  const event = eventAbi.encodeEventLog(eventAbi.getEvent('Claimed'), ['0x' + '01'.repeat(32), wallet, 100n * 10n ** 18n]);
  const receipt = { status: 1, logs: [{ address: contract, ...event }] };
  validateWelcomeReceipt(receipt, contract, wallet);
  assert.throws(() => validateWelcomeReceipt({ ...receipt, status: 0 }, contract, wallet));
  assert.throws(() => validateWelcomeReceipt(receipt, other, wallet));
  assert.throws(() => validateWelcomeReceipt(receipt, contract, other));
  assert.throws(() => validateWelcomeReceipt({ status: 1, logs: [] }, contract, wallet));
  const smallReward = eventAbi.encodeEventLog(eventAbi.getEvent('Claimed'), ['0x' + '01'.repeat(32), wallet, 1n]);
  assert.throws(() => validateWelcomeReceipt({ status: 1, logs: [{ address: contract, ...smallReward }] }, contract, wallet));

  // Real PostgreSQL engine, in memory only. Never loads DATABASE_URL or starts server.js.
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(__dirname, 'migrations/20261003_world_id.sql'), 'utf8'));
  let tail = Promise.resolve();
  const pool = {
    query: (sql, args) => db.query(sql, args),
    connect: async () => {
      const prior = tail;
      let release;
      tail = new Promise(resolve => { release = resolve; });
      await prior;
      return { query: (sql, args) => db.query(sql, args), release };
    }
  };
  const addRequest = (n, w) => db.query('INSERT INTO world_id_requests (nonce, rp_id, action, wallet, expires_at) VALUES ($1,$2,$3,$4,$5)',
    [n, RP_ID, ACTION, w, challenge.expires_at]);
  await addRequest(nonce, wallet);
  const repeated = await Promise.allSettled([bindIdentity(pool, proof, wallet, '10'), bindIdentity(pool, proof, wallet, '10')]);
  assert.equal(repeated.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await getWelcomeBinding(pool, wallet)).nullifier, '10');
  const nextNonce = '0x' + '34'.repeat(32);
  await addRequest(nextNonce, other);
  const otherProof = { ...proof, nonce: nextNonce, responses: [{ ...proof.responses[0], signal_hash: signalHash(other), nullifier: '0xA' }] };
  await assert.rejects(bindIdentity(pool, otherProof, other, '10'), e => e.code === '23505');
  assert.equal((await db.query('SELECT consumed_at FROM world_id_requests WHERE nonce=$1', [nextNonce])).rows[0].consumed_at, null);
  assert.equal(await getWelcomeBinding(pool, other), null);
  const thirdNonce = '0x' + '56'.repeat(32);
  await addRequest(thirdNonce, wallet);
  await assert.rejects(bindIdentity(pool, { ...proof, nonce: thirdNonce, responses: [{ ...proof.responses[0], nullifier: '0xb' }] }, wallet, '11'),
    e => e.code === '23505');
  assert.equal((await db.query('SELECT count(*) FROM world_id_welcome_bindings')).rows[0].count, 1);

  // Endpoint tests use a synthetic authenticated identity and an explicitly mocked verifier.
  const app = require('express')();
  app.use(require('express').json());
  const authenticate = (req, res, next) => {
    if (req.headers.authorization !== 'Bearer fixture') return res.status(401).json({ error: 'Missing token' });
    req.authUser = { uid: other, wallet_address: other, wallet_verified: true, wallet_auth_version: 2, auth_time: Math.floor(Date.now() / 1000) };
    next();
  };
  // Read the ignored local key only for offline RP signing; absence skips configured endpoint coverage.
  const envPath = path.join(__dirname, '.env');
  const env = fs.existsSync(envPath) ? require('dotenv').parse(fs.readFileSync(envPath)) : {};
  let called = 0;
  registerWorldIdRoutes(app, pool, authenticate, env, async (url, opts) => {
    called++;
    assert.equal(url, `https://developer.world.org/api/v4/verify/${RP_ID}`);
    const body = JSON.parse(opts.body);
    assert.equal(body.protocol_version, '4.0');
    return { ok: true, json: async () => ({ ...verification, results: [{ identifier: 'proof_of_human', success: true, nullifier: body.responses[0].nullifier }] }) };
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/api/auth/world-id/request', { method: 'POST' })).status, 401);
    if (env.WORLD_ID_SIGNING_KEY) {
      assert.equal(new Wallet(env.WORLD_ID_SIGNING_KEY).address, SIGNER);
      assert.equal(env.WORLD_ID_APP_ID, APP_ID);
      const request = await fetch(base + '/api/auth/world-id/request', { method: 'POST', headers: { Authorization: 'Bearer fixture' } });
      assert.equal(request.status, 200);
      const data = await request.json();
      assert.equal(data.action, ACTION);
      assert.equal(data.signal, other);
      assert.equal(verifyMessage(computeRpSignatureMessage(getBytes(data.rp_context.nonce), data.rp_context.created_at,
        data.rp_context.expires_at, ACTION), data.rp_context.signature), SIGNER);
      const fixture = { ...otherProof, nonce: data.rp_context.nonce, responses: [{ ...otherProof.responses[0], nullifier: '0xc' }] };
      const send = result => fetch(base + '/api/auth/world-id/verify', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture' }, body: JSON.stringify({ result }) });
      assert.equal((await send({ ...fixture, environment: 'staging' })).status, 400);
      assert.equal(called, 0);
      assert.equal((await send(fixture)).status, 200);
      assert.equal(called, 1);
      assert.equal((await send(fixture)).status, 400);
      assert.equal(called, 1);
      const bound = await fetch(base + '/api/auth/world-id/request', { method: 'POST', headers: { Authorization: 'Bearer fixture' } });
      assert.deepEqual(await bound.json(), { verified: true });
      console.log('Configured HTTP flow: offline RP signing and mocked upstream proof validation passed');
    } else console.log('Configured HTTP flow skipped: no local RP signing key');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await db.close();
  }
  console.log('World ID policy, PostgreSQL uniqueness/rollback/replay, and signer checks passed');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
