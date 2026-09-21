const { createTrend } = require('./shared');
const { requestJson } = require('./request');
const { readSourceCache } = require('../services/store');

const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
let memoryItems = [];
let pending = null;

function parseImdbFeed(payload, region = 'global') {
  if (payload && Object.hasOwn(payload, 'statusCode')) {
    if (Number(payload.statusCode) !== 200) throw new Error(`IMDb 数据服务请求失败（${payload.statusCode}）`);
    payload = typeof payload.body === 'string' ? JSON.parse(payload.body) : payload.body;
  }
  if (payload?.type !== 'IMDb MOVIEmeter') throw new Error('IMDb 数据服务返回了错误的榜单类型');
  const rows = payload.data || payload.trends;
  if (!Array.isArray(rows)) throw new Error('IMDb 数据服务未返回榜单');
  const stamp = payload.as_of_ts || payload.timestamp;
  const sourceUpdatedAt = Number.isFinite(Date.parse(stamp)) ? new Date(stamp).toISOString() : null;
  const seen = new Set();
  const items = rows.flatMap((row) => {
    const rank = Number(Array.isArray(row) ? row[0] : row?.rank);
    const title = Array.isArray(row) ? row[1] : row?.title;
    if (!Number.isInteger(rank) || rank < 1 || rank > 10 || typeof title !== 'string' || !title.trim() || seen.has(rank)) return [];
    seen.add(rank);
    return [{ ...createTrend({
      platform: 'imdb_movie', title: title.trim(), rank, region,
      url: `https://www.imdb.com/find/?q=${encodeURIComponent(title.trim())}&s=tt`,
      category: 'entertainment', tags: ['imdb', 'movie', 'trends-api'],
      summary: `IMDb 电影人气榜第 ${rank} 名`,
      sourceType: 'public-api',
      sourceMessage: `IMDb MOVIEmeter via Trends API (free top 10).${sourceUpdatedAt ? ` Source timestamp: ${sourceUpdatedAt}.` : ''}`
    }), sourceUpdatedAt }];
  }).sort((a, b) => a.rank - b.rank);
  if (!items.length) throw new Error('IMDb 数据服务返回了空榜单');
  return items;
}

function isFreshImdbCache(items, region, now = Date.now()) {
  return Array.isArray(items) && items.length > 0 && items.every((item) => {
    const age = now - Date.parse(item.capturedAt);
    return item.region === region && item.tags?.includes('trends-api') && age >= 0 && age < CACHE_MS;
  });
}

async function loadMovieFeed(region) {
  const stored = (await readSourceCache()).imdb_movie?.items;
  if (isFreshImdbCache(stored, region)) return stored;
  const key = String(process.env.TRENDS_API_KEY || '').trim();
  if (!key) throw new Error('IMDb 免费电影榜尚未配置 TRENDS_API_KEY');
  const payload = await requestJson('https://api.trendsapi.ai/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ mode: 'get_top_trends', type: 'IMDb MOVIEmeter', limit: 10 })
  }, 65000);
  return parseImdbFeed(payload, region);
}

async function fetchImdbMovieTrends({ region = 'global' } = {}) {
  if (isFreshImdbCache(memoryItems, region)) return memoryItems;
  if (pending) await pending;
  if (isFreshImdbCache(memoryItems, region)) return memoryItems;
  pending = loadMovieFeed(region).then((items) => { memoryItems = items; return items; });
  try { return await pending; } finally { pending = null; }
}

module.exports = { fetchImdbMovieTrends, parseImdbFeed, isFreshImdbCache };
