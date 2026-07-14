const { fetchRssTrends } = require('./rss');
const { createTrend, fetchWithTimeout } = require('./shared');

async function fetchThreeDmTrends({ region = 'cn' } = {}) {
  const source = String(process.env.THREEDM_SOURCE || 'homepage-first').toLowerCase();

  if (source !== 'rss') {
    const homepageItems = await fetchThreeDmHomepage(region);
    if (homepageItems.length) return homepageItems;
  }

  return fetchThreeDmRss(region);
}

async function fetchThreeDmHomepage(region) {
  const endpoint = process.env.THREEDM_NEWS_URL || 'https://www.3dmgame.com/news/';

  try {
    const response = await fetchWithTimeout(
      endpoint,
      {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'
        }
      },
      15000
    );

    if (!response.ok) {
      throw new Error(`3DM news page failed with ${response.status}`);
    }

    const html = await response.text();
    const rows = parseThreeDmNewsLinks(html);

    if (!rows.length) {
      throw new Error('3DM news page returned no news links.');
    }

    return rows.slice(0, 20).map((item, index) =>
      createTrend({
        platform: 'threedm',
        title: item.title,
        rank: index + 1,
        heat: null,
        url: item.url,
        region,
        category: 'gaming',
        tags: ['threedm', 'homepage', 'gaming'],
        summary: '3DM news item collected from the public news page.',
        sourceType: 'public-page',
        sourceMessage: `3DM public news page: ${endpoint}.`
      })
    );
  } catch {
    return [];
  }
}

function fetchThreeDmRss(region) {
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

function parseThreeDmNewsLinks(html) {
  const seen = new Set();
  const rows = [];
  const matches = html.matchAll(/<a[^>]+href="(https:\/\/www\.3dmgame\.com\/news\/20\d{4}\/\d+\.html)"[^>]*>([\s\S]*?)<\/a>/g);

  for (const match of matches) {
    const url = match[1];
    if (seen.has(url)) continue;

    const title = cleanText(match[2])
      .replace(/^(游戏新闻|新闻|单机资讯|厂商新闻|游戏杂谈)\s*/, '')
      .trim();

    if (!title || title.length < 6 || /^\d+$/.test(title)) continue;

    seen.add(url);
    rows.push({ title, url, id: articleIdFromUrl(url) });
  }

  return rows.sort((a, b) => b.id - a.id);
}

function cleanText(value = '') {
  return decodeHtml(
    String(value)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function decodeHtml(value = '') {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function articleIdFromUrl(url) {
  const match = String(url).match(/\/(\d+)\.html$/);
  return match ? Number(match[1]) : 0;
}

module.exports = {
  fetchThreeDmTrends
};
