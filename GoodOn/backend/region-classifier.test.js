const assert = require('assert');
const {
  inferRegion,
  normalizeRegion,
  scoreRegionFit
} = require('./region-classifier');

assert.strictEqual(inferRegion({ title: 'Kpop dance challenge in Seoul #kpop' }), 'Korea 🇰🇷');
assert.strictEqual(inferRegion({ title: '東京 anime edit challenge' }), 'Japan 🇯🇵');
assert.strictEqual(inferRegion({ title: 'Dubai dance trend Arabic remix' }), 'Middle East 🐪');
assert.strictEqual(inferRegion({ title: 'New York street challenge' }), 'USA 🇺🇸');
assert.strictEqual(normalizeRegion('Korea 🇰🇷'), 'Korea 🇰🇷');

const koreaFit = scoreRegionFit({ video_title: 'Seoul kpop dance #kpop' }, 'Korea 🇰🇷');
assert.ok(koreaFit.score > 0);

const wrongFit = scoreRegionFit({ video_title: 'Seoul kpop dance #kpop' }, 'USA 🇺🇸');
assert.ok(wrongFit.score < 0);

console.log('region-classifier tests passed');
