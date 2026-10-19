const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createHumanAccessGate } = require('../backend/human-access');

// Exercise same-UID re-login using Firebase's installed notification implementation.
async function main() {
  const root = path.resolve(__dirname, '..');
  const sdkDir = path.join(root, 'node_modules/@firebase/auth/dist/node-esm');
  let notify;
  for (const name of fs.readdirSync(sdkDir).filter(name => name.endsWith('.js'))) {
    const source = ts.createSourceFile(name, fs.readFileSync(path.join(sdkDir, name), 'utf8'),
      ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const visit = node => {
      if (ts.isMethodDeclaration(node) && node.name.getText(source) === 'notifyAuthListeners') {
        notify = vm.runInNewContext(`({${node.getText(source)}}).notifyAuthListeners`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (notify) break;
  }
  assert.equal(typeof notify, 'function', 'Installed Firebase notification method must be inspected');

  const wallet = '0x' + '12'.repeat(20);
  let now = Date.now();
  let authTime = Math.floor(now / 1000);
  let verifiedAuthTime = authTime;
  let pauseRequest = null, releaseRequest, rejectRequest = false;
  const claims = () => ({ uid: wallet, wallet_address: wallet, wallet_verified: true,
    wallet_auth_version: 2, auth_time: authTime });
  const user = { uid: wallet, getIdToken: async () => String(authTime),
    getIdTokenResult: async () => ({ token: String(authTime), claims: claims() }) };
  const auth = { currentUser: user };
  const states = [], effects = [], calls = [];
  let cursor = 0, observer, authEvents = 0;
  const hooks = {
    createContext: () => ({ Provider: 'provider' }), useContext() {},
    useState: initial => {
      const i = cursor++; if (!(i in states)) states[i] = initial;
      return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
    },
    useRef: initial => { const i = cursor++; return states[i] ||= { current: initial }; },
    useCallback: fn => { const i = cursor++; return states[i] ||= fn; },
    useEffect: fn => { const i = cursor++; if (!(i in states)) { states[i] = true; effects.push(fn); } }
  };
  const listenerState = { _isInitialized: true, currentUser: user, lastNotifiedUid: wallet,
    idTokenSubscription: { next() {} },
    authStateSubscription: { next: value => { authEvents++; observer(value); } } };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/contexts/AuthContext.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  }).outputText;
  vm.runInNewContext(code, { exports, Error, Date: class extends Date { static now() { return now; } },
    require: name => {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === 'firebase/auth') return {
        onAuthStateChanged: (_, callback) => { observer = callback; return () => {}; },
        signInWithCustomToken: async () => {
          authTime = Math.floor(now / 1000);
          notify.call(listenerState);
          return { user };
        }
      };
      if (name === '@worldcoin/minikit-js') return { MiniKit: {
        isInstalled: () => true, walletAuth: async () => ({ data: { fixture: true } })
      } };
      if (name === 'lucide-react') return { RefreshCw: 'retry', Shield: 'shield' };
      if (name === '../firebase') return { auth };
      if (name === '../config/api') return { apiUrl: value => value };
      if (name.includes('WorldIdLoginVerification')) return { WorldIdLoginVerification: 'proof-widget' };
      if (name.endsWith('.png')) return 'brand';
      throw new Error(name);
    },
    fetch: async url => {
      calls.push(url);
      let data;
      if (url.endsWith('/profile')) data = { success: true, data: { uid: wallet, worldIdVerified: authTime === verifiedAuthTime } };
      else if (url.endsWith('/login/request')) {
        if (pauseRequest) await pauseRequest;
        if (rejectRequest) return { ok: false, json: async () => ({ error: 'Human verification unavailable' }) };
        verifiedAuthTime = authTime;
        data = { verified: true };
      }
      else if (url.endsWith('/nonce')) data = { success: true, nonce: 'fixture-nonce' };
      else if (url.endsWith('/complete-siwe')) data = { success: true, customToken: 'offline-fixture' };
      else throw new Error(url);
      return { ok: true, json: async () => data };
    }
  });
  const render = () => { cursor = 0; return exports.AuthProvider({ children: 'protected-app' }); };
  render(); effects.forEach(effect => effect()); observer(user);
  for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(render().props.children[0], 'protected-app');
  const requestCount = calls.filter(url => url.endsWith('/login/request')).length;
  now += 15 * 60 * 1000;
  pauseRequest = new Promise(resolve => { releaseRequest = resolve; });
  const refresh = render().props.value.getFreshWalletToken();
  const concurrent = render().props.value.getFreshWalletToken();
  for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve));
  assert.notEqual(authTime, verifiedAuthTime);
  assert.equal(authEvents, 0, 'Firebase does not notify auth-state observers for the same UID');
  assert.equal(calls.filter(url => url.endsWith('/login/request')).length, requestCount + 1);
  assert.notEqual(render().props.children[0], 'protected-app', 'Access is blocked until the server confirms enrollment');

  const pool = { query: async (_sql, args) => ({ rows: Number(args[2]) === verifiedAuthTime ? [{ session_id: 'offline' }] : [] }) };
  let status, body, granted = false;
  const response = { status: value => { status = value; return response; },
    json: value => { body = value; return response; }, set() {} };
  await createHumanAccessGate(pool, (req, _res, next) => { req.authUser = claims(); return next(); })(
    { method: 'POST', path: '/auth/onboarding-confirm' }, response, () => { granted = true; });
  assert.equal(granted, false);
  assert.equal(status, 403);
  assert.equal(body.code, 'human_required');
  releaseRequest();
  assert.equal(await refresh, String(authTime));
  assert.equal(await concurrent, String(authTime));
  pauseRequest = null;
  assert.equal(render().props.children[0], 'protected-app');
  await createHumanAccessGate(pool, (req, _res, next) => { req.authUser = claims(); return next(); })(
    { method: 'POST', path: '/auth/onboarding-confirm' }, response, () => { granted = true; });
  assert.equal(granted, true);
  assert.equal(calls.filter(url => url.endsWith('/complete-siwe')).length, 1);

  now += 15 * 60 * 1000;
  rejectRequest = true;
  await assert.rejects(render().props.value.getFreshWalletToken(), /Complete human verification/);
  assert.notEqual(render().props.children[0], 'protected-app');
  assert.notEqual(authTime, verifiedAuthTime);
  console.log('Wallet refresh: same-UID login waits for trusted enrollment, concurrent calls share one refresh, and server denial keeps access blocked.');
  console.log('Uses actual AuthContext, installed Firebase notification method and API gate; no native proof or production credentials.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
