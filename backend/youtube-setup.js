const { google } = require('googleapis');
const readline = require('readline');
require('dotenv').config();

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost';

if (!CLIENT_ID || !CLIENT_SECRET) {
  throw new Error('Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in backend/.env before running youtube-setup.js.');
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube'
];

async function run() {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Forces a new refresh token to be issued
  });

  console.log('----------------------------------------------------');
  console.log('1. Click this URL and sign in with the U&On YouTube channel account:');
  console.log('\n', authUrl, '\n');
  console.log('----------------------------------------------------');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('2. After authorizing, you will be redirected to an error page (localhost). Look at the URL in your browser.\nCopy the code parameter (e.g., ?code=4/0AeaY...&scope=...) and paste it here: ', async (code) => {
    rl.close();
    try {
      const { tokens } = await oauth2Client.getToken(decodeURIComponent(code));
      console.log('\n✅ SUCCESS! Copy the following into your backend/.env file:\n');
      console.log(`YOUTUBE_CLIENT_ID=${CLIENT_ID}`);
      console.log(`YOUTUBE_CLIENT_SECRET=${CLIENT_SECRET}`);
      console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log('\nKeep this secret safe!');
    } catch (err) {
      console.error('\n❌ Error retrieving token:', err.message);
    }
  });
}

run();
