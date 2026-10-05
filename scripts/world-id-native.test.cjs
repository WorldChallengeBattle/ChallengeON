const assert = require('node:assert/strict');

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
    request.cancel();
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
    const { validateLoginProof } = require('../backend/world-id-login');
    const identity = validateLoginProof(legacyResult.result, { nonce: loginSigned.nonce, rp_id: config.rp_context.rp_id,
      action, wallet, wallet_auth_time: authTime, expires_at: new Date(loginSigned.expiresAt * 1000) }, wallet, authTime);
    assert.equal(identity.identifier, 'orb');
    assert.equal(listeners.size, 0);
    console.log('Real portable SDK Android serialization and mocked native rejection passed; not a phone E2E test.');
    console.log('Login-only uniqueness candidate: signed action, Proof of Human v2 and Orb v1 serialization passed; not native acceptance or repeat-login evidence.');
  } finally {
    request?.cancel();
    global.fetch = previousFetch;
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
