const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the component's callbacks without a native World App or real proof.
const source = fs.readFileSync('src/components/WorldIdWelcomeVerification.tsx', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX
} }).outputText;
function widget(fetch) {
  const exports = {};
  vm.runInNewContext(code, { exports, fetch, Error, require: (name) => {
    if (name === 'react') return { useRef: value => ({ current: value }) };
    if (name === 'react/jsx-runtime') return { jsx: (_, props) => props };
    if (name === '@worldcoin/idkit') return { IDKitRequestWidget: null, proofOfHuman: value => value };
    if (name === '../config/api') return { apiUrl: path => path };
    throw new Error(`Unexpected import ${name}`);
  } });
  const errors = [];
  let successes = 0;
  let closes = 0;
  const props = exports.WorldIdWelcomeVerification({
    request: { signal: 'fixture', rp_context: {} }, user: { getIdToken: async () => 'fixture' },
    onClose: () => { closes++; }, onVerified: () => { successes++; }, onError: error => errors.push(error)
  });
  return { props, errors, successes: () => successes, closes: () => closes };
}
async function main() {
  const success = widget(async () => ({ ok: true, json: async () => ({ success: true }) }));
  await success.props.handleVerify({});
  success.props.onSuccess();
  success.props.onError();
  assert.equal(success.successes(), 1);
  assert.deepEqual(success.errors, []);
  success.props.onOpenChange(false);
  assert.equal(success.closes(), 0);
  const rejected = widget(async () => ({ ok: false, json: async () => ({ error: 'Human verification failed; request a new proof' }) }));
  await assert.rejects(rejected.props.handleVerify({}));
  rejected.props.onError();
  assert.deepEqual(rejected.errors, ['Human verification failed; request a new proof']);
  assert.equal(rejected.successes(), 0);
  rejected.props.onOpenChange(false);
  assert.equal(rejected.closes(), 0);
  const native = widget(async () => { throw new Error('Backend must not be called'); });
  native.props.onError('invalid_rp_signature');
  native.props.onOpenChange(false);
  assert.deepEqual(native.errors, ['World ID verification failed (invalid_rp_signature). Please retry.']);
  assert.equal(native.closes(), 0);
  const cancelled = widget(async () => ({}));
  cancelled.props.onOpenChange(false);
  assert.equal(cancelled.closes(), 1);
  const invalidCode = widget(async () => ({}));
  invalidCode.props.onError('untrusted\nprivate debug data');
  assert.deepEqual(invalidCode.errors, ['Human verification was not completed. Please try again.']);
  const transport = widget(async () => { throw new Error('Network unavailable'); });
  transport.props.onError();
  assert.deepEqual(transport.errors, ['Human verification was not completed. Please try again.']);
  await assert.rejects(transport.props.handleVerify({}));
  transport.props.onError();
  assert.equal(transport.errors.at(-1), 'Network unavailable');
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /userData\?\.worldIdVerified === true && <div className="profile-human-verified">/);
  console.log('World ID UI callbacks: backend failure retained, late error suppressed only after server success, badge gated.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
