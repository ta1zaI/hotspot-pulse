const { fetchRssTrends } = require('./rss');
const { enrichBilibiliStats } = require('./bilibiliStats');

async function fetchBilibiliWeeklyTrends({ region = 'cn' } = {}) {
  const items = await fetchRssTrends({
    platform: 'bilibili_weekly',
    region,
    category: 'entertainment',
    limit: 30,
    sourceMessagePrefix: 'Bilibili weekly ranking RSSHub',
    sources: [
      process.env.BILIBILI_WEEKLY_RSS_URL || 'https://rsshub.rssforever.com/bilibili/weekly',
      'https://rsshub.ktachibana.party/bilibili/weekly',
      'https://rsshub.rssforever.com/bilibili/weekly/disable'
    ]
  });

  return enrichBilibiliStats(items);
}

module.exports = {
  fetchBilibiliWeeklyTrends
};
