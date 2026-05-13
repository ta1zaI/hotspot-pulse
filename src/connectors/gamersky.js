const { fetchRssTrends } = require('./rss');

async function fetchGamerskyTrends({ region = 'cn' } = {}) {
  return fetchRssTrends({
    platform: 'gamersky',
    region,
    category: 'gaming',
    limit: 20,
    sourceMessagePrefix: 'Gamersky RSSHub',
    sources: [
      process.env.GAMERSKY_RSS_URL || 'https://rsshub.rssforever.com/gamersky/news',
      'https://rsshub.ktachibana.party/gamersky/news',
      'https://rsshub.noxussj.top/gamersky/news'
    ]
  });
}

module.exports = {
  fetchGamerskyTrends
};
