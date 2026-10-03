const assert = require('node:assert/strict');
const fs = require('node:fs');
const server = fs.readFileSync('backend/server.js', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
assert.match(server, /app\.delete\('\/api\/videos\/:id', requireAuthenticatedUser, requireAdmin,/);
assert.doesNotMatch(app, /fetch\(apiUrl\(`\/api\/videos\/\$\{videoId\}`\), \{ method: 'DELETE' \}\)/);
assert.doesNotMatch(fs.readFileSync('src/services/challengeService.ts', 'utf8'), /mockVideos|fallback-\$\{idx\}/);
console.log('Playback safety checks passed (admin-only deletion, no client delete, no fake videos).');
