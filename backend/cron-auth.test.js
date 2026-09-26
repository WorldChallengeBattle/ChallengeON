const assert = require('assert');
const { matchesCronSecret } = require('./cron-auth');

assert.equal(matchesCronSecret('', ''), false);
assert.equal(matchesCronSecret('secret', 'wrong!'), false);
assert.equal(matchesCronSecret('secret', 'secret'), true);
assert.equal(matchesCronSecret('비밀', '비밀'), true);

console.log('cron-auth tests passed');
