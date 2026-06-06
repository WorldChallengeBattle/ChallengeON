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
    console.log('[📦] Adding is_official and category columns (Retry with correct SQL)');
    await pool.query('ALTER TABLE challenges ADD COLUMN IF NOT EXISTS is_official BOOLEAN DEFAULT false;');
    await pool.query('ALTER TABLE challenges ADD COLUMN IF NOT EXISTS category TEXT DEFAULT \'Trending\';');
    
    // Set Editor's Choice for our curated list
    const officialTags = ['90sVision', 'CyberPantomime', 'GravityShift', 'MicroCooking', 'AIRealityCheck'];
    for (const tag of officialTags) {
      await pool.query('UPDATE challenges SET is_official = true, category = \'Official\' WHERE hashtags LIKE $1', [`%${tag}%`]);
    }
    
    console.log('[🎉] Migration Complete!');
  } catch (err) {
    console.error('[!] Migration Error:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
