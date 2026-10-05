require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });
if (process.argv.includes('--cloud')) {
  const response = require('node:child_process').spawnSync('gcloud.cmd', [
    'secrets', 'versions', 'access', '4', '--secret=challengeon-runtime-secrets', '--project=challengeon-wcbflow'
  ], { encoding: 'utf8', shell: true });
  if (response.status !== 0) throw new Error('Unable to read the approved service database configuration');
  process.env.RUNTIME_SECRETS_JSON = response.stdout;
}
require('./runtime-secrets').loadRuntimeSecrets();
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const PROJECT = 'lkblcvkdwwyotcnhuunm';
if (process.argv.includes('--sessions') && process.argv.includes('--human-login')) throw new Error('Choose one migration target');

async function main() {
  const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  const host = url?.hostname || process.env.PGHOST || '';
  const user = url ? decodeURIComponent(url.username) : process.env.PGUSER || '';
  if (!host.includes(PROJECT) && !user.includes(PROJECT)) throw new Error('Unexpected database target');
  const client = new Client(url ? { connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 } : {
    host, user, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, port: process.env.PGPORT || 5432,
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  const sessions = process.argv.includes('--sessions');
  const humanLogin = process.argv.includes('--human-login');
  const tableNames = humanLogin ? ['world_id_human_login_requests', 'world_id_human_logins']
    : sessions ? ['world_id_login_requests', 'world_id_login_sessions', 'world_id_login_proofs']
    : ['world_id_requests', 'world_id_welcome_bindings'];
  try {
    await client.connect();
    const before = (await client.query(`SELECT relname, relrowsecurity FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1::text[])`, [tableNames])).rows;
    if (process.argv.includes('--apply')) {
      if (before.length) throw new Error('Target tables already exist; inspect instead of applying again');
      await client.query(fs.readFileSync(path.join(__dirname, humanLogin
        ? 'migrations/20261005_world_id_human_login.sql' : sessions
          ? 'migrations/20261004_world_id_sessions.sql' : 'migrations/20261003_world_id.sql'), 'utf8'));
    }
    const tables = (await client.query(`SELECT relname, relrowsecurity FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1::text[])`, [tableNames])).rows;
    const constraints = (await client.query(`SELECT conname, contype FROM pg_constraint WHERE conrelid IN
      (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1::text[]))`, [tableNames])).rows;
    console.log(JSON.stringify({ targetProject: PROJECT, applied: process.argv.includes('--apply'), before, tables, constraints }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { await client.end(); }
}

main().catch(error => { console.error('World ID migration did not complete:', error.code || 'Target/preflight check failed'); process.exitCode = 1; });
