require('dotenv').config();
const pg = require('pg');
const pool = new pg.Pool({ connectionString: 'postgres://postgres:A630q%40audi@localhost:5432/wcb_db' });

const TABLE_VIDEOS = 'challenge_videos';
const TABLE_CHALLENGES = 'challenges';

async function check() {
  try {
    const query = `
      SELECT c.title, c.region, COUNT(v.id) as video_count
      FROM ${TABLE_CHALLENGES} c
      LEFT JOIN ${TABLE_VIDEOS} v ON c.id = v.challenge_id
      WHERE c.is_active = true
      GROUP BY c.id, c.title, c.region
      ORDER BY video_count DESC
    `;
    const result = await pool.query(query);
    console.log(`Total challenges: ${result.rows.length}`);
    const withVideos = result.rows.filter(r => parseInt(r.video_count) > 0);
    console.log(`Challenges with videos (>0): ${withVideos.length}`);
    withVideos.slice(0, 10).forEach(r => {
        console.log(`- [${r.region}] ${r.title}: ${r.video_count} videos`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

check();
