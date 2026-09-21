const { createTrend } = require('./shared');
const { requestJson } = require('./request');

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
  const endpoint = 'https://ads.tiktok.com/CreativeOne/KnowledgeAPI/GetHashtagList';
  const cookie = String(process.env.TIKTOK_COOKIE || '').trim();
  const headers = {
    'Content-Type': 'application/json',
    Referer: 'https://ads.tiktok.com/creative/creativeCenter/trends/hashtag',
    Origin: 'https://ads.tiktok.com'
  };
  if (cookie) headers.Cookie = cookie;
  if (cookie && process.env.TIKTOK_CSRF_TOKEN) headers['x-secsdk-csrf-token'] = process.env.TIKTOK_CSRF_TOKEN;

  try {
    const records = [];
    const seen = new Set();
    const pageSize = 20;
    for (let page = 1; page <= 50; page += 1) {
      const payload = await requestJson(endpoint, {
        method: 'POST', headers,
        body: JSON.stringify({ countryCode: country, timeRange: Number(period), page, limit: pageSize })
      }, Number(process.env.TIKTOK_TIMEOUT_MS || 8000));
      const rows = parseCreativeCenterHashtags(payload);
      if (cookie && page === 1 && rows.length <= 3) {
        throw new Error('TikTok 登录态未生效或权限不足，仍只返回预览条目；请更新本地 TIKTOK_COOKIE。');
      }
      const previousCount = records.length;
      for (const row of rows) {
        const key = row.hashtagName.trim().replace(/^#/, '').toLowerCase();
        if (!seen.has(key)) { seen.add(key); records.push(row); }
      }
      const pagination = payload.pagination || {};
      const total = Number(pagination.totalCount);
      const hasMore = typeof pagination.hasMore === 'boolean' ? pagination.hasMore
        : Number.isFinite(total) && total > 0 ? records.length < total : rows.length >= pageSize;
      if (!cookie || !hasMore) break;
      // Reject partial results instead of replacing the last complete cached chart.
      if (records.length === previousCount || page === 50) {
        throw new Error('TikTok 分页未能完整结束，已保留上次成功数据。');
      }
    }

    return records.map((item, index) => {
      const tag = item.hashtagName.trim().replace(/^#/, '');

      return createTrend({
        platform: 'tiktok',
        title: `#${tag}`,
        rank: Number(item.rankIndex || item.rank || index + 1),
        heat: Number(item.vv || item.videoViews || item.view_count || item.views) || null,
        url: `https://www.tiktok.com/tag/${encodeURIComponent(tag)}`,
        region: country || region,
        category: inferCategory(item.industryInfo?.value || tag),
        tags: ['tiktok', 'creative-center'],
        summary: `TikTok ${country} · ${period} days · ${Number(item.publishCnt) || 0} posts`,
        sourceType: 'public-api',
        sourceMessage: `TikTok Creative Center hashtags, country ${country}, period ${period} days; ${cookie ? 'authenticated chart' : 'public preview'} (${records.length} entries).`
      });
    });
  } catch (error) {
    throw new Error(`TikTok Creative Center: ${formatFetchError(error)}`);
  }
}

function parseCreativeCenterHashtags(payload) {
  if (Number(payload?.BaseResp?.StatusCode) !== 0) throw new Error('Hashtag API returned an unsuccessful response.');
  const seen = new Set();
  const rows = (Array.isArray(payload.items) ? payload.items : []).filter((item) => {
    const name = typeof item?.hashtagName === 'string' ? item.hashtagName.trim().toLowerCase() : '';
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
  if (!rows.length) throw new Error('Hashtag API returned no hashtags.');
  return rows;
}

async function fetchCustomTikTokSource(region) {
  const url = process.env.TIKTOK_TRENDS_URL;

  if (!url) {
    throw new Error('TikTok custom source requires TIKTOK_TRENDS_URL.');
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

    const payload = await requestJson(url, { headers });
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
    throw new Error(`TikTok custom source: ${formatFetchError(error)}`);
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
  fetchTikTokTrends,
  parseCreativeCenterHashtags
};
