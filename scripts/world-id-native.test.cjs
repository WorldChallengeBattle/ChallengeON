const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function sessionWidgetProps(request, CredentialRequest) {
  const source = fs.readFileSync('src/components/WorldIdSessionVerification.tsx', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => {
    if (name === 'react') return { useRef: value => ({ current: value }) };
    if (name === 'react/jsx-runtime') return { jsx: (_, props) => props };
    if (name === '@worldcoin/idkit') return { IDKitSessionWidget: null, CredentialRequest };
    if (name === '../config/api') return { apiUrl: path => path };
    throw new Error(`Unexpected import ${name}`);
  } });
  return exports.WorldIdSessionVerification({ request, token: 'offline-fixture',
    onClose() {}, onVerified() {}, onError() {} });
}

function withoutRequestId(envelope) {
  const copy = structuredClone(envelope);
  delete copy.payload.proof_request.id;
  return copy;
}

async function main() {
  const previousFetch = global.fetch;
  const previousWindow = global.window;
  const listeners = new Map();
  let envelope;
  global.fetch = async () => { throw new Error('No network calls allowed'); };
  global.window = {
    WorldApp: { supported_commands: [{ name: 'verify', supported_versions: [2] }] },
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name),
    Android: { postMessage: message => { envelope = JSON.parse(message); } }
  };
  let request;
  try {
    const { IDKit, CredentialRequest, proofOfHuman, hashSignal } = await import('@worldcoin/idkit-core');
    const { signRequest } = await import('@worldcoin/idkit-core/signing');
    // Public test key only; no production key or live proof is used.
    const signed = signRequest({ signingKeyHex: `0x${'1'.padStart(64, '0')}`, ttl: 300 });
    const config = {
      app_id: 'app_a5a8b0a2d65c376bf242d317a9f4ac78', environment: 'production',
      rp_context: { rp_id: 'rp_cba96127b0447fa4', nonce: signed.nonce,
        created_at: signed.createdAt, expires_at: signed.expiresAt, signature: signed.sig }
    };
    const constraint = CredentialRequest('proof_of_human', { signal: `0x${'12'.repeat(20)}` });
    request = await IDKit.createSession(config).constraints(constraint);
    assert.equal(envelope.command, 'verify');
    assert.equal(envelope.version, 2);
    assert.equal(envelope.payload.action, '');
    assert.equal(envelope.payload.allow_legacy_proofs, false);
    assert.equal(envelope.payload.environment, 'production');
    assert.equal(Date.parse(envelope.payload.timestamp), signed.createdAt * 1000);
    const proof = envelope.payload.proof_request;
    assert.equal(proof.proof_type, 'session');
    assert.equal(proof.session_id, 'create');
    assert.equal(proof.action, null);
    assert.equal(proof.rp_id, config.rp_context.rp_id);
    assert.equal(proof.proof_requests.length, 1);
    assert.equal(proof.proof_requests[0].identifier, 'proof_of_human');
    assert.equal(proof.proof_requests[0].issuer_schema_id, 1);
    assert.equal(proof.proof_requests[0].genesis_issued_at_min, null);
    assert.equal(proof.proof_requests[0].expires_at_min, null);
    listeners.get('message')({ data: { type: 'miniapp-verify-action',
      payload: { status: 'error', error_code: 'malformed_request' } } });
    const result = await request.pollUntilCompletion({ timeout: 1000 });
    assert.equal(result.success, false);
    assert.equal(result.error, 'malformed_request');
    assert.equal(request.getDebugReport().mini_app.platform, 'android');
    assert.equal(request.getDebugReport().response_payload.status, 'error');
    assert.equal(listeners.size, 0);

    const sessionId = `session_${'12'.repeat(32)}01${'12'.repeat(31)}`;
    request = await IDKit.proveSession(sessionId, config).constraints(constraint);
    assert.equal(envelope.payload.proof_request.session_id, sessionId);
    assert.equal(envelope.payload.proof_request.proof_type, 'session');
    request.cancel();
    assert.equal(listeners.size, 0);

    // Use real SDK conversion for session creation/return, not hand-shaped decimal proofs.
    const { sessionSignal, validateSessionProof } = require('../backend/world-id-session');
    const sessionWallet = `0x${'12'.repeat(20)}`;
    const sessionAuthTime = Math.floor(Date.now() / 1000) - 10;
    await assert.rejects(IDKit.createSession(config).preset(proofOfHuman()), /Presets are not supported/);
    // Compare actual component inputs with the smallest same-credential, bound SDK request.
    for (const returning of [false, true]) {
      const signal = sessionSignal(sessionWallet, sessionAuthTime, signed.nonce);
      const props = sessionWidgetProps({ ...config, wallet: sessionWallet,
        wallet_auth_time: sessionAuthTime, signal, existing_session_id: returning ? sessionId : null
      }, CredentialRequest);
      assert.equal(props.action, undefined);
      assert.equal(props.preset, undefined);
      assert.equal(props.allow_legacy_proofs, undefined);
      assert.deepEqual(props.rp_context, config.rp_context);
      const minimalConfig = { app_id: config.app_id, rp_context: config.rp_context };
      const minimalBuilder = returning ? IDKit.proveSession(sessionId, minimalConfig) : IDKit.createSession(minimalConfig);
      request = await minimalBuilder.constraints(CredentialRequest('proof_of_human', { signal }));
      const minimal = withoutRequestId(envelope);
      request.cancel();
      const appConfig = { app_id: props.app_id, rp_context: props.rp_context,
        environment: props.environment, action_description: props.action_description };
      const appBuilder = props.existing_session_id
        ? IDKit.proveSession(props.existing_session_id, appConfig) : IDKit.createSession(appConfig);
      request = await appBuilder.constraints(props.constraints);
      const actual = withoutRequestId(envelope);
      assert.equal(Object.hasOwn(actual.payload, 'action_description'), false);
      assert.deepEqual(actual, minimal, 'App and minimal bound native envelopes differ');
      request.cancel();
      assert.equal(listeners.size, 0);
    }
    console.log('Actual session component matches minimal bound SDK request, except generated request ID, for creation and return. Native acceptance is not tested.');
    for (const returning of [false, true]) {
      const sessionSigned = signRequest({ signingKeyHex: `0x${'1'.padStart(64, '0')}`, ttl: 300 });
      const sessionConfig = { ...config, rp_context: { ...config.rp_context, nonce: sessionSigned.nonce,
        created_at: sessionSigned.createdAt, expires_at: sessionSigned.expiresAt, signature: sessionSigned.sig } };
      const signal = sessionSignal(sessionWallet, sessionAuthTime, sessionSigned.nonce);
      const builder = returning ? IDKit.proveSession(sessionId, sessionConfig) : IDKit.createSession(sessionConfig);
      request = await builder.constraints(CredentialRequest('proof_of_human', { signal }));
      assert.equal(envelope.payload.proof_request.session_id, returning ? sessionId : 'create');
      assert.equal(envelope.payload.allow_legacy_proofs, false);
      assert.equal(envelope.payload.proof_request.proof_requests[0].identifier, 'proof_of_human');
      listeners.get('message')({ data: { type: 'miniapp-verify-action', payload: {
        status: 'success', proof_response: { id: 'fixture', version: 1, session_id: sessionId, responses: [{
          identifier: 'proof_of_human', issuer_schema_id: 1, expires_at_min: 0,
          session_nullifier: `snil_${'a'.padStart(64, '0')}02${'b'.padStart(62, '0')}`,
          proof: [1, 2, 3, 4, 5].map(value => value.toString(16).padStart(64, '0')).join('')
        }] }
      } } });
      const completion = await request.pollUntilCompletion({ timeout: 1000 });
      assert.equal(completion.success, true);
      assert.deepEqual(completion.result.responses[0].proof, ['1', '2', '3', '4', '5']);
      const challenge = { wallet: sessionWallet, wallet_auth_time: sessionAuthTime, rp_id: config.rp_context.rp_id,
        nonce: sessionSigned.nonce, expires_at: new Date(sessionSigned.expiresAt * 1000),
        expected_session_id: returning ? sessionId : null };
      assert.equal(validateSessionProof(completion.result, challenge, sessionWallet, sessionAuthTime).nullifier, '10');
      assert.throws(() => validateSessionProof({ ...completion.result, nonce: `0x${'ab'.repeat(32)}` },
        { ...challenge, nonce: `0x${'ab'.repeat(32)}` }, sessionWallet, sessionAuthTime));
      assert.equal(listeners.size, 0);
    }

    // Compare a login-only action candidate without creating a Portal action.
    const action = 'challengeon-human-login';
    const loginSigned = signRequest({ signingKeyHex: `0x${'1'.padStart(64, '0')}`, action, ttl: 300 });
    const loginConfig = { ...config, action, allow_legacy_proofs: true, rp_context: {
      ...config.rp_context, nonce: loginSigned.nonce, created_at: loginSigned.createdAt,
      expires_at: loginSigned.expiresAt, signature: loginSigned.sig
    } };
    const wallet = `0x${'12'.repeat(20)}`;
    const authTime = Math.floor(Date.now() / 1000) - 10;
    const signal = `${wallet}:${authTime}:${loginSigned.nonce}`;
    request = await IDKit.request(loginConfig).preset(proofOfHuman({ signal }));
    assert.equal(envelope.version, 2);
    assert.equal(envelope.payload.action, action);
    assert.equal(envelope.payload.allow_legacy_proofs, true);
    assert.equal(envelope.payload.verification_level, 'orb');
    assert.equal(envelope.payload.proof_request.proof_type, 'uniqueness');
    assert.equal(envelope.payload.proof_request.action, hashSignal(action));
    assert.equal(envelope.payload.proof_request.proof_requests[0].identifier, 'proof_of_human');
    assert.equal(envelope.payload.proof_request.proof_requests[0].issuer_schema_id, 1);
    assert.equal(envelope.payload.signal, hashSignal(signal));
    listeners.get('message')({ data: { type: 'miniapp-verify-action', payload: {
      status: 'success', proof_response: { id: 'fixture', version: 1, responses: [{
        identifier: 'proof_of_human', issuer_schema_id: 1, expires_at_min: 0,
        nullifier: `nil_${'a'.padStart(64, '0')}`,
        proof: [1, 2, 3, 4, 5].map(value => value.toString(16).padStart(64, '0')).join('')
      }] }
    } } });
    const nativeResult = await request.pollUntilCompletion({ timeout: 1000 });
    assert.equal(nativeResult.success, true);
    assert.deepEqual(nativeResult.result.responses[0].proof, ['1', '2', '3', '4', '5']);
    const { validateLoginProof } = require('../backend/world-id-login');
    const loginChallenge = { nonce: loginSigned.nonce, rp_id: config.rp_context.rp_id,
      action, wallet, wallet_auth_time: authTime, expires_at: new Date(loginSigned.expiresAt * 1000) };
    assert.deepEqual(validateLoginProof(nativeResult.result, loginChallenge, wallet, authTime), {
      protocol: '4.0', identifier: 'proof_of_human', nullifier: '10'
    });
    assert.equal(listeners.size, 0);
    global.window.WorldApp.supported_commands[0].supported_versions = [1];
    await assert.rejects(IDKit.createSession(config).constraints(constraint), /verify v2 is not supported/);
    request = await IDKit.request(loginConfig).preset(proofOfHuman({ signal }));
    assert.equal(envelope.version, 1);
    assert.equal(envelope.payload.action, action);
    assert.equal(envelope.payload.verification_level, 'orb');
    assert.equal(envelope.payload.signal, hashSignal(signal));
    listeners.get('message')({ data: { type: 'miniapp-verify-action', payload: {
      status: 'success', verification_level: 'orb', nullifier_hash: '0xa',
      merkle_root: `0x${'ab'.repeat(32)}`, proof: `0x${'12'.repeat(256)}`
    } } });
    const legacyResult = await request.pollUntilCompletion({ timeout: 1000 });
    assert.equal(legacyResult.success, true);
    const identity = validateLoginProof(legacyResult.result, { nonce: loginSigned.nonce, rp_id: config.rp_context.rp_id,
      action, wallet, wallet_auth_time: authTime, expires_at: new Date(loginSigned.expiresAt * 1000) }, wallet, authTime);
    assert.equal(identity.identifier, 'orb');
    assert.equal(listeners.size, 0);
    console.log('Real portable SDK Android serialization and mocked native rejection passed; not a phone E2E test.');
    console.log('Session creation/return: SDK-decoded schema 1 decimal proofs accepted; nonce substitution denied. Mocked native success is not device support evidence.');
    console.log('Login-only uniqueness: signed action, SDK-normalized native v4 PoH and v3 Orb backend validation passed; not a phone E2E test.');
  } finally {
    request?.cancel();
    global.fetch = previousFetch;
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
