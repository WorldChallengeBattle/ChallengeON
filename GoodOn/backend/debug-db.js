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
    const challenges = await pool.query('SELECT id, title FROM challenges');
    const videos = await pool.query('SELECT id, challenge_id, video_url FROM challenge_videos');
    
    console.log('Challenges count:', challenges.rows.length);
    console.log('Videos count:', videos.rows.length);
    
    if (videos.rows.length > 0) {
      console.log('Sample Video:', videos.rows[0]);
    }
    
    const orphanedVideos = await pool.query('SELECT id FROM challenge_videos WHERE challenge_id NOT IN (SELECT id FROM challenges)');
    console.log('Orphaned Videos count:', orphanedVideos.rows.length);

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check();
