const crypto = require('crypto');
const { nowIso } = require('../connectors/shared');

const SUMMARY_LIMIT = 82;
const TITLE_LIMIT = 72;

function buildDaily({ snapshot, manualLinks, selectedIds }) {
  const selected = new Set(selectedIds || []);
  const clusters = snapshot?.clusters || [];
  const sourceItems = snapshot?.items || [];
  const manualItems = manualLinks || [];
  const selectedClusters = clusters.filter((cluster) => selected.has(cluster.id));
  const clusterSourceIds = new Set(selectedClusters.flatMap((cluster) => (cluster.sources || []).map((source) => source.id)));
  const selectedSources = sourceItems.filter((item) => selected.has(item.id) && !clusterSourceIds.has(item.id));
  const selectedManuals = manualItems.filter((item) => selected.has(item.id));
  const items = [
    ...selectedClusters.map(normalizeCluster),
    ...selectedSources.map(normalizeSourceItem),
    ...selectedManuals.map(normalizeManual)
  ];

  const sourceCount = new Set(items.map((item) => item.sourceLabel).filter(Boolean)).size;

  return {
    id: `daily:${new Date().toISOString().slice(0, 10)}`,
    date: new Date().toISOString().slice(0, 10),
    updatedAt: nowIso(),
    selectedIds: [...selected],
    itemCount: items.length,
    manualCount: selectedManuals.length,
    platformCount: sourceCount,
    items,
    sections: buildSections(items),
    summary: buildSummary(items, selectedManuals.length, sourceCount)
  };
}

function normalizeCluster(cluster) {
  const primarySource = cluster.sources?.find((source) => source.url) || cluster.sources?.[0] || {};
  const title = readableTitle(cluster.canonicalTitle || primarySource.title, primarySource.url);

  return {
    id: cluster.id,
    kind: 'cluster',
    title,
    summary: summarizeCluster(cluster, primarySource),
    url: primarySource.url || '',
    category: cluster.category || 'general',
    categoryLabel: categoryLabel(cluster.category),
    sourceLabel: (cluster.platforms || []).map(platformLabel).join(' / '),
    rank: primarySource.rank || null,
    score: cluster.score || 0,
    image: '',
    capturedAt: cluster.capturedAt || cluster.lastSeenAt || ''
  };
}

function normalizeManual(item) {
  const sourceLabel = cleanText(item.sourceLabel || hostFromUrl(item.url) || '手动添加', 40);

  return {
    id: item.id,
    kind: 'manual',
    title: cleanText(item.title, TITLE_LIMIT),
    summary: cleanText(item.summary, SUMMARY_LIMIT) || `你手动添加的热点，来源为 ${sourceLabel}。`,
    url: item.url,
    category: item.category || 'general',
    categoryLabel: categoryLabel(item.category),
    sourceLabel,
    rank: null,
    score: 0,
    image: item.image || '',
    capturedAt: item.capturedAt || ''
  };
}

function normalizeSourceItem(item) {
  const title = readableTitle(item.title, item.url);

  return {
    id: item.id,
    kind: 'source',
    title,
    summary: '',
    url: item.url || '',
    category: item.category || 'general',
    categoryLabel: categoryLabel(item.category),
    sourceLabel: platformLabel(item.platform),
    rank: item.rank || null,
    score: 0,
    image: '',
    capturedAt: item.capturedAt || ''
  };
}

function summarizeCluster(cluster, primarySource) {
  return '';
}

function buildSections(items) {
  const grouped = new Map();
  for (const item of items) {
    const key = item.category || 'general';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }

  return [...grouped.entries()]
    .map(([category, rows]) => ({
      category,
      label: categoryLabel(category),
      items: rows.sort((a, b) => (b.score || 0) - (a.score || 0))
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}

function buildSummary(items, manualCount, sourceCount) {
  if (!items.length) {
    return '今日日报还没有选择热点。';
  }

  return `今日共整理 ${items.length} 条热点，覆盖 ${sourceCount} 个来源，其中手动添加 ${manualCount} 条。`;
}

function createManualLink(input) {
  const url = String(input.url || '').trim();
  const title = cleanText(input.title, TITLE_LIMIT);
  if (!url || !title) {
    throw new Error('链接和标题都不能为空。');
  }

  return {
    id: `manual:${hash(`${url}:${Date.now()}`)}`,
    platform: 'manual',
    title,
    summary: cleanText(input.summary, SUMMARY_LIMIT),
    url,
    image: String(input.image || '').trim(),
    sourceLabel: cleanText(input.sourceLabel || hostFromUrl(url) || '手动添加', 40),
    category: String(input.category || 'general').trim(),
    sourceType: 'manual-link',
    capturedAt: nowIso()
  };
}

function readableTitle(title, url) {
  const clean = cleanText(title, TITLE_LIMIT);
  if (!looksMojibake(clean)) return clean;

  const fromUrl = titleFromUrl(url);
  return fromUrl || clean;
}

function titleFromUrl(url) {
  try {
    const parsed = new URL(url);
    const queryTitle = parsed.searchParams.get('q') || parsed.searchParams.get('keyword');
    if (!queryTitle) return '';
    return cleanText(queryTitle.replace(/^#|#$/g, ''), TITLE_LIMIT);
  } catch {
    return '';
  }
}

function cleanText(value, limit = SUMMARY_LIMIT) {
  const text = String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function looksMojibake(value) {
  return /[鐑鎵浠婃棩鏉ヨ嚜缁煎悎寰崥]|[�]/.test(String(value || ''));
}

function categoryLabel(category) {
  return (
    {
      auto: '汽车出行',
      business: '财经商业',
      education: '教育考试',
      entertainment: '影视娱乐',
      food: '餐饮美食',
      finance: '财经商业',
      gaming: '游戏电竞',
      meme: '时下热梗',
      general: '综合热点',
      health: '健康医疗',
      lifestyle: '生活消费',
      politics: '政务国际',
      science: '科学探索',
      society: '社会民生',
      sports: '体育赛事',
      tech: '科技数码',
      travel: '旅行文旅',
      world: '政务国际'
    }[category] || category || '综合热点'
  );
}

function platformLabel(platform) {
  return (
    {
      weibo: '微博',
      gamersky: '游民星空',
      threedm: '3DM游戏网',
      yystv: '游研社',
      gcores: '机核网',
      gameres: 'GameRes',
      nadianshi: '游戏葡萄',
      gamelook: 'GameLook',
      bilibili_daily: 'B站日榜',
      bilibili_weekly: 'B站周榜',
      douban_nowplaying: '豆瓣热映',
      douban_movie: '豆瓣电影',
      douban_tv: '豆瓣剧集',
      x: 'X',
      reddit: 'Reddit',
      tiktok: 'TikTok',
      manual: '手动添加'
    }[platform] || platform
  );
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function hash(value) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);
}

module.exports = {
  buildDaily,
  categoryLabel,
  createManualLink,
  hostFromUrl,
  platformLabel
};
