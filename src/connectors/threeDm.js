const { fetchRssTrends } = require('./rss');

async function fetchThreeDmTrends({ region = 'cn' } = {}) {
  return fetchRssTrends({
    platform: 'threedm',
    region,
    category: 'gaming',
    limit: 20,
    sourceMessagePrefix: '3DM RSSHub',
    sources: [
      process.env.THREEDM_RSS_URL || 'https://rsshub.rssforever.com/3dmgame/news',
      'https://rsshub.ktachibana.party/3dmgame/news',
      'https://rsshub.noxussj.top/3dmgame/news'
    ]
  });
}

module.exports = {
  fetchThreeDmTrends
};
