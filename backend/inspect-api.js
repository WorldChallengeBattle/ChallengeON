const http = require('http');
http.get('http://localhost:8080/api/challenges', res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const json = JSON.parse(data);
    const firstChallenge = json.data[0];
    console.log('Keys in challenge 0:', Object.keys(firstChallenge));
    console.log('Full challenge 0:', JSON.stringify(firstChallenge, null, 2));
  });
});
