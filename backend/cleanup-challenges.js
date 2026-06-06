require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'wcb_db',
  password: process.env.PGPASSWORD || 'password',
  port: process.env.PGPORT || 5432,
});

async function cleanupChallenges() {
  console.log('[🧹] Starting Challenge Strategy Cleanup...');
  
  try {
    // Phase 1: Identify challenges with 0 videos
    const query = `
      SELECT c.id, c.title, c.viral_score, c.participants, COUNT(v.id) as video_count
      FROM challenges c
      LEFT JOIN challenge_videos v ON c.id = v.challenge_id
      WHERE c.is_official = false
      GROUP BY c.id, c.title
    `;
    const res = await pool.query(query);
    const results = res.rows;

    let deletedZeroCount = 0;
    let deletedLowUtilityCount = 0;

    for (const row of results) {
      const videoCount = parseInt(row.video_count);
      const isAuto = row.id.startsWith('auto_');
      const lowViral = row.viral_score < 2000;
      const fewParticipants = row.participants < 5;

      // Condition 1: 0 videos always delete if not official
      if (videoCount === 0) {
        await pool.query('DELETE FROM challenges WHERE id = $1', [row.id]);
        console.log(`[🗑️] REMOVED (No Content): ${row.title} (${row.id})`);
        deletedZeroCount++;
        continue;
      }

      // Condition 2: Low utility (Auto-generated, low score, few videos)
      if (isAuto && videoCount < 2 && lowViral && fewParticipants) {
        await pool.query('DELETE FROM challenges WHERE id = $1', [row.id]);
        console.log(`[🗑️] REMOVED (Low Utility): ${row.title} (${row.id})`);
        deletedLowUtilityCount++;
      }
    }

    console.log('\n[✨] CLEANUP SUMMARY:');
    console.log(`- Challenges with 0 videos removed: ${deletedZeroCount}`);
    console.log(`- Low utility topics removed: ${deletedLowUtilityCount}`);
    console.log('[🏁] Strategy Cleanup Finished.');

  } catch (err) {
    console.error('[!] Cleanup Error:', err.message);
  } finally {
    await pool.end();
  }
}

cleanupChallenges();
