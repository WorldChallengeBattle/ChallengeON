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
    console.log('[📦] Creating pending_donations table and updating users...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pending_donations (
        id SERIAL PRIMARY KEY, 
        creator_handle TEXT NOT NULL, 
        points INTEGER DEFAULT 0, 
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 100;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS creator_handle TEXT;
    `);
    console.log('[🎉] Migration Successful!');
  } catch (err) {
    console.error('[!] Migration Error:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
