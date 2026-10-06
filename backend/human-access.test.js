const assert = require('node:assert/strict');
const express = require('express');
const { createHumanAccessGate } = require('./human-access');

async function main() {
  const wallet = '0x' + '12'.repeat(20);
  let binding = false;
  let unavailable = false;
  const pool = { query: async (sql, args) => {
    if (unavailable) throw new Error('DB unavailable');
    assert.match(sql, /world_id_login_sessions/);
    assert.equal(args[2], 100);
    assert.equal(args.length, 3);
    return { rows: binding ? [{ session_id: 'session_fixture' }] : [] };
  } };
  const app = express();
  const authenticate = (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).end();
    req.authUser = { uid: wallet, wallet_address: wallet, wallet_verified: true, wallet_auth_version: 2,
      world_id_verified: true, auth_time: 100 };
    if (req.headers.authorization === 'Bearer mismatched') req.authUser.uid = '0x' + '34'.repeat(20);
    next();
  };
  app.use('/api', createHumanAccessGate(pool, authenticate));
  // Operational exemptions still have their existing separate credential gate.
  app.post('/api/internal/jobs/trend-sync', (req, res) => res.sendStatus(req.headers['x-cron-secret'] === 'fixture' ? 200 : 401));
  app.all('*', (_req, res) => res.sendStatus(200));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = 'GET', headers = {}) => fetch(url + path, { method, headers });
  try {
    assert.equal((await request('/api/auth/nonce')).status, 200);
    assert.equal((await request('/api/auth/world-id/request', 'POST')).status, 200);
    assert.equal((await request('/api/auth/world-id/session/request', 'POST')).status, 200);
    assert.equal((await request('/api/auth/world-id/session/verify', 'POST')).status, 200);
    assert.equal((await request('/api/auth/world-id/login/request', 'POST')).status, 200);
    assert.equal((await request('/api/auth/world-id/login/verify', 'POST')).status, 200);
    assert.equal((await request('/api/chain-config')).status, 200);
    for (const [path, method] of [['/api/challenges', 'GET'], ['/api/videos/upload', 'POST'], ['/api/admin/me', 'GET'],
      ['/api/challenges/x/vote', 'POST'], ['/api/auth/onboarding-signature', 'POST'], ['/api/auth/profile/extra', 'GET']]) {
      assert.equal((await request(path, method)).status, 401);
      assert.equal((await request(path, method, { Authorization: 'Bearer fixture' })).status, 403);
    }
    binding = true;
    assert.equal((await request('/api/challenges', 'GET', { Authorization: 'Bearer fixture' })).status, 200);
    assert.equal((await request('/api/challenges', 'GET', { Authorization: 'Bearer mismatched' })).status, 403);
    unavailable = true;
    assert.equal((await request('/api/challenges', 'GET', { Authorization: 'Bearer fixture' })).status, 503);
    assert.equal((await request('/api/internal/jobs/trend-sync', 'POST')).status, 401);
    assert.equal((await request('/api/internal/jobs/trend-sync', 'POST', { 'x-cron-secret': 'fixture' })).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log('Human access: anonymous/unbound/forged/mismatched/storage-failure denied; bound wallet and protected jobs passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
