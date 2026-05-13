const { fetchTikTokTrends } = require('../connectors/tiktok');
const { fetchWeiboTrends } = require('../connectors/weibo');
const { fetchXTrends } = require('../connectors/x');
const { fetchRedditTrends } = require('../connectors/reddit');
const { fetchGamerskyTrends } = require('../connectors/gamersky');
const { fetchThreeDmTrends } = require('../connectors/threeDm');
const { fetchYystvTrends } = require('../connectors/yystv');
const { fetchGcoresTrends } = require('../connectors/gcores');
const { fetchBilibiliDailyTrends } = require('../connectors/bilibiliDaily');
const { fetchBilibiliWeeklyTrends } = require('../connectors/bilibiliWeekly');
const { fetchGameresTrends } = require('../connectors/gameres');
const { fetchNadianshiTrends } = require('../connectors/nadianshi');
const { fetchGamelookTrends } = require('../connectors/gamelook');
const {
  fetchDoubanMovieTrends,
  fetchDoubanNowPlayingTrends,
  fetchDoubanTvTrends
} = require('../connectors/douban');
const { aggregateTrends } = require('./aggregator');
const { loadEnv } = require('./env');
const { writeSnapshot } = require('./store');
const { CATEGORY_REGISTRY, PLATFORM_REGISTRY, classifyTrend, getPlatformMeta } = require('./taxonomy');

loadEnv();

const CONNECTORS = [
  { ...PLATFORM_REGISTRY.weibo, run: fetchWeiboTrends },
  { ...PLATFORM_REGISTRY.gamersky, run: fetchGamerskyTrends },
  { ...PLATFORM_REGISTRY.threedm, run: fetchThreeDmTrends },
  { ...PLATFORM_REGISTRY.yystv, run: fetchYystvTrends },
  { ...PLATFORM_REGISTRY.gcores, run: fetchGcoresTrends },
  { ...PLATFORM_REGISTRY.gameres, run: fetchGameresTrends },
  { ...PLATFORM_REGISTRY.nadianshi, run: fetchNadianshiTrends },
  { ...PLATFORM_REGISTRY.gamelook, run: fetchGamelookTrends },
  { ...PLATFORM_REGISTRY.bilibili_daily, run: fetchBilibiliDailyTrends },
  { ...PLATFORM_REGISTRY.bilibili_weekly, run: fetchBilibiliWeeklyTrends },
  { ...PLATFORM_REGISTRY.douban_nowplaying, run: fetchDoubanNowPlayingTrends },
  { ...PLATFORM_REGISTRY.douban_movie, run: fetchDoubanMovieTrends },
  { ...PLATFORM_REGISTRY.douban_tv, run: fetchDoubanTvTrends },
  { ...PLATFORM_REGISTRY.x, run: fetchXTrends },
  { ...PLATFORM_REGISTRY.reddit, run: fetchRedditTrends },
  { ...PLATFORM_REGISTRY.tiktok, run: fetchTikTokTrends }
];

async function collectTrends({ region = 'global' } = {}) {
  const settled = await Promise.all(
    CONNECTORS.map(async (connector) => {
      try {
        return {
          status: 'fulfilled',
          connector,
          items: await connector.run({ region: connector.id === 'weibo' ? 'cn' : region })
        };
      } catch (error) {
        return {
          status: 'rejected',
          connector,
          error
        };
      }
    })
  );

  const errors = [];
  const items = [];
  const connectorStatuses = [];

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      items.push(...result.items.map(enrichTrendItem));
      connectorStatuses.push(toConnectorStatus(result.connector, result.items));
    } else {
      const message = result.error?.message || String(result.error);
      errors.push(`${result.connector.label}: ${message}`);
      connectorStatuses.push({
        ...result.connector,
        status: 'error',
        sourceType: 'error',
        itemCount: 0,
        message
      });
    }
  }

  const clusters = aggregateTrends(items.filter(includeInAggregate));
  const snapshot = {
    generatedAt: new Date().toISOString(),
    region,
    items,
    clusters,
    errors,
    connectors: connectorStatuses
    ,
    platformGroups: [
      { id: 'domestic', label: '国内' },
      { id: 'overseas', label: '海外' }
    ],
    categories: Object.entries(CATEGORY_REGISTRY)
      .map(([id, value]) => ({ id, label: value.label, order: value.order }))
      .sort((a, b) => a.order - b.order)
  };

  await writeSnapshot(snapshot);
  return snapshot;
}

function includeInAggregate(item) {
  return ![
    'bilibili_daily',
    'bilibili_weekly',
    'douban_nowplaying',
    'douban_movie',
    'douban_tv',
    'tiktok',
    'x'
  ].includes(item.platform);
}

function enrichTrendItem(item) {
  const platform = getPlatformMeta(item.platform);

  return {
    ...item,
    platformLabel: platform.label,
    platformGroup: platform.group,
    platformGroupLabel: platform.groupLabel,
    category: classifyTrend(item.title, item.category, item.platform)
  };
}

function toConnectorStatus(connector, items) {
  const sourceTypes = [...new Set(items.map((item) => item.sourceType || 'sample'))];
  const hasLive = sourceTypes.some((sourceType) =>
    ['api', 'public-page', 'public-api', 'custom-json', 'rss', 'public-proxy'].includes(sourceType)
  );
  const hasFallback = sourceTypes.some((sourceType) => sourceType.includes('fallback'));

  return {
    id: connector.id,
    label: connector.label,
    group: connector.group,
    groupLabel: connector.groupLabel,
    market: connector.market,
    type: connector.type,
    typeLabel: connector.typeLabel,
    status: hasLive ? 'live' : hasFallback ? 'fallback' : 'sample',
    sourceType: sourceTypes.join(', '),
    itemCount: items.length,
    message: items[0]?.sourceMessage || ''
  };
}

module.exports = {
  collectTrends,
  CONNECTORS
};
