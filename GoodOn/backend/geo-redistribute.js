require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'wcb_db',
  password: process.env.PGPASSWORD || 'password',
  port: process.env.PGPORT || 5432,
});

const GLOBAL_KEYWORD_MAP = {
  'Korea 🇰🇷': { keywords: ['챌린지', '유행', '급상승', '인기', '댄스', '서울', '한국', 'korea', 'k-pop', 'shorts', '쇼츠'] },
  'USA 🇺🇸': { keywords: ['challenge', 'viral', 'trending', 'dance', 'popular', 'usa', 'america', 'la', 'ny'] },
  'Japan 🇯🇵': { keywords: ['チャレンジ', 'トレンド', '話題', 'ダンス', '人気', '日本', '東京', 'japan', 'tokyo'] },
  'UK 🇬🇧': { keywords: ['uk', 'london', 'british', 'england'] },
  'SEA 🌏': { keywords: ['ชาเลนจ์', 'เต้น', 'thử thách', 'nhảy', 'tantangan', 'joget', 'populer', 'thai', 'vietnam', 'indonesia', 'malaysia'] },
  'Europe 🇪🇺': { keywords: ['défi', 'tendance', 'herausforderung', 'tanz', 'sfida', 'ballo', 'popolare', 'france', 'germany', 'italy', 'spain', 'europe'] },
  'Russia 🇷🇺': { keywords: ['челлендж', 'танец', 'популярный', 'вирусный', 'россия', 'москва', 'russia'] }
};

async function superRedistribute() {
  console.log('[🚀] Starting SUPER Geo-Hashtag Redistribution Migration...');
  
  try {
    // 1. Fetch all challenges to have a reference map
    const challengesQuery = `SELECT * FROM challenges WHERE is_active = true`;
    const chalRes = await pool.query(challengesQuery);
    const challenges = chalRes.rows;
    console.log(`[📊] Loaded ${challenges.length} candidate challenges.`);

    // 2. Fetch all videos
    const videosQuery = `
      SELECT v.*, c.id as current_challenge_id, c.region as current_challenge_region, c.hashtags as current_challenge_hashtags
      FROM challenge_videos v
      JOIN challenges c ON v.challenge_id = c.id
    `;
    const videoRes = await pool.query(videosQuery);
    const videos = videoRes.rows;
    console.log(`[🔍] Analyzing ${videos.length} videos...`);

    let movedCount = 0;
    let deletedCount = 0;
    let keptCount = 0;

    for (const v of videos) {
      const description = (v.video_title || '').toLowerCase();
      const videoHashtags = description.match(/#[\w가-힣]+/ig) || [];
      
      // 🌐 Character Set Detection
      const HAS_HANGUL = /[\uAC00-\uD7A3]/.test(description);
      const HAS_KANA = /[\u3040-\u309F\u30A0-\u30FF]/.test(description);
      const HAS_CYRILLIC = /[\u0400-\u04FF]/.test(description);
      const HAS_THAI = /[\u0E00-\u0E7F]/.test(description);

      let bestChallenge = null;
      let highestScore = -1;

      // Score each candidate challenge to find the best home for this video
      for (const ch of challenges) {
        let score = 0;
        const chHashtags = (ch.hashtags || '').toLowerCase().split(/\s+/);
        
        // --- 1. Hashtag Matching (Strongest signal) ---
        videoHashtags.forEach(vh => {
            if (chHashtags.includes(vh.toLowerCase())) score += 20;
        });

        // --- 2. Region Matching (Characters) ---
        if (ch.region === 'Korea 🇰🇷' && HAS_HANGUL) score += 15;
        if (ch.region === 'Japan 🇯🇵' && HAS_KANA) score += 15;
        if (ch.region === 'Russia 🇷🇺' && HAS_CYRILLIC) score += 15;
        if (ch.region === 'SEA 🌏' && HAS_THAI) score += 15;

        // --- 3. Region Matching (Keywords) ---
        const regionKeywords = GLOBAL_KEYWORD_MAP[ch.region]?.keywords || [];
        regionKeywords.forEach(kw => {
            if (description.includes(kw.toLowerCase())) {
                score += (ch.region === 'Global 🌍' ? 2 : 5);
            }
        });

        // --- 4. Official Challenge Bonus ---
        if (ch.is_official) score += 2;

        if (score > highestScore) {
          highestScore = score;
          bestChallenge = ch;
        }
      }

      // Deletions / Thresholds
      if (highestScore < 5) {
        console.log(`[🗑️] DELETING Irrelevant: "${v.video_title.substring(0, 20)}..." (Score: ${highestScore})`);
        await pool.query('DELETE FROM challenge_videos WHERE id = $1', [v.id]);
        deletedCount++;
        continue;
      }

      // MOVEMENT
      if (bestChallenge && bestChallenge.id !== v.challenge_id) {
        // Only move if the new home is significantly better or current home is bad
        // For now, move if it's better
        console.log(`[🔃] MOVING: "${v.video_title.substring(0, 15)}" -> ${bestChallenge.title} (Score: ${highestScore})`);
        await pool.query('UPDATE challenge_videos SET challenge_id = $1 WHERE id = $2', [bestChallenge.id, v.id]);
        movedCount++;
      } else {
        keptCount++;
      }
    }

    console.log('\n[✨] SUPER-REDISTRIBUTION SUMMARY:');
    console.log(`- Kept in place: ${keptCount}`);
    console.log(`- Moved to better home: ${movedCount}`);
    console.log(`- Deleted (No match): ${deletedCount}`);
    console.log('[🏁] Migration Finished.');

  } catch (err) {
    console.error('[!] Migration Error:', err.message);
  } finally {
    await pool.end();
  }
}

superRedistribute();
