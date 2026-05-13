const { fetchRssTrends } = require('./rss');

async function fetchYystvTrends({ region = 'cn' } = {}) {
  return fetchRssTrends({
    platform: 'yystv',
    region,
    category: 'gaming',
    limit: 20,
    sourceMessagePrefix: '游研社 RSS',
    sources: [
      process.env.YYSTV_RSS_URL || 'https://www.yystv.cn/rss/feed'
    ]
  });
}

module.exports = {
  fetchYystvTrends
};
