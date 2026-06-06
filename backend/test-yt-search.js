const ytSearch = require('yt-search');

async function test() {
  const result = await ytSearch({ query: 'global trending shorts challenge', limit: 5 });
  console.log(JSON.stringify(result.videos[0], null, 2));
}

test();
