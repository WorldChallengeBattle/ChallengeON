require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'wcb_db',
  password: process.env.PGPASSWORD || 'password',
  port: process.env.PGPORT || 5432,
});

async function addHighQualityShortsChallenges() {
  console.log('[🚀] Injecting High-Quality YouTube Shorts (Banbaji) Challenges...');
  
  const highQualityTrends = [
    { id: 'yt_shorts_korea_dance', title: 'Korea DANCE 쇼츠 챌린지', hashtags: '#댄스 #쇼츠챌린지 #GoodON #kindnesson #PraiseRelay #Shorts', region: 'Korea 🇰🇷', tag: '댄스' },
    { id: 'yt_shorts_korea_fitness', title: '1분 피트니스 쇼츠 챌린지', hashtags: '#오운완 #쇼츠 #운동챌린지 #GoodON #kindnesson #PraiseRelay', region: 'Korea 🇰🇷', tag: '운동' },
    { id: 'yt_shorts_global_magic', title: 'Global Magic Shorts Challenge', hashtags: '#magic #shorts #illusion #GoodON #kindnesson #PraiseRelay', region: 'Global 🌍', tag: 'magic' },
    { id: 'yt_shorts_japan_vlog', title: 'Japan Daily VLOG 쇼츠', hashtags: '#vlog #shorts #japan #GoodON #kindnesson #PraiseRelay #일상', region: 'Japan 🇯🇵', tag: 'vlog' }
  ];

  try {
    for (const trend of highQualityTrends) {
        const query = `
            INSERT INTO challenges (id, title, hashtags, region, viral_score, participants, bg_gradient, is_official)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (id) DO UPDATE SET
                is_official = EXCLUDED.is_official
        `;
        await pool.query(query, [
            trend.id, 
            trend.title, 
            trend.hashtags, 
            trend.region, 
            15000, 
            500, 
            'linear-gradient(45deg, #FF0000, #CC0000)', 
            true
        ]);
        console.log(`[✅] Added/Updated Challenge: ${trend.title}`);
    }
  } catch (err) {
    console.error('[!] Error injecting challenges:', err.message);
  } finally {
    await pool.end();
  }
}

addHighQualityShortsChallenges();
