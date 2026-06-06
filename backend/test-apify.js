const { ApifyClient } = require('apify-client');
const fs = require('fs');
require('dotenv').config();

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

async function test() {
  console.log('Testing Instagram Scraper...');
  console.log('Testing YouTube Scraper...');
  try {
    const run = await client.actor("apify/youtube-scraper").call({
      searchKeywords: "shuffle dance shorts",
      maxResults: 2
    });
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    console.log(`YouTube Items: ${items.length}`);
    fs.writeFileSync('result_youtube.json', JSON.stringify(items, null, 2));
  } catch (e) {
    console.error('YouTube Error:', e.message);
  }
}
test();
