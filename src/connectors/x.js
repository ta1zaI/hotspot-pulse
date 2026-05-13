const { createTrend, fetchJsonWithPowerShell, fetchWithTimeout } = require('./shared');

async function fetchXTrends({ region = 'global' } = {}) {
  const source = (process.env.X_SOURCE || 'trends24').toLowerCase();

  if (source !== 'api') {
    return fetchTrends24(region);
  }

  const token = process.env.X_BEARER_TOKEN;

  if (!token) {
    return sampleXTrends(region, 'Set X_BEARER_TOKEN in .env to enable the official X trends API.');
  }

  const woeid = process.env.X_WOEID || '1';
  const endpoint = `https://api.x.com/2/trends/by/woeid/${encodeURIComponent(woeid)}`;

  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    };
    const response = await fetchXEndpoint(endpoint, headers);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`X trends request failed with ${response.status}: ${body.slice(0, 160)}`);
    }

    const payload = await response.json();
    const trends = normalizeXTrends(payload);

    if (!trends.length) {
      throw new Error('X trends response did not include trend rows.');
    }

    return trends.slice(0, 30).map((item, index) => {
      const title = item.trend_name || item.name || item.query || item.title || `Trend ${index + 1}`;

      return createTrend({
        platform: 'x',
        title,
        rank: Number(item.rank || index + 1),
        heat: Number(item.tweet_count || item.post_count || item.volume || item.count) || null,
        url: item.url || `https://x.com/search?q=${encodeURIComponent(title)}`,
        region,
        category: inferCategory(title),
        tags: ['x', 'social'],
        summary: 'X platform trend from the official API.',
        sourceType: 'api',
        sourceMessage: `Official X trends API, WOEID ${woeid}.`
      });
    });
  } catch (error) {
    return sampleXTrends(region, `X API fallback: ${formatFetchError(error)}`, 'sample-fallback');
  }
}

async function fetchTrends24(region) {
  const slug = process.env.X_TRENDS24_REGION || 'united-states';
  const endpoint = `https://trends24.in/${slug}/`;

  try {
    const response = await fetchTrends24Page(endpoint);

    if (!response.ok) {
      throw new Error(`Trends24 request failed with ${response.status}`);
    }

    const html = await response.text();
    const trends = parseTrends24(html);

    if (!trends.length) {
      throw new Error('Trends24 page loaded, but no trend rows were found.');
    }

    return trends.slice(0, 30).map((item, index) =>
      createTrend({
        platform: 'x',
        title: item.title,
        rank: index + 1,
        heat: item.heat,
        url: item.url,
        region: slug || region,
        category: inferCategory(item.title),
        tags: ['x', 'trends24'],
        summary: 'X trend collected from the public Trends24 page.',
        sourceType: 'public-page',
        sourceMessage: `Free public trend source: trends24.in/${slug}.`
      })
    );
  } catch (error) {
    return sampleXTrends(region, `Trends24 fallback: ${formatFetchError(error)}`, 'sample-fallback');
  }
}

async function fetchTrends24Page(endpoint) {
  const headers = {
    Accept: 'text/html,application/xhtml+xml',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'
  };

  try {
    return await fetchWithTimeout(endpoint, { headers }, 15000);
  } catch (error) {
    if (process.platform !== 'win32') {
      throw error;
    }

    return fetchJsonWithPowerShell(endpoint, headers);
  }
}

function parseTrends24(html) {
  const latestList = html.match(/<ol class=trend-card__list>([\s\S]*?)<\/ol>/);
  if (!latestList) return [];

  const rows = [];
  const linkPattern = /<a\s+href="([^"]+)"[^>]*class=trend-link[^>]*>([\s\S]*?)<\/a>[\s\S]*?<span class=tweet-count[^>]*data-count="([^"]*)"/g;
  let match;

  while ((match = linkPattern.exec(latestList[1])) !== null) {
    const title = decodeHtml(stripTags(match[2])).trim();
    if (!title) continue;

    rows.push({
      title,
      url: normalizeXSearchUrl(decodeHtml(match[1])),
      heat: parseHeat(match[3])
    });
  }

  return rows;
}

function normalizeXSearchUrl(url) {
  if (!url) return 'https://x.com/explore/tabs/trending';
  return url.replace('https://twitter.com/search', 'https://x.com/search');
}

async function fetchXEndpoint(endpoint, headers) {
  try {
    return await fetchWithTimeout(endpoint, { headers });
  } catch (error) {
    if (process.platform !== 'win32') {
      throw error;
    }

    return fetchJsonWithPowerShell(endpoint, headers);
  }
}

function normalizeXTrends(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.trends)) return payload.data.trends;
  if (Array.isArray(payload?.trends)) return payload.trends;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function sampleXTrends(region, message = '', sourceType = 'sample') {
  const rows = [
    ['#AIProducts', 325000, 'tech'],
    ['Open Source Security', 122000, 'tech'],
    ['Champions League Final', 890000, 'sports'],
    ['Global Markets', 211000, 'business'],
    ['New Movie Trailer', 456000, 'entertainment'],
    ['Climate Summit', 175000, 'world'],
    ['Productivity Apps', 94000, 'tech'],
    ['Space Launch', 266000, 'science']
  ];

  return rows.map(([title, heat, category], index) =>
    createTrend({
      platform: 'x',
      title,
      rank: index + 1,
      heat,
      url: `https://x.com/search?q=${encodeURIComponent(title)}`,
      region,
      category,
      tags: ['x', 'sample'],
      summary: 'Sample X trend shown until the official API is configured.',
      sourceType,
      sourceMessage: message
    })
  );
}

function stripTags(value = '') {
  return value.replace(/<[^>]+>/g, '');
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

function parseHeat(value = '') {
  const clean = String(value).replace(/[^\d]/g, '');
  return clean ? Number(clean) : null;
}

function inferCategory(title) {
  const value = title.toLowerCase();
  if (value.includes('ai') || value.includes('security') || value.includes('app')) return 'tech';
  if (value.includes('league') || value.includes('cup')) return 'sports';
  if (value.includes('market') || value.includes('stock')) return 'business';
  if (value.includes('movie') || value.includes('music')) return 'entertainment';
  return 'general';
}

function formatFetchError(error) {
  const cause = error.cause;
  const parts = [error.message];

  if (cause?.code) {
    parts.push(cause.code);
  }

  if (cause?.message && cause.message !== error.message) {
    parts.push(cause.message);
  }

  return parts.filter(Boolean).join(' / ');
}

module.exports = {
  fetchXTrends
};
