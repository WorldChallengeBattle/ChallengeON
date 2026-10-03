const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the component's callbacks without a native World App or real proof.
function widget(fetch, session = false) {
  const source = fs.readFileSync(`src/components/${session ? 'WorldIdSessionVerification' : 'WorldIdWelcomeVerification'}.tsx`, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, fetch, Error, require: (name) => {
    if (name === 'react') return { useRef: value => ({ current: value }) };
    if (name === 'react/jsx-runtime') return { jsx: (_, props) => props };
    if (name === '@worldcoin/idkit') return { IDKitRequestWidget: null, IDKitSessionWidget: null,
      proofOfHuman: value => value, CredentialRequest: (type, value) => ({ type, ...value }) };
    if (name === '../config/api') return { apiUrl: path => path };
    throw new Error(`Unexpected import ${name}`);
  } });
  const errors = [];
  let successes = 0;
  let closes = 0;
  const component = session ? exports.WorldIdSessionVerification : exports.WorldIdWelcomeVerification;
  const props = component({
    request: { signal: 'fixture', rp_context: {}, existing_session_id: 'session_fixture' }, user: { getIdToken: async () => 'fixture' },
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
  const replayed = widget(async () => { throw new Error('Backend must not be called'); });
  replayed.props.onError('nullifier_replayed');
  replayed.props.onOpenChange(false);
  assert.match(replayed.errors[0], /Sign-in recovery is required/);
  assert.doesNotMatch(replayed.errors[0], /Please retry/);
  assert.equal(replayed.successes(), 0);
  assert.equal(replayed.closes(), 0);
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
  let sessionCalls = 0;
  const session = widget(async (path, options) => {
    sessionCalls++;
    assert.equal(path, '/api/auth/world-id/session/verify');
    assert.equal(options.headers.Authorization, 'Bearer fixture');
    assert.equal(JSON.parse(options.body).result.session_id, 'session_fixture');
    return { ok: true, json: async () => ({ success: true }) };
  }, true);
  assert.equal(session.props.action, undefined);
  assert.equal(session.props.preset, undefined);
  assert.equal(session.props.constraints.type, 'proof_of_human');
  assert.equal(session.props.constraints.signal, 'fixture');
  assert.equal(session.props.existing_session_id, 'session_fixture');
  assert.equal(session.props.environment, 'production');
  session.props.onSuccess(); assert.equal(session.successes(), 0);
  await session.props.handleVerify({ session_id: 'session_fixture' });
  session.props.onSuccess(); session.props.onError('unknown'); session.props.onOpenChange(false);
  assert.equal(sessionCalls, 1); assert.equal(session.successes(), 1); assert.equal(session.closes(), 0);
  assert.deepEqual(session.errors, []);
  const failedSession = widget(async () => ({ ok: false, json: async () => ({ error: 'Session rejected' }) }), true);
  await assert.rejects(failedSession.props.handleVerify({}));
  failedSession.props.onError('failed_by_host_app'); failedSession.props.onOpenChange(false); failedSession.props.onSuccess();
  assert.deepEqual(failedSession.errors, ['Session rejected']);
  assert.equal(failedSession.successes(), 0); assert.equal(failedSession.closes(), 0);
  const malformed = widget(async () => { throw new Error('Backend must not be called'); }, true);
  malformed.props.onError('malformed_request', {
    transport: 'mini_app', mini_app: { platform: 'android', verify_version: 2 },
    request_payload: { signature: 'private fixture', session_id: 'private fixture' },
    response_payload: { status: 'error', error_code: 'malformed_request', message: 'private fixture' }
  });
  assert.equal(malformed.errors[0], 'World ID sign-in failed (malformed_request). Please try again. [mini_app/android/verify-v2/native-error]');
  assert.equal(malformed.successes(), 0);
  assert.doesNotMatch(malformed.errors[0], /private fixture/);
  const untrustedReport = widget(async () => ({}), true);
  untrustedReport.props.onError('malformed_request', {
    transport: 'mini_app', mini_app: { platform: 'private fixture', verify_version: 'private fixture' },
    response_payload: 'private fixture'
  });
  assert.match(untrustedReport.errors[0], /mini_app\/unknown\/verify-unknown\/sdk/);
  assert.doesNotMatch(untrustedReport.errors[0], /private fixture/);
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /userData\?\.worldIdVerified === true && <div className="profile-human-verified">/);
  console.log('World ID UI callbacks: backend failure retained, late error suppressed only after server success, badge gated.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
