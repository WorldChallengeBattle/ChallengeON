const fs = require('node:fs');
require('../backend/node_modules/dotenv').config({ path: 'backend/.env', quiet: true });
const { Pool } = require('../backend/node_modules/pg');
const pool = new Pool({ connectionString: process.env.COLLECTION_DB_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const source = fs.readFileSync('backend/server.js', 'utf8');
  const route = source.slice(source.indexOf("app.get('/api/challenges',"));
  const template = route.match(/const query = `([\s\S]*?)`;/)[1];
  const sql = template.replaceAll('${TABLE_CHALLENGES}', 'challenges').replaceAll('${TABLE_VIDEOS}', 'challenge_videos').replaceAll('${modeFilter}', '');
  const client = await pool.connect();
  let rows;
  try {
    await client.query('BEGIN READ ONLY');
    rows = (await client.query(sql)).rows;
    await client.query('ROLLBACK');
  } finally { client.release(); }
  const response = await fetch('https://challengeon-api-84209014292.asia-northeast3.run.app/api/challenges').then(r => r.json());
  const lookup = new Map(rows.map(row => [row.id, row]));
  for (const challenge of response.data) {
    const row = lookup.get(challenge.id);
    challenge.thumbnailUrl = row?.thumbnail_url || null;
    challenge.latestVideoAt = row?.latest_video_at || null;
  }
  fs.mkdirSync('tmp', { recursive: true });
  fs.writeFileSync('tmp/discovery-live-snapshot.json', JSON.stringify(response));
  console.log(JSON.stringify({ readOnly: true, rows: rows.length, withThumbnail: rows.filter(r => r.thumbnail_url).length }));
})().catch(() => { console.error('Read-only preview query verification failed'); process.exitCode = 1; }).finally(() => pool.end());
