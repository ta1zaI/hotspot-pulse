const { createTrend, fetchJsonWithPowerShell, fetchWithTimeout } = require('./shared');
const { requestText } = require('./request');
const { XMLParser, XMLValidator } = require('fast-xml-parser');

async function fetchRedditTrends({ region = 'global' } = {}) {
  if (process.env.REDDIT_TRENDS_URL) {
    return fetchCustomRedditSource(region);
  }

  const subreddit = normalizeSubreddit(process.env.REDDIT_SUBREDDIT || 'popular');
  const sort = normalizeSort(process.env.REDDIT_SORT || 'hot');
  const limit = Math.min(50, Math.max(1, Number(process.env.REDDIT_LIMIT || 30)));
  const endpoint = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/${sort}.json?limit=${limit}&raw_json=1`;

  if (!process.env.REDDIT_SOURCE || process.env.REDDIT_SOURCE === 'rss') {
    return fetchRedditRss({ region, subreddit, sort, limit });
  }

  try {
    const { payload, sourceMessage } = await fetchRedditPayload(endpoint, subreddit, sort);
    const rows = normalizeRedditPosts(payload);

    if (!rows.length) {
      throw new Error('Reddit response did not include post rows.');
    }

    return rows.slice(0, limit).map((post, index) => {
      const title = post.title || `Reddit post ${index + 1}`;
      const subredditName = post.subreddit_name_prefixed || `r/${post.subreddit || subreddit}`;

      return createTrend({
        platform: 'reddit',
        title,
        rank: index + 1,
        heat: Number(post.ups || post.score || 0) + Number(post.num_comments || 0),
        url: post.permalink ? `https://www.reddit.com${post.permalink}` : `https://www.reddit.com/r/${subreddit}/`,
        region,
        category: inferCategory(`${title} ${post.subreddit || ''}`),
        tags: ['reddit', subredditName, sort],
        summary: [
          subredditName,
          post.ups || post.score ? `${formatCount(post.ups || post.score)} upvotes` : '',
          post.num_comments ? `${formatCount(post.num_comments)} comments` : ''
        ]
          .filter(Boolean)
          .join(' · '),
        sourceType: 'public-api',
        sourceMessage
      });
    });
  } catch (error) {
    return fetchRedditRss({ region, subreddit, sort, limit });
  }
}

async function fetchRedditRss({ region, subreddit, sort, limit }) {
  const feeds = [{ subreddit, sort, period: 'day' }];
  if (subreddit === 'popular') feeds.push({ subreddit: 'all', sort: 'top', period: 'day' });
  const errors = [];
  for (const feed of feeds) {
    const url = `https://www.reddit.com/r/${encodeURIComponent(feed.subreddit)}/${feed.sort}.rss?t=${feed.period}&limit=${limit}`;
    try {
      const xml = await requestText(url, { headers: { 'User-Agent': 'HotspotPulse/0.1' } });
      return parseRedditRss(xml, { region, limit, feed });
    } catch (error) { errors.push(`${feed.subreddit}/${feed.sort}: ${error.message}`); }
  }
  throw new Error(`Reddit RSS unavailable: ${errors.join('; ')}`);
}

function parseRedditRss(xml, { region = 'global', limit = 30, feed = { subreddit: 'all', sort: 'top', period: 'day' } } = {}) {
  if (XMLValidator.validate(xml) !== true) throw new Error('Reddit returned invalid RSS.');
  const payload = new XMLParser({ ignoreAttributes: false, parseTagValue: false }).parse(xml);
  const entries = payload.feed?.entry;
  const rows = Array.isArray(entries) ? entries : entries ? [entries] : [];
  const seen = new Set();
  const items = rows.flatMap((entry) => {
    const title = typeof entry.title === 'string' ? entry.title : entry.title?.['#text'];
    const links = Array.isArray(entry.link) ? entry.link : [entry.link];
    const link = links.find((link) => link?.['@_href'] && (!link['@_rel'] || link['@_rel'] === 'alternate'))?.['@_href'];
    let url;
    try { url = new URL(link); } catch { return []; }
    if (!title || url.protocol !== 'https:' || !['www.reddit.com', 'reddit.com', 'old.reddit.com'].includes(url.hostname) || !url.pathname.includes('/comments/') || seen.has(url.href)) return [];
    seen.add(url.href);
    const community = entry.category?.['@_label'] || `r/${feed.subreddit}`;
    return [createTrend({
      platform: 'reddit', title, rank: seen.size, heat: null, url: url.href, region,
      category: inferCategory(`${title} ${community}`), tags: ['reddit', community, feed.sort, 'rss'],
      summary: `${community} · ${feed.sort}${feed.sort === 'top' ? ` / ${feed.period}` : ''}`,
      sourceType: 'rss',
      sourceMessage: `Reddit public RSS: r/${feed.subreddit}/${feed.sort}${feed.sort === 'top' ? ` (${feed.period})` : ''}; ordered as published, scores unavailable.`
    })];
  }).slice(0, limit);
  if (!items.length) throw new Error('Reddit RSS returned no posts.');
  return items;
}

async function fetchCustomRedditSource(region) {
  const endpoint = process.env.REDDIT_TRENDS_URL;

  try {
    const headers = { Accept: 'application/json' };
    if (process.env.REDDIT_TRENDS_BEARER_TOKEN) {
      headers.Authorization = `Bearer ${process.env.REDDIT_TRENDS_BEARER_TOKEN}`;
    }
    if (process.env.REDDIT_TRENDS_API_KEY) {
      headers[process.env.REDDIT_TRENDS_API_KEY_HEADER || 'X-API-Key'] = process.env.REDDIT_TRENDS_API_KEY;
    }

    const response = await fetchWithTimeout(endpoint, { headers }, Number(process.env.REDDIT_DIRECT_TIMEOUT_MS || 6000));
    if (!response.ok) {
      throw new Error(`Reddit custom source failed with ${response.status}`);
    }

    const payload = await response.json();
    const rows = normalizeCustomRows(payload);
    if (!rows.length) {
      throw new Error('Reddit custom source returned no rows.');
    }

    return rows.slice(0, 50).map((item, index) => {
      const title = item.title || item.name || item.text || `Reddit post ${index + 1}`;
      const subredditName = item.subreddit || item.community || item.source || 'reddit';

      return createTrend({
        platform: 'reddit',
        title,
        rank: Number(item.rank || item.position || index + 1),
        heat: Number(item.heat || item.score || item.ups || item.num_comments || 0) || null,
        url: item.url || item.permalink || 'https://www.reddit.com/',
        region: item.region || region,
        category: item.category || inferCategory(`${title} ${subredditName}`),
        tags: ['reddit', subredditName, 'custom-json'],
        summary: item.summary || subredditName,
        sourceType: 'custom-json',
        sourceMessage: `Reddit connected through REDDIT_TRENDS_URL: ${endpoint}.`
      });
    });
  } catch (error) {
    throw new Error(`Reddit custom source failed: ${formatFetchError(error)}`);
  }
}

async function fetchRedditPayload(endpoint, subreddit, sort) {
  const source = String(process.env.REDDIT_SOURCE || 'direct').toLowerCase();
  const candidates = source === 'direct'
    ? [directRedditSource(endpoint, subreddit, sort)]
    : source === 'proxy'
      ? codeTabsSources(endpoint, subreddit, sort)
      : source === 'direct-first'
        ? [directRedditSource(endpoint, subreddit, sort), ...codeTabsSources(endpoint, subreddit, sort)]
      : [...codeTabsSources(endpoint, subreddit, sort), directRedditSource(endpoint, subreddit, sort)];
  const errors = [];

  for (const candidate of candidates) {
    try {
      return await candidate.run();
    } catch (error) {
      errors.push(`${candidate.label}: ${formatFetchError(error)}`);
    }
  }

  throw new Error(errors.join(' | '));
}

function codeTabsSources(endpoint, subreddit, sort) {
  if (process.env.REDDIT_PROXY_URL) {
    return [codeTabsSource(process.env.REDDIT_PROXY_URL, subreddit, sort, 'configured proxy')];
  }

  return [
    codeTabsSource(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(endpoint)}`, subreddit, sort, 'encoded proxy'),
    codeTabsSource(`https://api.codetabs.com/v1/proxy?quest=${endpoint}`, subreddit, sort, 'raw proxy')
  ];
}

function codeTabsSource(proxyUrl, subreddit, sort, label) {
  return {
    label: `CodeTabs ${label}`,
    async run() {
      return {
        payload: await fetchJsonWithRetry(
          proxyUrl,
          Number(process.env.REDDIT_PROXY_ATTEMPTS || 1),
          Number(process.env.REDDIT_PROXY_TIMEOUT_MS || 8000)
        ),
        sourceMessage: `Reddit public JSON feed via CodeTabs proxy: r/${subreddit}/${sort}.`
      };
    }
  };
}

function directRedditSource(endpoint, subreddit, sort) {
  return {
    label: 'Reddit direct',
    async run() {
      const response = await fetchRedditEndpoint(endpoint, Number(process.env.REDDIT_DIRECT_TIMEOUT_MS || 6000));

      if (!response.ok) {
        throw new Error(`Reddit request failed with ${response.status}`);
      }

      return {
        payload: await response.json(),
        sourceMessage: `Reddit public JSON feed: r/${subreddit}/${sort}.`
      };
    }
  };
}

async function fetchRedditEndpoint(endpoint, timeoutMs) {
  const headers = {
    Accept: 'application/json',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36 HotspotPulse/0.1'
  };

  try {
    return await fetchWithTimeout(endpoint, { headers }, timeoutMs);
  } catch (error) {
    if (process.platform !== 'win32') {
      throw error;
    }

    return fetchJsonWithPowerShell(endpoint, headers);
  }
}

async function fetchJsonWithRetry(endpoint, attempts, timeoutMs) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchRedditEndpoint(endpoint, timeoutMs);

      if (!response.ok) {
        throw new Error(`Reddit proxy request failed with ${response.status}`);
      }

      const text = await response.text();
      if (!text.trim()) {
        throw new Error('Reddit proxy returned an empty response');
      }

      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await delay(600 * attempt);
      }
    }
  }

  throw lastError;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeRedditPosts(payload) {
  const children = payload?.data?.children;
  if (!Array.isArray(children)) return [];
  return children.map((child) => child?.data).filter(Boolean);
}

function normalizeCustomRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.posts)) return payload.posts;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.trends)) return payload.trends;
  return [];
}

function normalizeSubreddit(value) {
  return String(value || 'popular')
    .trim()
    .replace(/^\/?r\//i, '')
    .replace(/[^a-z0-9_+-]/gi, '') || 'popular';
}

function normalizeSort(value) {
  const sort = String(value || 'hot').toLowerCase();
  return ['hot', 'top', 'new', 'rising'].includes(sort) ? sort : 'hot';
}

function inferCategory(value = '') {
  const text = String(value).toLowerCase();
  if (/ai|tech|software|programming|privacy|security|iphone|android|gadget/.test(text)) return 'tech';
  if (/movie|film|music|television|tv|celebrity|trailer/.test(text)) return 'entertainment';
  if (/game|gaming|nintendo|steam|xbox|playstation/.test(text)) return 'gaming';
  if (/finance|stock|market|money|business|economy/.test(text)) return 'finance';
  if (/sport|nba|nfl|soccer|football|baseball|hockey/.test(text)) return 'sports';
  if (/space|science|climate|biology|physics/.test(text)) return 'science';
  if (/travel|city|hotel|flight/.test(text)) return 'travel';
  if (/food|recipe|cooking|restaurant/.test(text)) return 'food';
  if (/health|fitness|doctor|medical/.test(text)) return 'health';
  if (/school|learn|todayilearned|education/.test(text)) return 'education';
  if (/news|world|politics|government|election/.test(text)) return 'politics';
  return 'general';
}

function formatCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  if (number >= 1000000) return `${(number / 1000000).toFixed(1)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(1)}K`;
  return String(number);
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
  fetchRedditTrends,
  parseRedditRss
};
