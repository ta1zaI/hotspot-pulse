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
        url: normalizeWeiboUrl(item.url || item.mobileUrl || item.mobilUrl, title),
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
        const path = match[1].startsWith('http') ? match[1] : `https://s.weibo.com${match[1]}`;

        return createTrend({
          platform: 'weibo',
          title,
          rank: index + 1,
          heat: parseHeat(match[3]),
          url: path,
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
  const commonChineseCount = (value.match(/[的一是在不了有和人这中大为上个国我以要他]/g) || []).length;
  const mojibakeCount = (value.match(/[锟斤拷]/g) || []).length;
  return commonChineseCount - replacementCount * 20 - mojibakeCount * 10;
}

function sampleWeiboTrends(region, message = '', sourceType = 'sample') {
  const rows = [
    ['多地文旅发布端午活动', 2810462, 'society'],
    ['国产大模型应用周活创新高', 2360041, 'tech'],
    ['新能源车充电新规讨论', 1905521, 'business'],
    ['热门剧集大结局', 1689033, 'entertainment'],
    ['高考倒计时备考建议', 1520067, 'education'],
    ['暴雨天气出行提醒', 1412350, 'society'],
    ['国际金价波动', 1198302, 'business'],
    ['演唱会门票二开', 1004430, 'entertainment']
  ];

  return rows.map(([title, heat, category], index) =>
    createTrend({
      platform: 'weibo',
      title,
      rank: index + 1,
      heat,
      url: `https://s.weibo.com/weibo?q=${encodeURIComponent(title)}`,
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

function normalizeWeiboUrl(url, title) {
  if (!url || /[?&]q=(&|$)/.test(url)) {
    return `https://s.weibo.com/weibo?q=${encodeURIComponent(title)}`;
  }

  return url;
}

function inferCategory(title) {
  if (/模型|AI|科技|新能源|手机|芯片|应用|神舟|任务|机器人|算力/.test(title)) return 'tech';
  if (/金价|股票|消费|房贷|市场|车|品牌|公司|发布会/.test(title)) return 'business';
  if (/剧|电影|演唱会|明星|综艺|艺人|票房|演员|导演/.test(title)) return 'entertainment';
  if (/高考|学校|大学|考试|学生|教育/.test(title)) return 'education';
  if (/天气|暴雨|出行|地震|警方|医院|通报|回应/.test(title)) return 'society';
  if (/国乒|世界杯|比赛|夺冠|球|运动员|冠军/.test(title)) return 'sports';
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
