require('dotenv').config();
const { google } = require('googleapis');

const [, , command, code] = process.argv;
const redirectUri = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost';

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  redirectUri
);

const scope = ['https://www.googleapis.com/auth/youtube.upload'];

async function main() {
  if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) {
    throw new Error('Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in backend/.env first.');
  }

  if (command === 'url') {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope,
    });
    console.log(url);
    return;
  }

  if (command === 'token') {
    if (!code) throw new Error('Usage: npm run youtube:token -- "<authorization_code>"');
    const { tokens } = await oauth2Client.getToken(code);
    console.log(JSON.stringify({
      hasAccessToken: Boolean(tokens.access_token),
      hasRefreshToken: Boolean(tokens.refresh_token),
      refreshToken: tokens.refresh_token || null,
      expiryDate: tokens.expiry_date || null,
    }, null, 2));
    return;
  }

  if (command === 'check') {
    if (!process.env.YOUTUBE_REFRESH_TOKEN) {
      throw new Error('Set YOUTUBE_REFRESH_TOKEN in backend/.env first.');
    }
    oauth2Client.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
    const token = await oauth2Client.getAccessToken();
    console.log(JSON.stringify({ ok: Boolean(token?.token) }, null, 2));
    return;
  }

  console.log([
    'Usage:',
    '  npm run youtube:auth-url',
    '  npm run youtube:token -- "<authorization_code>"',
    '  npm run youtube:check',
  ].join('\n'));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
