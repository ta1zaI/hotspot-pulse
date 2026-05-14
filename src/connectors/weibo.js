const { createTrend, fetchWithTimeout } = require('./shared');

async function fetchWeiboTrends({ region = 'cn' } = {}) {
  const source = (process.env.WEIBO_SOURCE || 'free-api').toLowerCase();

  if (source === 'official' || source === 'official-first' || process.env.WEIBO_COOKIE) {
    const officialItems = await fetchOfficialWeiboPage(region);
    if (officialItems.length) {
      return officialItems;
    }
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

    const response = await fetchWithTimeout('https://s.weibo.com/top/summary?cate=realtimehot', {
      headers
    });

    if (!response.ok) {
      throw new Error(`Weibo hot search request failed with ${response.status}`);
    }

    const html = await decodeWeiboHtml(response);
    const matches = [
      ...html.matchAll(/<td class="td-02">[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?(?:<span>(.*?)<\/span>)?/g)
    ];

    if (!matches.length) {
      return [];
    }

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
      .filter((item) => item.title && !item.url.includes('javascript:void'))
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

async function decodeWeiboHtml(response) {
  const buffer = await response.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  const gb18030 = new TextDecoder('gb18030').decode(buffer);
  return scoreDecodedText(utf8) >= scoreDecodedText(gb18030) ? utf8 : gb18030;
}

function scoreDecodedText(value) {
  const replacementCount = (value.match(/\uFFFD/g) || []).length;
  const commonChineseCount = (value.match(/[鐨勪竴鏄湪涓嶄簡鏈夊拰浜鸿繖涓ぇ涓轰笂涓浗鎴戜互瑕佷粬]/g) || []).length;
  const mojibakeCount = (value.match(/[閿熸枻鎷穄/g) || []).length;
  return commonChineseCount - replacementCount * 20 - mojibakeCount * 10;
}

function sampleWeiboTrends(region, message = '', sourceType = 'sample') {
  const rows = [
    ['澶氬湴鏂囨梾鍙戝竷绔崍娲诲姩', 2810462, 'society'],
    ['鍥戒骇澶фā鍨嬪簲鐢ㄥ懆娲诲垱鏂伴珮', 2360041, 'tech'],
    ['鏂拌兘婧愯溅鍏呯數鏂拌璁ㄨ', 1905521, 'business'],
    ['鐑棬鍓ч泦澶х粨灞€', 1689033, 'entertainment'],
    ['楂樿€冨€掕鏃跺鑰冨缓璁?, 1520067, 'education'],
    ['鏆撮洦澶╂皵鍑鸿鎻愰啋', 1412350, 'society'],
    ['鍥介檯閲戜环娉㈠姩', 1198302, 'business'],
    ['婕斿敱浼氶棬绁ㄤ簩寮€', 1004430, 'entertainment']
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

function inferCategory(title) {
  if (/妯″瀷|AI|绉戞妧|鏂拌兘婧恷鎵嬫満|鑺墖|搴旂敤|绁炶垷|浠诲姟|鏈哄櫒浜簗绠楀姏/.test(title)) return 'tech';
  if (/閲戜环|鑲＄エ|娑堣垂|鎴胯捶|甯傚満|杞鍝佺墝|鍏徃|鍙戝竷浼?.test(title)) return 'business';
  if (/鍓鐢靛奖|婕斿敱浼殀鏄庢槦|缁艰壓|鑹轰汉|绁ㄦ埧|婕斿憳|瀵兼紨/.test(title)) return 'entertainment';
  if (/楂樿€億瀛︽牎|澶у|鑰冭瘯|瀛︾敓|鏁欒偛/.test(title)) return 'education';
  if (/澶╂皵|鏆撮洦|鍑鸿|鍦伴渿|璀︽柟|鍖婚櫌|閫氭姤|鍥炲簲/.test(title)) return 'society';
  if (/鍥戒箳|涓栫晫鏉瘄姣旇禌|澶哄啝|鐞億杩愬姩鍛榺鍐犲啗/.test(title)) return 'sports';
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
  fetchWeiboTrends
};
