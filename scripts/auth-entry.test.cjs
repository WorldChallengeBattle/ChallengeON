const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('src/contexts/AuthContext.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
}).outputText;

// Deterministic hook/transport fixtures; no production token or native proof.
function fixture({ stored = false, requestVerified = stored, installed = true, mismatch = false } = {}) {
  const states = [], effects = [], calls = [];
  let cursor = 0, observer, verified = stored;
  const wallet = '0x' + '12'.repeat(20);
  const user = { uid: wallet, getIdToken: async () => 'fixture', getIdTokenResult: async () => ({ token: 'fixture',
    claims: { wallet_auth_version: 2, wallet_verified: true, wallet_address: wallet, auth_time: Date.now() / 1000 } }) };
  const auth = { currentUser: user };
  const hooks = {
    createContext: () => ({ Provider: 'provider' }), useContext: () => {},
    useState: initial => {
      const i = cursor++; if (!(i in states)) states[i] = initial;
      return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
    },
    useRef: initial => { const i = cursor++; return states[i] ||= { current: initial }; },
    useCallback: fn => { const i = cursor++; return states[i] ||= fn; },
    useEffect: fn => { const i = cursor++; if (!(i in states)) { states[i] = true; effects.push(fn); } }
  };
  const exports = {};
  vm.runInNewContext(code, { exports, Error, Date, require: name => {
    if (name === 'react') return hooks;
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    if (name === 'firebase/auth') return { onAuthStateChanged: (_, fn) => { observer = fn; return () => {}; }, signInWithCustomToken: async () => ({ user }) };
    if (name === '@worldcoin/minikit-js') return { MiniKit: { isInstalled: () => installed } };
    if (name === 'lucide-react') return { RefreshCw: 'retry-icon', Shield: 'shield' };
    if (name === '../firebase') return { auth };
    if (name === '../config/api') return { apiUrl: path => path };
    if (name.includes('WorldIdSessionVerification')) return { WorldIdSessionVerification: 'proof-widget' };
    if (name.includes('.png')) return 'brand.png';
    throw new Error(name);
  }, fetch: async path => {
    calls.push(path);
    return { ok: true, json: async () => path.endsWith('/profile')
      ? { success: true, data: { uid: wallet, worldIdVerified: verified } }
      : requestVerified ? { verified: true } : { signal: mismatch ? 'wrong' : wallet, rp_context: { nonce: 'nonce' } } };
  } });
  const render = () => { cursor = 0; return exports.AuthProvider({ children: 'protected-app' }); };
  render(); effects.forEach(fn => fn());
  return { render, start: () => observer(user), verified: () => { verified = true; }, calls,
    switchWallet: () => { const next = { ...user, uid: '0x' + '34'.repeat(20) }; auth.currentUser = next; observer(next); } };
}
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
const view = f => f.render().props.children;
async function main() {
  const first = fixture(); first.start(); await settle();
  assert.notEqual(view(first)[0], 'protected-app');
  assert.equal(view(first)[1].type, 'proof-widget');
  assert(first.calls.includes('/api/auth/world-id/session/request'));
  assert(!first.calls.includes('/api/auth/world-id/request'));
  first.verified(); view(first)[1].props.onVerified(); await settle();
  assert.equal(view(first)[0], 'protected-app');
  first.switchWallet(); await settle(); assert.notEqual(view(first)[0], 'protected-app');
  const returning = fixture({ stored: true }); returning.start(); await settle();
  assert.equal(view(returning)[0], 'protected-app'); assert.equal(view(returning)[1], null);
  const cancelled = fixture(); cancelled.start(); await settle(); view(cancelled)[1].props.onClose();
  assert.notEqual(view(cancelled)[0], 'protected-app'); assert.equal(view(cancelled)[1], null);
  const failed = fixture(); failed.start(); await settle(); view(failed)[1].props.onError('fixture rejection');
  assert.notEqual(view(failed)[0], 'protected-app');
  const stale = fixture({ stored: true, requestVerified: false }); stale.start(); await settle();
  assert.notEqual(view(stale)[0], 'protected-app');
  const mismatched = fixture({ mismatch: true }); mismatched.start(); await settle();
  assert.notEqual(view(mismatched)[0], 'protected-app'); assert.equal(view(mismatched)[1], null);
  const outside = fixture({ installed: false }); outside.start(); await settle();
  assert.notEqual(view(outside)[0], 'protected-app'); assert.equal(outside.calls.length, 0);
  const apiCode = ts.transpileModule(fs.readFileSync('src/config/apiFetch.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText;
  const api = {}, requests = [];
  const auth = { currentUser: { getIdToken: async () => 'fixture' } };
  vm.runInNewContext(apiCode, { exports: api, URL, Headers, Error, window: { location: { origin: 'https://app.example' } },
    require: name => name === '../firebase' ? { auth } : { apiUrl: path => 'https://api.example' + path },
    fetch: async (input, init) => { requests.push({ input, init }); return {}; } });
  await api.apiFetch('https://api.example/api/challenges');
  assert.equal(requests[0].init.headers.get('Authorization'), 'Bearer fixture');
  await api.apiFetch('https://developer.world.org/api/v2/minikit/userop/fixture');
  assert.equal(requests[1].init, undefined);
  await api.apiFetch('https://api.example.evil.test/api/challenges');
  assert.equal(requests[2].init, undefined);
  auth.currentUser = null;
  await assert.rejects(api.apiFetch('https://api.example/api/challenges'));
  assert.equal(requests.length, 3);
  console.log('Entry gate: initial automatic proof, returning binding, cancellation, rejection, stale profile, wallet switch and outside-app denial passed.');
  console.log('API transport: token attached only to exact app API; external origin and anonymous access protected.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
