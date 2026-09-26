function loadRuntimeSecrets(env = process.env) {
  const raw = env.RUNTIME_SECRETS_JSON;
  if (!raw) return [];

  let secrets;
  try {
    secrets = JSON.parse(raw);
  } catch (error) {
    throw new Error(`RUNTIME_SECRETS_JSON is not valid JSON: ${error.message}`);
  }

  if (!secrets || typeof secrets !== 'object' || Array.isArray(secrets)) {
    throw new Error('RUNTIME_SECRETS_JSON must contain a JSON object');
  }

  const loaded = [];
  for (const [key, value] of Object.entries(secrets)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || typeof value !== 'string') {
      throw new Error(`Invalid runtime secret entry: ${key}`);
    }
    if (!env[key]) {
      env[key] = value;
      loaded.push(key);
    }
  }
  return loaded;
}

module.exports = { loadRuntimeSecrets };
