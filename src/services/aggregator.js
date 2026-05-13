const { nowIso } = require('../connectors/shared');

const PLATFORM_WEIGHT = {
  weibo: 1.15,
  reddit: 0.98,
  gamersky: 0.9,
  threedm: 0.9,
  yystv: 0.92,
  gcores: 0.92
};

function aggregateTrends(items) {
  const clusters = new Map();

  for (const item of items) {
    const fingerprint = newsFingerprint(item.title);
    const key = findClusterKey(item, clusters, fingerprint) || fingerprint.key || normalizeTitle(item.title);
    const current = clusters.get(key) || {
      id: key,
      canonicalTitle: item.title,
      category: item.category || 'general',
      score: 0,
      heat: 0,
      sources: [],
      firstSeenAt: item.capturedAt,
      lastSeenAt: item.capturedAt,
      summary: item.summary || '',
      tokenSet: new Set(fingerprint.tokens),
      scoreParts: []
    };

    const parts = scoreItem(item);
    current.score += parts.total;
    current.heat += item.heat || 0;
    current.sources.push(item);
    current.scoreParts.push(parts);
    fingerprint.tokens.forEach((token) => current.tokenSet.add(token));
    current.lastSeenAt = maxDate(current.lastSeenAt, item.capturedAt);
    current.firstSeenAt = minDate(current.firstSeenAt, item.capturedAt);

    if (isBetterPrimarySource(item, current.sources[0])) {
      current.canonicalTitle = item.title;
    }
    current.sources.sort(comparePrimarySource);

    clusters.set(key, current);
  }

  return [...clusters.values()]
    .map((cluster) => ({
      ...cluster,
      tokenSet: undefined,
      score: round(cluster.score + scoreCluster(cluster)),
      scoreBreakdown: summarizeScore(cluster),
      platforms: [...new Set(cluster.sources.map((source) => source.platform))],
      platformGroups: [...new Set(cluster.sources.map((source) => source.platformGroup).filter(Boolean))],
      sourceCount: cluster.sources.length,
      capturedAt: nowIso()
    }))
    .sort((a, b) => b.score - a.score);
}

function scoreItem(item) {
  const rank = Math.max(1, Number(item.rank) || 50);
  const platformWeight = PLATFORM_WEIGHT[item.platform] || 1;
  const rankScore = Math.max(8, 82 - Math.log2(rank + 1) * 15);
  const heatScore = scoreHeat(item);
  const engagementScore = scoreEngagement(item);
  const freshnessScore = scoreFreshness(item);
  const deterministicTieBreaker = scoreTieBreaker(item);
  const total =
    (rankScore + heatScore + engagementScore + freshnessScore + deterministicTieBreaker) * platformWeight;

  return {
    total,
    rank: round(rankScore),
    heat: round(heatScore),
    engagement: round(engagementScore),
    freshness: round(freshnessScore),
    platformWeight,
    tieBreaker: round(deterministicTieBreaker)
  };
}

function scoreHeat(item) {
  if (!item.heat) {
    return 0;
  }

  const type = item.metrics ? 'video' : item.sourceType;
  const cap = type === 'video' ? 46 : 42;
  return Math.min(cap, Math.log10(Number(item.heat) + 1) * 6);
}

function scoreEngagement(item) {
  if (!item.metrics) return 0;

  const weighted =
    (item.metrics.likes || 0) * 0.5 +
    (item.metrics.coins || 0) * 0.9 +
    (item.metrics.favorites || 0) * 0.7 +
    (item.metrics.shares || 0) * 0.8 +
    (item.metrics.danmaku || 0) * 0.3 +
    (item.metrics.replies || 0) * 0.4;

  return Math.min(28, Math.log10(weighted + 1) * 4.5);
}

function scoreFreshness(item) {
  if (!item.capturedAt) return 5;

  const ageHours = Math.max(0, (Date.now() - new Date(item.capturedAt).getTime()) / 36e5);
  return Math.max(0, 8 - ageHours * 0.35);
}

function scoreTieBreaker(item) {
  const seed = `${item.platform}:${item.title}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 997;
  }
  return hash / 997;
}

function scoreCluster(cluster) {
  const platformCount = new Set(cluster.sources.map((source) => source.platform)).size;
  const crossPlatformScore = platformCount > 1 ? 18 + (platformCount - 2) * 8 : 0;
  const repeatedSourceScore = Math.max(0, cluster.sources.length - 1) * 6;
  return crossPlatformScore + repeatedSourceScore;
}

function summarizeScore(cluster) {
  return cluster.scoreParts.reduce(
    (acc, part) => {
      acc.rank += part.rank;
      acc.heat += part.heat;
      acc.engagement += part.engagement;
      acc.freshness += part.freshness;
      return acc;
    },
    { rank: 0, heat: 0, engagement: 0, freshness: 0 }
  );
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function normalizeTitle(title) {
  return String(title)
    .toLowerCase()
    .replace(/^#|#$/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .slice(0, 80);
}

function newsFingerprint(title) {
  const tokens = tokenizeTitle(title).filter((token) => !isStopToken(token));
  if (tokens.length < 2) return { key: '', tokens };

  const uniqueTokens = [...new Set(tokens)];
  const strongTokens = uniqueTokens.filter(isStrongToken);
  const signatureTokens = (strongTokens.length >= 2 ? strongTokens : uniqueTokens)
    .sort(compareFingerprintTokens)
    .slice(0, 5);

  return {
    key: signatureTokens.length >= 2 ? `news:${signatureTokens.join('|')}` : '',
    tokens: uniqueTokens
  };
}

function findClusterKey(item, clusters, fingerprint) {
  if (fingerprint.key && clusters.has(fingerprint.key)) {
    return fingerprint.key;
  }

  if (fingerprint.tokens.length < 4) {
    return '';
  }

  const candidatePlatforms = new Set([item.platform]);
  let best = null;

  for (const [key, cluster] of clusters) {
    const tokenSet = cluster.tokenSet;
    if (!tokenSet || tokenSet.size < 4) continue;

    const overlap = fingerprint.tokens.filter((token) => tokenSet.has(token)).length;
    const smallerSize = Math.min(fingerprint.tokens.length, tokenSet.size);
    const overlapRatio = overlap / smallerSize;
    const crossPlatform = cluster.sources.some((source) => !candidatePlatforms.has(source.platform));

    if (crossPlatform && overlap >= 4 && overlapRatio >= 0.55) {
      if (!best || overlapRatio > best.overlapRatio) {
        best = { key, overlapRatio };
      }
    }
  }

  return best?.key || '';
}

function tokenizeTitle(title) {
  return String(title)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .match(/[\p{Script=Han}]{2,}|[a-z0-9][a-z0-9+-]{2,}/gu)
    ?.map(stemToken) || [];
}

function stemToken(token) {
  if (/[\p{Script=Han}]/u.test(token)) return token;
  return token
    .replace(/ies$/, 'y')
    .replace(/ing$/, '')
    .replace(/ed$/, '')
    .replace(/es$/, '')
    .replace(/s$/, '');
}

function isStopToken(token) {
  return STOP_TOKENS.has(token) || /^\d+$/.test(token);
}

function isStrongToken(token) {
  return token.length >= 4 || /[\p{Script=Han}]/u.test(token);
}

function compareFingerprintTokens(a, b) {
  return b.length - a.length || a.localeCompare(b);
}

function isBetterPrimarySource(candidate, current) {
  if (!current) return true;
  return comparePrimarySource(candidate, current) < 0;
}

function comparePrimarySource(a, b) {
  const weightDelta = (PLATFORM_WEIGHT[b.platform] || 1) - (PLATFORM_WEIGHT[a.platform] || 1);
  if (weightDelta) return weightDelta;

  const rankDelta = (Number(a.rank) || 999) - (Number(b.rank) || 999);
  if (rankDelta) return rankDelta;

  return (Number(b.heat) || 0) - (Number(a.heat) || 0);
}

const STOP_TOKENS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'are',
  'was',
  'were',
  'will',
  'has',
  'have',
  'into',
  'about',
  'after',
  'before',
  'over',
  'under',
  'what',
  'when',
  'where',
  'why',
  'how',
  'news',
  'video',
  'highlight',
  'official',
  'report',
  'thread',
  'discussion',
  'update',
  'live',
  'breaking',
  '今天',
  '最新',
  '回应',
  '通报',
  '网友',
  '官方',
  '记者',
  '新闻',
  '视频',
  '热搜',
  '曝光',
  '宣布',
  '发布',
  '发生',
  '出现',
  '回应称'
]);

function minDate(a, b) {
  return new Date(a) <= new Date(b) ? a : b;
}

function maxDate(a, b) {
  return new Date(a) >= new Date(b) ? a : b;
}

module.exports = {
  aggregateTrends
};
