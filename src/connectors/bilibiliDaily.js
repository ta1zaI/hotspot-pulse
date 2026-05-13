const { fetchRssTrends } = require('./rss');
const { enrichBilibiliStats } = require('./bilibiliStats');

async function fetchBilibiliDailyTrends({ region = 'cn' } = {}) {
  const items = await fetchRssTrends({
    platform: 'bilibili_daily',
    region,
    category: 'entertainment',
    limit: 30,
    sourceMessagePrefix: 'Bilibili daily ranking RSSHub',
    sources: [
      process.env.BILIBILI_DAILY_RSS_URL || 'https://rsshub.rssforever.com/bilibili/ranking/all/0/3',
      'https://rsshub.rssforever.com/bilibili/popular/all',
      'https://rsshub.ktachibana.party/bilibili/popular/all'
    ]
  });

  return enrichBilibiliStats(items);
}

module.exports = {
  fetchBilibiliDailyTrends
};
