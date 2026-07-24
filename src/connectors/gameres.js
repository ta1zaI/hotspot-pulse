const { createTrend, fetchWithTimeout } = require('./shared');

async function fetchGameresTrends({ region = 'cn' } = {}) {
  const source = String(process.env.GAMERES_SOURCE || 'homepage-first').toLowerCase();

  if (source !== 'json') {
    const homepageItems = await fetchGameresHomepage(region);
    if (homepageItems.length) return homepageItems;
  }

  return fetchGameresJson(region);
}

async function fetchGameresHomepage(region) {
  const endpoint = process.env.GAMERES_HOME_URL || 'https://www.gameres.com/';

  try {
    const response = await fetchWithTimeout(
      endpoint,
      {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'User-Agent': 'Mozilla/5.0'
        }
      },
      15000
    );

    if (!response.ok) {
      throw new Error(`GameRes homepage failed with ${response.status}`);
    }

    const html = await response.text();
    const rows = parseGameresArticleLinks(html);

    if (!rows.length) {
      throw new Error('GameRes homepage returned no article rows.');
    }

    return rows.slice(0, 20).map((item, index) =>
      createTrend({
        platform: 'gameres',
        title: item.title,
        rank: index + 1,
        heat: null,
        url: item.url,
        region,
        category: 'gaming',
        tags: ['gameres', 'homepage', 'game-industry'],
        summary: 'GameRes article collected from the public homepage.',
        sourceType: 'public-page',
        sourceMessage: `GameRes public homepage: ${endpoint}.`
      })
    );
  } catch {
    return [];
  }
}

async function fetchGameresJson(region) {
  const endpoint = process.env.GAMERES_JSON_URL || 'https://www.gameres.com/newslistJson';

  try {
    const response = await fetchWithTimeout(
      endpoint,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      },
      15000
    );

    if (!response.ok) {
      throw new Error(`GameRes request failed with ${response.status}`);
    }

    const payload = await response.json();
    const rows = Array.isArray(payload?.list) ? payload.list : [];

    if (!rows.length) {
      throw new Error('GameRes returned no rows.');
    }

    return rows.slice(0, 20).map((item, index) => {
      const title = item.subject || `GameRes article ${index + 1}`;
      const url = item.wailian || item.url || `/thread-${item.id}-1-1.html`;

      return createTrend({
        platform: 'gameres',
        title,
        rank: index + 1,
        heat: null,
        url: normalizeGameresUrl(url),
        region,
        category: 'gaming',
        tags: ['gameres', 'game-industry'],
        summary: item.summary || '',
        sourceType: 'public-api',
        sourceMessage: `GameRes public JSON source: ${endpoint}.`
      });
    });
  } catch (error) {
    throw new Error(`GameRes failed: ${error.message}`);
  }
}

function normalizeGameresUrl(url) {
  if (!url) return 'https://www.gameres.com/';
  if (url.startsWith('http')) return url;
  return `https://www.gameres.com${url}`;
}

function parseGameresArticleLinks(html) {
  const seen = new Set();
  const rows = [];
  const matches = html.matchAll(/<a[^>]+href="((?:https:\/\/www\.gameres\.com)?\/(?:\d+\.html|wl\?m=[^"]+))"[^>]*>([\s\S]*?)<\/a>/g);

  for (const match of matches) {
    const rawUrl = match[1];
    const title = cleanText(match[2]);
    const url = normalizeGameresUrl(rawUrl);

    if (seen.has(url)) continue;
    if (!title || title.length < 6 || title.includes('推广')) continue;

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
  fetchGameresTrends
};
