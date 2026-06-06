require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'wcb_db',
  password: process.env.PGPASSWORD || 'password',
  port: process.env.PGPORT || 5432,
});

async function migrate() {
  console.log('[🚀] Starting Region Name Migration (Southeast Asia)...');
  try {
    // Update all variations of South East Asia to the clean "Southeast Asia"
    const query = `
      UPDATE challenges 
      SET region = 'Southeast Asia' 
      WHERE region LIKE 'SEA%' 
         OR region LIKE 'Southeast Asia%' 
         OR region LIKE 'South East Asia%'
    `;
    const res = await pool.query(query);
    console.log(`[✅] Migration Complete. Updated ${res.rowCount} challenges.`);
  } catch (err) {
    console.error('[!] Migration Error:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
