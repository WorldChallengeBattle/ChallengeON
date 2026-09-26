const crypto = require('crypto');

function matchesCronSecret(expected, supplied) {
  const expectedBuffer = Buffer.from(String(expected || ''));
  const suppliedBuffer = Buffer.from(String(supplied || ''));
  return expectedBuffer.length > 0
    && expectedBuffer.length === suppliedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

module.exports = { matchesCronSecret };
