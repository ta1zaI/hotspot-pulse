const { fetchRssTrends } = require('./rss');

async function fetchGcoresTrends({ region = 'cn' } = {}) {
  return fetchRssTrends({
    platform: 'gcores',
    region,
    category: 'gaming',
    limit: 20,
    sourceMessagePrefix: '机核 RSSHub',
    sources: [
      process.env.GCORES_RSS_URL || 'https://rsshub.rssforever.com/gcores/news',
      'https://rsshub.ktachibana.party/gcores/news',
      'https://rsshub.noxussj.top/gcores/news'
    ]
  });
}

module.exports = {
  fetchGcoresTrends
};
