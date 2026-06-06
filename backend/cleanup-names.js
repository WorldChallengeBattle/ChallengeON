require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'wcb_db',
  password: process.env.PGPASSWORD || 'password',
  port: process.env.PGPORT || 5432,
});

function formatChallengeTitle(tag) {
    if (!tag) return 'Discovery';
    // Remove # if present
    let clean = tag.replace('#', '');
    // Insert spaces before capitals
    clean = clean.replace(/([A-Z])/g, ' $1').trim();
    // Replace underscores and hyphens with spaces
    clean = clean.replace(/[_-]/g, ' ');
    // Title Case
    return clean.split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
        .trim();
}

async function cleanup() {
  console.log('[🧹] Starting Challenge Name Normalization...');
  try {
    const res = await pool.query('SELECT id, title, hashtags FROM challenges');
    let updatedCount = 0;

    for (const row of res.rows) {
      const firstTag = (row.hashtags || '').split(' ')[0] || '';
      if (!firstTag) continue;

      let newTitle = formatChallengeTitle(firstTag);
      if (!newTitle.toLowerCase().includes('challenge')) {
          newTitle += ' Challenge';
      }

      if (newTitle !== row.title) {
        console.log(`[✏️] RENAME: "${row.title}" -> "${newTitle}"`);
        await pool.query('UPDATE challenges SET title = $1 WHERE id = $2', [newTitle, row.id]);
        updatedCount++;
      }
    }

    console.log(`[✅] Done. Normalized ${updatedCount} challenge names.`);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

cleanup();
