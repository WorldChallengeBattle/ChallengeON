const assert = require('assert');
const { loadRuntimeSecrets } = require('./runtime-secrets');

const env = {
  EXISTING: 'keep-me',
  RUNTIME_SECRETS_JSON: JSON.stringify({
    EXISTING: 'replace-me',
    DATABASE_URL: 'postgresql://example',
    CRON_SECRET: 'cron-secret'
  })
};

assert.deepStrictEqual(loadRuntimeSecrets(env), ['DATABASE_URL', 'CRON_SECRET']);
assert.strictEqual(env.EXISTING, 'keep-me');
assert.strictEqual(env.DATABASE_URL, 'postgresql://example');
assert.strictEqual(env.CRON_SECRET, 'cron-secret');

assert.throws(
  () => loadRuntimeSecrets({ RUNTIME_SECRETS_JSON: '[]' }),
  /must contain a JSON object/
);
assert.throws(
  () => loadRuntimeSecrets({ RUNTIME_SECRETS_JSON: '{bad json}' }),
  /is not valid JSON/
);
assert.throws(
  () => loadRuntimeSecrets({ RUNTIME_SECRETS_JSON: '{"bad-key":"value"}' }),
  /Invalid runtime secret entry/
);

console.log('runtime-secrets tests passed');
