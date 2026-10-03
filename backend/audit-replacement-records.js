require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });
require('./runtime-secrets').loadRuntimeSecrets();
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

async function main() {
  const client = new Client(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 } : {
    host: process.env.PGHOST, port: process.env.PGPORT || 5432, database: process.env.PGDATABASE,
    user: process.env.PGUSER, password: process.env.PGPASSWORD, connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '15000ms'");
    const tables = (await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows.map(row => row.table_name);
    const result = { checkedAt: new Date().toISOString(), databaseWrites: false, tables: {}, indexerState: [], prizeChallenges: [],
      limitations: ['Database records do not prove absence of unindexed mission/award events. No Firestore user or full-chain event audit performed.'] };
    const selections = ['challenges', 'challenge_videos', 'prize_video_votes', 'unon_transfers', 'unon_welcome_claims', 'token_donations'];
    for (const table of selections) {
      if (tables.includes(table)) result.tables[table] = (await client.query(`SELECT COUNT(*)::integer AS count FROM "${table}"`)).rows[0].count;
    }
    if (tables.includes('unon_indexer_state')) result.indexerState = (await client.query(
      'SELECT token_address, from_block, last_synced_block, latest_block, status FROM unon_indexer_state')).rows;
    if (tables.includes('challenges')) result.prizeChallenges = (await client.query(
      "SELECT id, prize_status, prize_manager_address, prize_onchain_challenge_id, prize_create_tx_hash, prize_finalize_tx_hash FROM challenges WHERE challenge_type='prize' OR prize_onchain_challenge_id IS NOT NULL")).rows;
    if (tables.includes('unon_transfers')) result.indexedTransfers = (await client.query(
      'SELECT token_address, COUNT(*)::integer AS count, MIN(block_number) AS first_block, MAX(block_number) AS last_block FROM unon_transfers GROUP BY token_address')).rows;
    if (tables.includes('unon_welcome_claims')) result.indexedWelcomeClaims = (await client.query(
      'SELECT token_address, COUNT(*)::integer AS count, SUM(amount_raw)::text AS amount_raw FROM unon_welcome_claims GROUP BY token_address')).rows;
    await client.query('ROLLBACK');
    const output = path.resolve(__dirname, '../tmp/replacement-record-audit.json');
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ output, ...result }, null, 2));
  } finally { await client.end(); }
}

main().catch(() => { console.error('Read-only record audit failed; no database changes were made. Check connectivity/schema locally.'); process.exitCode = 1; });
