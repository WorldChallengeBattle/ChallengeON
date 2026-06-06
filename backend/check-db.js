const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'wcb_db',
  password: process.env.PGPASSWORD || 'password',
  port: process.env.PGPORT || 5432,
});

async function check() {
    try {
        const result = await pool.query("SELECT id, video_title FROM challenge_videos LIMIT 10");
        console.table(result.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

check();
