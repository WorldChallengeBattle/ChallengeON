require('dotenv').config();
const { Pool } = require('pg');
const { findBestChallengeForVideo, scoreVideoForChallenge } = require('./challenge-matcher');

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'wcb_db',
  password: process.env.PGPASSWORD || 'password',
  port: process.env.PGPORT || 5432,
});

async function relinkVideos() {
  console.log('[relink] Starting strict video-to-challenge relinking...');

  try {
    const chalRes = await pool.query('SELECT * FROM challenges WHERE is_active = true');
    const challenges = chalRes.rows;
    console.log(`[relink] Loaded ${challenges.length} active challenges.`);

    const videoRes = await pool.query('SELECT * FROM challenge_videos');
    const videos = videoRes.rows;
    console.log(`[relink] Analyzing ${videos.length} videos.`);

    let relinkedCount = 0;
    let deletedCount = 0;
    let unchangedCount = 0;

    for (const video of videos) {
      const currentChallenge = challenges.find((challenge) => challenge.id === video.challenge_id);
      const currentMatch = currentChallenge ? scoreVideoForChallenge(video, currentChallenge) : null;
      const bestMatch = findBestChallengeForVideo(video, challenges);
      const titlePreview = String(video.video_title || '').substring(0, 40);

      if (!bestMatch.accepted) {
        if (!currentMatch?.accepted) {
          console.log(`[delete] Unmatched: "${titlePreview}" (best score: ${bestMatch.score})`);
          await pool.query('DELETE FROM challenge_videos WHERE id = $1', [video.id]);
          deletedCount++;
        } else {
          unchangedCount++;
        }
        continue;
      }

      const shouldRelink = bestMatch.challenge
        && bestMatch.challenge.id !== video.challenge_id
        && (!currentMatch?.accepted || bestMatch.score >= currentMatch.score + 30);

      if (shouldRelink) {
        console.log(`[relink] "${titlePreview}" -> ${bestMatch.challenge.title} (score: ${bestMatch.score})`);
        await pool.query('UPDATE challenge_videos SET challenge_id = $1 WHERE id = $2', [bestMatch.challenge.id, video.id]);
        relinkedCount++;
      } else {
        unchangedCount++;
      }
    }

    console.log('\n[relink] Summary');
    console.log(`- Kept/correct: ${unchangedCount}`);
    console.log(`- Relinked: ${relinkedCount}`);
    console.log(`- Deleted unmatched: ${deletedCount}`);
  } catch (err) {
    console.error('[relink] Error:', err.message);
  } finally {
    await pool.end();
  }
}

relinkVideos();
