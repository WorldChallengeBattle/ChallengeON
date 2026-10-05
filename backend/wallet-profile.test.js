const assert = require('node:assert/strict');
const { registerWalletProfileRoutes } = require('./wallet-profile');

async function main() {
  const routes = new Map();
  const wallet = '0x' + '12'.repeat(20);
  const authTime = Math.floor(Date.now() / 1000);
  const claims = { uid: wallet, wallet_address: wallet, wallet_verified: true,
    wallet_auth_version: 2, auth_time: authTime };
  let storeFailure = false, sessionFailure = false, trusted = false, exists = true;
  let storeCalls = 0, sessionCalls = 0, writes = 0;
  const firestore = () => ({
    collection: () => ({ doc: () => ({}) }),
    runTransaction: async callback => {
      storeCalls++;
      if (storeFailure) throw new Error('secret store error');
      return callback({ get: async () => ({ exists, data: () => ({ worldIdVerified: true }) }),
        set: () => { writes++; } });
    }
  });
  firestore.FieldValue = { serverTimestamp: () => 'fixture-time' };
  const pool = { query: async (_, args) => {
    sessionCalls++;
    assert.equal(args[1], wallet);
    assert.equal(args[2], authTime);
    if (sessionFailure) throw new Error('secret database error');
    return { rows: trusted ? [{ session_id: 'fixture-session' }] : [] };
  } };
  registerWalletProfileRoutes({ get: (path, _, handler) => routes.set(path, handler), post: () => {} },
    { firestore }, null, null, () => {}, pool);
  const logs = [], originalWarn = console.warn;
  console.warn = (...args) => logs.push(args);
  const request = async (authUser = claims) => {
    const result = { status: 200, headers: {} };
    const res = { set: (name, value) => { result.headers[name] = value; },
      status: code => { result.status = code; return res; }, json: body => { result.body = body; return res; } };
    await routes.get('/api/auth/profile')({ authUser }, res);
    assert.equal(result.headers['Cache-Control'], 'no-store');
    return result;
  };
  try {
    assert.equal((await request({ ...claims, wallet_verified: false })).status, 403);
    assert.equal(storeCalls, 0); assert.equal(sessionCalls, 0);
    storeFailure = true;
    assert.equal((await request()).status, 503); assert.equal(sessionCalls, 0);
    storeFailure = false; sessionFailure = true;
    assert.equal((await request()).status, 503);
    sessionFailure = false;
    const unverified = await request();
    assert.equal(unverified.status, 200); assert.equal(unverified.body.data.worldIdVerified, false);
    trusted = true;
    assert.equal((await request()).body.data.worldIdVerified, true);
    exists = false;
    assert.equal((await request()).status, 200); assert.equal(writes, 1);
    assert.deepEqual(logs, [
      ['wallet_profile_failed', { phase: 'wallet_policy' }],
      ['wallet_profile_failed', { phase: 'profile_store' }],
      ['wallet_profile_failed', { phase: 'human_session_store' }]
    ]);
  } finally { console.warn = originalWarn; }
  console.log('Profile route: wallet denial, store outages, trusted session override, creation and secret-free diagnostics passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
