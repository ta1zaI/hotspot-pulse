const { fetchWithTimeout } = require('./shared');

async function enrichBilibiliStats(items) {
  return mapWithConcurrency(items, 5, async (item) => {
    const bvid = extractBvid(item.url);
    if (!bvid) return item;

    try {
      const response = await fetchWithTimeout(
        `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
        {
          headers: {
            Accept: 'application/json',
            Referer: item.url,
            'User-Agent': 'Mozilla/5.0'
          }
        },
        12000
      );

      if (!response.ok) return item;

      const payload = await response.json();
      const stat = payload?.data?.stat;
      if (!stat) return item;

      const metrics = {
        views: Number(stat.view) || 0,
        likes: Number(stat.like) || 0,
        coins: Number(stat.coin) || 0,
        favorites: Number(stat.favorite) || 0,
        shares: Number(stat.share) || 0,
        danmaku: Number(stat.danmaku) || 0,
        replies: Number(stat.reply) || 0
      };

      return {
        ...item,
        heat: metrics.views,
        metrics,
        summary: [
          item.summary,
          `播放 ${formatNumber(metrics.views)} · 点赞 ${formatNumber(metrics.likes)} · 投币 ${formatNumber(metrics.coins)} · 收藏 ${formatNumber(metrics.favorites)}`
        ]
          .filter(Boolean)
          .join('\n')
      };
    } catch {
      return item;
    }
  });
}

function extractBvid(url = '') {
  const match = String(url).match(/BV[a-zA-Z0-9]+/);
  return match?.[0] || '';
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function formatNumber(value) {
  if (!value) return '0';
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return String(value);
}

module.exports = {
  enrichBilibiliStats
};
