const { fetchRssTrends } = require('./rss');

async function fetchNadianshiTrends({ region = 'cn' } = {}) {
  return fetchRssTrends({
    platform: 'nadianshi',
    region,
    category: 'gaming',
    limit: 20,
    sourceMessagePrefix: '手游那点事 RSS',
    sources: [
      process.env.NADIANSHI_RSS_URL || 'http://www.nadianshi.com/feed'
    ]
  });
}

module.exports = {
  fetchNadianshiTrends
};
