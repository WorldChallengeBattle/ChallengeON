const assert = require('assert');
const {
  findBestChallengeForVideo,
  scoreShortFormPreference,
  scoreVideoForChallenge
} = require('./challenge-matcher');

const nanoBanana = {
  id: 'trend_nanobanana',
  title: 'Nano Banana Challenge',
  hashtags: '#nanobanana #AIArt #UNON #challengeon'
};

const seaLion = {
  id: 'trend_sealion',
  title: 'Sea Lion Challenge',
  hashtags: '#sealion #UNON #challengeon'
};

const exactHashtag = scoreVideoForChallenge({
  video_title: 'Trying this look #nanobanana #aiart'
}, nanoBanana);
assert.strictEqual(exactHashtag.accepted, true);
assert.ok(exactHashtag.score >= 120);

const genericOnly = scoreVideoForChallenge({
  video_title: 'Best viral shorts challenge today #challenge #viral'
}, nanoBanana);
assert.strictEqual(genericOnly.accepted, false);

const titlePhrase = scoreVideoForChallenge({
  video_title: 'My nano banana edit is getting wild'
}, nanoBanana);
assert.strictEqual(titlePhrase.accepted, true);

const bestMatch = findBestChallengeForVideo({
  video_title: 'Unexpected beach clip #sealion'
}, [nanoBanana, seaLion]);
assert.strictEqual(bestMatch.accepted, true);
assert.strictEqual(bestMatch.challenge.id, 'trend_sealion');

const shortsPreference = scoreShortFormPreference({
  platform: 'youtube',
  video_url: 'https://www.youtube.com/shorts/abc123',
  duration: 42
});
assert.ok(shortsPreference.score >= 120);

const longVideoPenalty = scoreShortFormPreference({
  platform: 'youtube',
  video_url: 'https://www.youtube.com/watch?v=abc123',
  duration: 600
});
assert.ok(longVideoPenalty.score < 0);

console.log('challenge-matcher tests passed');
