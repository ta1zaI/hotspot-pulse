const { fetchRssTrends } = require('./rss');

async function fetchGamelookTrends({ region = 'cn' } = {}) {
  return fetchRssTrends({
    platform: 'gamelook',
    region,
    category: 'gaming',
    limit: 20,
    sourceMessagePrefix: 'GameLook RSS',
    sources: [
      process.env.GAMELOOK_RSS_URL || 'http://www.gamelook.com.cn/feed'
    ]
  });
}

module.exports = {
  fetchGamelookTrends
};
