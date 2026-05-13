const { createTrend, fetchJsonWithPowerShell, fetchWithTimeout } = require('./shared');

async function fetchRedditTrends({ region = 'global' } = {}) {
  const subreddit = normalizeSubreddit(process.env.REDDIT_SUBREDDIT || 'popular');
  const sort = normalizeSort(process.env.REDDIT_SORT || 'hot');
  const limit = Math.min(50, Math.max(1, Number(process.env.REDDIT_LIMIT || 30)));
  const endpoint = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/${sort}.json?limit=${limit}&raw_json=1`;

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
    return sampleRedditTrends(region, `Reddit fallback: ${formatFetchError(error)}`, 'sample-fallback');
  }
}

async function fetchRedditPayload(endpoint, subreddit, sort) {
  const source = String(process.env.REDDIT_SOURCE || 'proxy-first').toLowerCase();
  const candidates = source === 'direct'
    ? [directRedditSource(endpoint, subreddit, sort)]
    : source === 'proxy'
      ? codeTabsSources(endpoint, subreddit, sort)
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
        payload: await fetchJsonWithRetry(proxyUrl, 3, 30000),
        sourceMessage: `Reddit public JSON feed via CodeTabs proxy: r/${subreddit}/${sort}.`
      };
    }
  };
}

function directRedditSource(endpoint, subreddit, sort) {
  return {
    label: 'Reddit direct',
    async run() {
      const response = await fetchRedditEndpoint(endpoint, 8000);

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

function sampleRedditTrends(region, message = '', sourceType = 'sample') {
  const rows = [
    ['AI tools people actually use at work', 182000, 'technology', 'tech'],
    ['What movie scene still gives you chills?', 149000, 'movies', 'entertainment'],
    ['A tiny indie game suddenly breaks out', 112000, 'gaming', 'gaming'],
    ['Personal finance habits that changed your year', 88000, 'personalfinance', 'finance'],
    ['New telescope image discussion thread', 76000, 'space', 'science'],
    ['Travelers share underrated city tips', 65000, 'travel', 'travel'],
    ['Today I learned a strange history fact', 62000, 'todayilearned', 'education'],
    ['Simple recipe thread taking over the weekend', 51000, 'food', 'food']
  ];

  return rows.map(([title, heat, subreddit, category], index) =>
    createTrend({
      platform: 'reddit',
      title,
      rank: index + 1,
      heat,
      url: `https://www.reddit.com/r/${subreddit}/`,
      region,
      category,
      tags: ['reddit', `r/${subreddit}`, 'sample'],
      summary: `r/${subreddit}`,
      sourceType,
      sourceMessage: message
    })
  );
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
  fetchRedditTrends
};
