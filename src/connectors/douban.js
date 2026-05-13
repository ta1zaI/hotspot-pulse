const { createTrend, fetchWithTimeout } = require('./shared');

const DEFAULT_NOWPLAYING_CITIES = [
  'beijing',
  'shanghai',
  'guangzhou',
  'shenzhen',
  'chengdu',
  'hangzhou',
  'wuhan',
  'nanjing'
];

async function fetchDoubanMovieTrends({ region = 'cn' } = {}) {
  return fetchDoubanSubjects({
    platform: 'douban_movie',
    region,
    type: 'movie',
    tag: '热门',
    sourceMessage: 'Douban public movie search subjects API.'
  });
}

async function fetchDoubanNowPlayingTrends({ region = 'cn' } = {}) {
  const cities = nowPlayingCities();
  const settled = await Promise.allSettled(cities.map(fetchNowPlayingCity));
  const cityItems = settled
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value);

  if (!cityItems.length) {
    const error = settled.find((result) => result.status === 'rejected')?.reason;
    throw error || new Error('Douban nowplaying request returned no items');
  }

  const items = mergeNowPlayingItems(cityItems);

  return items.map((item, index) =>
    createTrend({
      platform: 'douban_nowplaying',
      title: item.title,
      rank: index + 1,
      heat: Number(item.voteCount) || parseRate(item.score),
      url: item.subjectId
        ? `https://movie.douban.com/subject/${item.subjectId}/`
        : 'https://movie.douban.com/cinema/nowplaying/',
      region,
      category: 'entertainment',
      tags: ['douban', 'movie', 'nowplaying', ...item.cities],
      summary: [
        item.score && item.score !== '0' ? `豆瓣评分 ${item.score}` : '',
        `覆盖 ${item.cityCount} 城`,
        item.release ? `${item.release} 上映` : '',
        item.duration || '',
        item.region || ''
      ]
        .filter(Boolean)
        .join(' · '),
      sourceType: 'public-page',
      sourceMessage:
        cities.length > 1
          ? `Douban public nowplaying pages, ${cities.length} cities merged.`
          : `Douban public nowplaying page, city ${cities[0]}.`
    })
  );
}

async function fetchNowPlayingCity(city) {
  const endpoint = `https://movie.douban.com/cinema/nowplaying/${encodeURIComponent(city)}/`;
  const response = await fetchWithTimeout(
    endpoint,
    {
      headers: {
        Accept: 'text/html',
        Referer: 'https://movie.douban.com/cinema/nowplaying/',
        'User-Agent': 'Mozilla/5.0'
      }
    },
    15000
  );

  if (!response.ok) {
    throw new Error(`Douban nowplaying request failed with ${response.status}`);
  }

  const html = await response.text();
  return parseNowPlayingItems(html).map((item) => ({ ...item, city }));
}

async function fetchDoubanTvTrends({ region = 'cn' } = {}) {
  const tags = ['热门', '国产剧', '美剧', '韩剧', '日剧'];
  const seen = new Set();
  const items = [];

  for (const tag of tags) {
    const rows = await fetchDoubanSubjects({
      platform: 'douban_tv',
      region,
      type: 'tv',
      tag,
      limit: 10,
      sourceMessage: `Douban public TV search subjects API, tag ${tag}.`
    });

    for (const item of rows) {
      const key = normalizeKey(item.title);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ ...item, rank: items.length + 1 });
      if (items.length >= 30) return items;
    }
  }

  return items;
}

async function fetchDoubanSubjects({
  platform,
  region,
  type,
  tag,
  limit = 30,
  sourceMessage
}) {
  const endpoint = `https://movie.douban.com/j/search_subjects?type=${encodeURIComponent(type)}&tag=${encodeURIComponent(tag)}&sort=recommend&page_limit=${limit}&page_start=0`;
  const response = await fetchWithTimeout(
    endpoint,
    {
      headers: {
        Accept: 'application/json',
        Referer: type === 'tv' ? 'https://movie.douban.com/tv/' : 'https://movie.douban.com/explore',
        'User-Agent': 'Mozilla/5.0'
      }
    },
    15000
  );

  if (!response.ok) {
    throw new Error(`Douban ${type} request failed with ${response.status}`);
  }

  const payload = await response.json();
  const rows = Array.isArray(payload.subjects) ? payload.subjects : [];

  return rows.map((item, index) =>
    createTrend({
      platform,
      title: item.title,
      rank: index + 1,
      heat: parseRate(item.rate),
      url: item.url,
      region,
      category: 'entertainment',
      tags: ['douban', type],
      summary: [
        item.rate ? `豆瓣评分 ${item.rate}` : '',
        item.is_new ? '新上榜' : ''
      ]
        .filter(Boolean)
        .join(' · '),
      sourceType: 'public-api',
      sourceMessage
    })
  );
}

function parseRate(rate) {
  const value = Number(rate);
  return Number.isFinite(value) ? Math.round(value * 1000) : null;
}

function parseNowPlayingItems(html) {
  const rows = [];
  const itemPattern = /<li\b(?=[^>]*class="list-item")(?=[^>]*data-category="nowplaying")([\s\S]*?)>/g;
  let match;

  while ((match = itemPattern.exec(html))) {
    const attrs = parseAttributes(match[1]);
    const title = attrs['data-title'];
    if (!title) continue;

    rows.push({
      title,
      score: attrs['data-score'],
      release: attrs['data-release'],
      duration: attrs['data-duration'],
      region: attrs['data-region'],
      voteCount: attrs['data-votecount'],
      subjectId: attrs['data-subject'] || attrs.id
    });
  }

  return rows.slice(0, 30);
}

function mergeNowPlayingItems(items) {
  const groups = new Map();

  for (const item of items) {
    const key = item.subjectId || normalizeKey(item.title);
    const current = groups.get(key) || {
      ...item,
      cities: [],
      cityCount: 0
    };

    if (!current.cities.includes(item.city)) {
      current.cities.push(item.city);
      current.cityCount += 1;
    }

    if (Number(item.voteCount) > Number(current.voteCount || 0)) {
      current.voteCount = item.voteCount;
    }

    if (Number(item.score) > Number(current.score || 0)) {
      current.score = item.score;
    }

    groups.set(key, current);
  }

  return [...groups.values()]
    .sort((a, b) => {
      const cityDelta = b.cityCount - a.cityCount;
      if (cityDelta) return cityDelta;
      return Number(b.voteCount || 0) - Number(a.voteCount || 0);
    })
    .slice(0, 30);
}

function nowPlayingCities() {
  const configured = process.env.DOUBAN_NOWPLAYING_CITIES || process.env.DOUBAN_NOWPLAYING_CITY;
  if (!configured || configured === 'all') return DEFAULT_NOWPLAYING_CITIES;

  const cities = configured
    .split(',')
    .map((city) => city.trim())
    .filter(Boolean);

  return cities.length ? cities : DEFAULT_NOWPLAYING_CITIES;
}

function parseAttributes(value) {
  const attrs = {};
  const attrPattern = /([\w-]+)="([^"]*)"/g;
  let match;

  while ((match = attrPattern.exec(value))) {
    attrs[match[1]] = decodeHtml(match[2]);
  }

  return attrs;
}

function decodeHtml(value) {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizeKey(value) {
  return String(value).toLowerCase().replace(/\s+/g, '');
}

module.exports = {
  fetchDoubanMovieTrends,
  fetchDoubanNowPlayingTrends,
  fetchDoubanTvTrends
};
