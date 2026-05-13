const { createTrend, fetchJsonWithPowerShell, fetchWithTimeout } = require('./shared');

async function fetchTikTokTrends({ region = 'global' } = {}) {
  const source = (process.env.TIKTOK_SOURCE || 'creative-center').toLowerCase();

  if (source === 'custom-json' || process.env.TIKTOK_TRENDS_URL) {
    return fetchCustomTikTokSource(region);
  }

  return fetchCreativeCenter(region);
}

async function fetchCreativeCenter(region) {
  const country = process.env.TIKTOK_CREATIVE_CENTER_COUNTRY || 'US';
  const period = process.env.TIKTOK_CREATIVE_CENTER_PERIOD || '7';
  const endpoint = `https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en?countryCode=${encodeURIComponent(country)}&period=${encodeURIComponent(period)}`;

  try {
    const response = await fetchTikTokPage(endpoint);

    if (!response.ok) {
      throw new Error(`TikTok Creative Center failed with ${response.status}`);
    }

    const html = await response.text();
    const records = parseCreativeCenterHashtags(html);

    if (!records.length) {
      throw new Error('TikTok Creative Center page loaded, but no hashtag rows were found.');
    }

    return records.slice(0, 30).map((item, index) => {
      const hashtag = item.hashtagName || item.hashtag_name || item.name || `tiktoktrend${index + 1}`;
      const tag = hashtag.replace(/^#/, '');

      return createTrend({
        platform: 'tiktok',
        title: `#${tag}`,
        rank: Number(item.rank || index + 1),
        heat: Number(item.videoViews || item.view_count || item.views || item.publishCnt) || null,
        url: `https://www.tiktok.com/tag/${encodeURIComponent(tag)}`,
        region: country || region,
        category: inferCategory(item.industryInfo?.value || tag),
        tags: ['tiktok', 'creative-center'],
        summary: 'TikTok hashtag trend collected from Creative Center public page data.',
        sourceType: 'public-page',
        sourceMessage: `TikTok Creative Center hashtags, country ${country}, period ${period} days.`
      });
    });
  } catch (error) {
    return sampleTikTokTrends(region, `TikTok Creative Center fallback: ${formatFetchError(error)}`, 'sample-fallback');
  }
}

async function fetchTikTokPage(endpoint) {
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

function parseCreativeCenterHashtags(html) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return [];

  const payload = JSON.parse(decodeHtml(match[1]));
  const arrays = [];
  collectArrays(payload, arrays);

  return (
    arrays.find((array) =>
      array.some((item) => item && typeof item === 'object' && (item.hashtagName || item.hashtag_name || item.hashtagId))
    ) || []
  );
}

function collectArrays(value, arrays) {
  if (!value || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    arrays.push(value);
    value.forEach((item) => collectArrays(item, arrays));
    return;
  }

  Object.values(value).forEach((item) => collectArrays(item, arrays));
}

async function fetchCustomTikTokSource(region) {
  const url = process.env.TIKTOK_TRENDS_URL;

  if (!url) {
    return sampleTikTokTrends(
      region,
      'Set TIKTOK_TRENDS_URL in .env to connect a compliant TikTok data provider or your own collector.'
    );
  }

  try {
    const headers = {
      Accept: 'application/json'
    };

    if (process.env.TIKTOK_TRENDS_BEARER_TOKEN) {
      headers.Authorization = `Bearer ${process.env.TIKTOK_TRENDS_BEARER_TOKEN}`;
    }

    if (process.env.TIKTOK_TRENDS_API_KEY) {
      headers[process.env.TIKTOK_TRENDS_API_KEY_HEADER || 'X-API-Key'] =
        process.env.TIKTOK_TRENDS_API_KEY;
    }

    const response = await fetchWithTimeout(url, { headers });

    if (!response.ok) {
      throw new Error(`TikTok trend source failed with ${response.status}`);
    }

    const payload = await response.json();
    const records = normalizeTrendRecords(payload);

    if (!records.length) {
      throw new Error('TikTok trend source returned no trend rows.');
    }

    return records.slice(0, 30).map((item, index) => {
      const title =
        item.title ||
        item.name ||
        item.hashtag_name ||
        item.hashtag ||
        item.keyword ||
        `TikTok trend ${index + 1}`;

      return createTrend({
        platform: 'tiktok',
        title,
        rank: Number(item.rank || item.position || index + 1),
        heat:
          Number(item.heat || item.score || item.view_count || item.views || item.post_count || item.posts) ||
          null,
        url: item.url || `https://www.tiktok.com/search?q=${encodeURIComponent(title)}`,
        region: item.region || region,
        category: item.category || inferCategory(title),
        tags: ['tiktok', 'custom-json'],
        summary: item.summary || 'TikTok trend from configured JSON source.',
        sourceType: 'custom-json',
        sourceMessage: 'TikTok connected through TIKTOK_TRENDS_URL.'
      });
    });
  } catch (error) {
    return sampleTikTokTrends(region, `TikTok fallback: ${formatFetchError(error)}`, 'sample-fallback');
  }
}

function normalizeTrendRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.trends)) return payload.trends;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.hashtags)) return payload.hashtags;
  return [];
}

function sampleTikTokTrends(region, message = '', sourceType = 'sample') {
  const rows = [
    ['#DeskSetup', 1580000, 'lifestyle'],
    ['AI Avatar Workflow', 1264000, 'tech'],
    ['Summer Travel Hack', 984000, 'travel'],
    ['Indie Game Clip', 802000, 'gaming'],
    ['Creator Economy Tips', 744000, 'business'],
    ['Street Food Map', 692000, 'food'],
    ['Workout Reset', 588000, 'health'],
    ['Micro Drama Edit', 533000, 'entertainment']
  ];

  return rows.map(([title, heat, category], index) =>
    createTrend({
      platform: 'tiktok',
      title,
      rank: index + 1,
      heat,
      url: `https://www.tiktok.com/search?q=${encodeURIComponent(title)}`,
      region,
      category,
      tags: ['tiktok', 'sample'],
      summary: 'Sample TikTok trend shown until a public or custom source is configured.',
      sourceType,
      sourceMessage: message
    })
  );
}

function inferCategory(value = '') {
  const text = String(value).toLowerCase();
  if (text.includes('ai') || text.includes('workflow') || text.includes('app') || text.includes('tech')) return 'tech';
  if (text.includes('travel')) return 'travel';
  if (text.includes('food')) return 'food';
  if (text.includes('game')) return 'gaming';
  if (text.includes('sport') || text.includes('outdoor') || text.includes('fifa')) return 'sports';
  if (text.includes('baby') || text.includes('kids') || text.includes('maternity')) return 'lifestyle';
  if (text.includes('workout') || text.includes('health')) return 'health';
  return 'entertainment';
}

function decodeHtml(value = '') {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
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
  fetchTikTokTrends
};
