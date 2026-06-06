const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'wcb_db',
  password: process.env.PGPASSWORD || 'password',
  port: process.env.PGPORT || 5432,
});

const normalizeHashtags = (value) => {
  const tags = String(value || '')
    .split(/\s+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => !['#wcb', '#worldchallengebattle', '#worldchallenge', '#uon'].includes(tag.toLowerCase()));

  const lowerTags = new Set(tags.map((tag) => tag.toLowerCase()));
  if (!lowerTags.has('#unon')) tags.push('#UNON');
  if (!lowerTags.has('#challengeon')) tags.push('#challengeon');

  return Array.from(new Set(tags)).join(' ');
};

async function migrate() {
  try {
    console.log('[HASHTAGS] Migrating legacy project tags to #UNON #challengeon...');
    const result = await pool.query('SELECT id, hashtags FROM challenges');

    for (const row of result.rows) {
      const nextHashtags = normalizeHashtags(row.hashtags);
      if (nextHashtags === (row.hashtags || '')) continue;
      await pool.query('UPDATE challenges SET hashtags = $1 WHERE id = $2', [nextHashtags, row.id]);
      console.log(`[HASHTAGS] Updated ${row.id}: ${nextHashtags}`);
    }

    console.log('[HASHTAGS] Migration complete.');
  } catch (err) {
    console.error('[HASHTAGS] Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
