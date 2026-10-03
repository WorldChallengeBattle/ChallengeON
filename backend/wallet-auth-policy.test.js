const assert = require('node:assert/strict');
const { validateSiweContext, authenticatedRewardRecipient } = require('./wallet-auth-policy');
const now = Date.now();
const address = '0x44D2d43d8Af2728De94F4DB6C705eaB20eAcEeC9';
const challenge = { nonce: 'abcdefgh12345678', origin: 'https://challenge-on.vercel.app', domain: 'challenge-on.vercel.app', createdAt: now - 1000, expiresAt: now + 290000 };
const message = { nonce: challenge.nonce, domain: challenge.domain, uri: challenge.origin, version: '1', chainId: 480,
  issuedAt: new Date(now).toISOString(), expirationTime: new Date(now + 280000).toISOString() };
validateSiweContext(message, challenge, now);
for (const patch of [{ nonce: 'forgednonce' }, { domain: 'evil.example' }, { chainId: 4801 }, { uri: 'https://evil.example' }, { expirationTime: undefined }]) {
  assert.throws(() => validateSiweContext({ ...message, ...patch }, challenge, now));
}
assert.throws(() => validateSiweContext(message, undefined, now));
assert.throws(() => validateSiweContext(message, { ...challenge, expiresAt: now }, now));
const decoded = { uid: address.toLowerCase(), wallet_address: address, wallet_verified: true, wallet_auth_version: 2, world_id_verified: true, auth_time: Math.floor(now / 1000) };
assert.equal(authenticatedRewardRecipient(decoded, address, true, now), address);
assert.throws(() => authenticatedRewardRecipient(decoded, address, false, now));
for (const patch of [{ uid: 'someone-else' }, { wallet_address: '0xaa3a56E607C99bdaC6b4D22FA9A6725a74A50154' },
  { wallet_verified: false }, { wallet_auth_version: undefined }, { world_id_verified: false }, { auth_time: 0 }]) {
  assert.throws(() => authenticatedRewardRecipient({ ...decoded, ...patch }, address, true, now));
}
assert.throws(() => authenticatedRewardRecipient({ uid: address, is_world_id: true }, address, true, now));
console.log('Wallet auth policy: domain, chain, lifetime, recipient binding, fresh login and human-proof gate passed.');
