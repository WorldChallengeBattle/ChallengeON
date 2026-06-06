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
    console.log('[📦] Adding is_active column to challenges table...');
    await pool.query('ALTER TABLE challenges ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;');
    
    // For existing challenges, let's check if they have videos and activate them
    console.log('[🔍] Activating existing challenges with videos...');
    await pool.query(`
      UPDATE challenges 
      SET is_active = true 
      WHERE id IN (SELECT DISTINCT challenge_id FROM challenge_videos)
    `);
    
    console.log('[🎉] Migration Complete!');
  } catch (err) {
    console.error('[!] Migration Error:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
