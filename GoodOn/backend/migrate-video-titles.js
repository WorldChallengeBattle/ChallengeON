const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'wcb_db',
  password: process.env.PGPASSWORD || 'password',
  port: process.env.PGPORT || 5432,
});

async function migrate() {
  try {
    console.log('[📦] Adding video_title column to challenge_videos...');
    await pool.query('ALTER TABLE challenge_videos ADD COLUMN IF NOT EXISTS video_title TEXT DEFAULT \'No Title\';');
    console.log('[🎉] Migration Complete!');
  } catch (err) {
    console.error('[!] Migration Error:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
