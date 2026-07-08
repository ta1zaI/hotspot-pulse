const { createTrend, fetchWithTimeout } = require('./shared');

async function fetchWeiboTrends({ region = 'cn' } = {}) {
  const source = (process.env.WEIBO_SOURCE || 'ajax-first').toLowerCase();

  if (source === 'ajax' || source === 'ajax-first') {
    const ajaxItems = await fetchAjaxWeiboHot(region);
    if (ajaxItems.length) return ajaxItems;
  }

  if (source === 'official' || source === 'official-first' || process.env.WEIBO_COOKIE) {
    const officialItems = await fetchOfficialWeiboPage(region);
    if (officialItems.length) return officialItems;
  }

  if (source === 'official-first') {
    const ajaxItems = await fetchAjaxWeiboHot(region);
    if (ajaxItems.length) return ajaxItems;
  }

  if (source !== 'official') {
    return fetchFreeWeiboHot(region);
  }

  return sampleWeiboTrends(
    region,
    'Official Weibo source did not return rows. Add or refresh WEIBO_COOKIE, or use WEIBO_SOURCE=official-first for free-api fallback.',
    'sample-fallback'
  );
}

async function fetchAjaxWeiboHot(region) {
  const endpoint = process.env.WEIBO_AJAX_URL || 'https://weibo.com/ajax/side/hotSearch';

  try {
    const response = await fetchWithTimeout(
      endpoint,
      {
        headers: {
          Accept: 'application/json,text/plain,*/*',
          Referer: 'https://weibo.com/',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'
        }
      },
      15000
    );

    if (!response.ok) {
      throw new Error(`Weibo ajax hot-search source failed with ${response.status}`);
    }

    const payload = await response.json();
    const rows = normalizeAjaxWeiboRows(payload);

    if (!rows.length) {
      throw new Error('Weibo ajax hot-search source returned no rows.');
    }

    return rows
      .filter((item) => Number(item.realpos) > 0)
      .slice(0, 50)
      .map((item, index) => {
        const title = cleanWeiboTitle(item.note || item.word || item.word_scheme || `Weibo trend ${index + 1}`);

        return createTrend({
          platform: 'weibo',
          title,
          rank: Number(item.realpos || item.rank || index + 1),
          heat: parseHeat(item.num || item.desc_extr || item.raw_hot),
          url: item.url || weiboMobileSearchUrl(title),
          region,
          category: inferCategory(title),
          tags: ['weibo', 'ajax-hot-search'],
          summary: 'Weibo hot-search row collected from the public ajax JSON endpoint.',
          sourceType: 'public-api',
          sourceMessage: `Weibo public ajax hot-search source: ${endpoint}.`
        });
      });
  } catch {
    return [];
  }
}

async function fetchFreeWeiboHot(region) {
  const endpoint = process.env.WEIBO_FREE_API_URL || 'https://api.52vmy.cn/api/wl/hot?type=weibo';

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
      throw new Error(`Free Weibo source failed with ${response.status}`);
    }

    const payload = await response.json();
    const rows = normalizeFreeWeiboRows(payload);

    if (!rows.length) {
      throw new Error('Free Weibo source returned no rows.');
    }

    return rows.slice(0, 50).map((item, index) => {
      const title = item.title || item.name || item.word || `Weibo trend ${index + 1}`;

      return createTrend({
        platform: 'weibo',
        title,
        rank: Number(item.index || item.rank || index + 1),
        heat: parseHeat(item.hot || item.heat || item.num || item.score),
        url: weiboMobileSearchUrl(title),
        region,
        category: inferCategory(title),
        tags: ['weibo', 'free-api'],
        summary: 'Weibo hot-search row collected from a free public JSON source.',
        sourceType: 'public-api',
        sourceMessage: `Free public Weibo source: ${endpoint}.`
      });
    });
  } catch (error) {
    return sampleWeiboTrends(region, `Free Weibo fallback: ${formatFetchError(error)}`, 'sample-fallback');
  }
}

async function fetchOfficialWeiboPage(region) {
  try {
    const headers = {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'
    };

    if (process.env.WEIBO_COOKIE) {
      headers.Cookie = process.env.WEIBO_COOKIE;
    }

    const response = await fetchWithTimeout('https://s.weibo.com/top/summary?cate=realtimehot', { headers });
    if (!response.ok) {
      throw new Error(`Weibo hot search request failed with ${response.status}`);
    }

    const html = await decodeWeiboHtml(response);
    const matches = [
      ...html.matchAll(/<td class="td-02">[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?(?:<span>(.*?)<\/span>)?/g)
    ];

    return matches
      .slice(0, 60)
      .map((match, index) => {
        const title = decodeHtml(stripTags(match[2])).trim();
        return createTrend({
          platform: 'weibo',
          title,
          rank: index + 1,
          heat: parseHeat(match[3]),
          url: weiboMobileSearchUrl(title),
          region,
          category: inferCategory(title),
          tags: ['weibo', 'hot-search'],
          summary: 'Weibo realtime hot-search row.',
          sourceType: 'public-page',
          sourceMessage: process.env.WEIBO_COOKIE
            ? 'Weibo public hot-search page with configured cookie.'
            : 'Weibo public hot-search page.'
        });
      })
      .filter((item) => item.title)
      .slice(0, 50);
  } catch {
    return [];
  }
}

function normalizeFreeWeiboRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.list)) return payload.data.list;
  if (Array.isArray(payload?.list)) return payload.list;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

function normalizeAjaxWeiboRows(payload) {
  const realtime = payload?.data?.realtime;
  if (Array.isArray(realtime)) return realtime;
  if (Array.isArray(payload?.data?.band_list)) return payload.data.band_list;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

async function decodeWeiboHtml(response) {
  const buffer = await response.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  const gb18030 = new TextDecoder('gb18030').decode(buffer);
  return scoreDecodedText(utf8) >= scoreDecodedText(gb18030) ? utf8 : gb18030;
}

function scoreDecodedText(value) {
  const replacementCount = (value.match(/\uFFFD/g) || []).length;
  const hanCount = (value.match(/\p{Script=Han}/gu) || []).length;
  const mojibakeCount = (value.match(/[\u951f\u65a4\u62f7]/g) || []).length;
  return hanCount - replacementCount * 20 - mojibakeCount * 10;
}

function sampleWeiboTrends(region, message = '', sourceType = 'sample') {
  const rows = [
    ['Weibo hot topic 1', 2810462, 'general'],
    ['Weibo hot topic 2', 2360041, 'tech'],
    ['Weibo hot topic 3', 1905521, 'business'],
    ['Weibo hot topic 4', 1689033, 'entertainment']
  ];

  return rows.map(([title, heat, category], index) =>
    createTrend({
      platform: 'weibo',
      title,
      rank: index + 1,
      heat,
      url: weiboMobileSearchUrl(title),
      region,
      category,
      tags: ['weibo', 'sample'],
      summary: 'Sample Weibo trend shown when public collection is unavailable.',
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
  const clean = stripTags(String(value)).replace(/[^\d]/g, '');
  return clean ? Number(clean) : null;
}

function weiboMobileSearchUrl(title) {
  const query = String(title || '').replace(/^#|#$/g, '').trim();
  const containerId = `100103type=1&q=${query}`;
  return `https://m.weibo.cn/search?containerid=${encodeURIComponent(containerId)}`;
}

function cleanWeiboTitle(title) {
  return String(title || '').replace(/^#+|#+$/g, '').trim();
}

function inferCategory(title) {
  const value = String(title || '');
  if (/AI|OpenAI|DeepSeek|iPhone|Android|Tesla|Nvidia|chip|app|tech/i.test(value)) return 'tech';
  if (/stock|market|finance|brand|company|price|IPO|earnings/i.test(value)) return 'business';
  if (/movie|film|music|actor|celebrity|concert|show|drama/i.test(value)) return 'entertainment';
  if (/exam|school|student|college|education/i.test(value)) return 'education';
  if (/NBA|FIFA|match|game|champion|cup|league/i.test(value)) return 'sports';
  return 'general';
}

function formatFetchError(error) {
  const cause = error.cause;
  const parts = [error.message];
  if (cause?.code) parts.push(cause.code);
  if (cause?.message && cause.message !== error.message) parts.push(cause.message);
  return parts.filter(Boolean).join(' / ');
}

module.exports = {
  fetchWeiboTrends
};
