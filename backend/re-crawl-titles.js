const { Pool } = require('pg');
const ytSearch = require('yt-search');
require('dotenv').config();

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'wcb_db',
  password: process.env.PGPASSWORD || 'password',
  port: process.env.PGPORT || 5432,
});

async function recrawl() {
    try {
        console.log('[🕵️‍♂️] RE-CRAWL START: Fetching videos with missing titles...');
        const result = await pool.query("SELECT id, external_url, platform FROM challenge_videos WHERE video_title IS NULL OR video_title = 'UNON Trend' OR video_title = 'WCB Trend' OR video_title = 'No Title'");
        
        console.log(`[🔍] Found ${result.rows.length} videos to update.`);

        for (const row of result.rows) {
            let newTitle = null;
            
            if (row.platform === 'youtube') {
                try {
                    // Extract Video ID from URL
                    const videoId = row.external_url.split('v=')[1] || row.external_url.split('/').pop();
                    if (videoId) {
                        const ytResult = await ytSearch({ videoId });
                        newTitle = ytResult.title;
                        console.log(`[✅] YouTube Title Found: ${newTitle}`);
                    }
                } catch (e) {
                    console.error(`[-] Failed to fetch YT title for ${row.id}`);
                }
            } else {
                // For TikTok/Instagram, we usually need the scraper actors, 
                // but we can try to use a generic 'Challenge Entry' or search again.
                // For this migration, let's focus on identifying them.
                newTitle = 'UNON Trending Discovery'; 
            }

            if (newTitle) {
                await pool.query('UPDATE challenge_videos SET video_title = $1 WHERE id = $2', [newTitle, row.id]);
            }
        }

        console.log('[🎉] RE-CRAWL COMPLETE!');
    } catch (err) {
        console.error('[!] Recrawl Error:', err.message);
    } finally {
        await pool.end();
    }
}

recrawl();
