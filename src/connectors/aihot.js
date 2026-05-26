const { createTrend, fetchWithTimeout } = require('./shared');

const CATEGORY_MAP = {
  'ai-models': 'tech',
  'ai-products': 'tech',
  industry: 'tech',
  paper: 'science',
  tip: 'general'
};

async function fetchAiHotTrends({ region = 'cn' } = {}) {
  const mode = aiHotMode();
  const endpoint = process.env.AIHOT_API_URL || `https://aihot.virxact.com/api/public/items?mode=${mode}`;
  const limit = Math.max(1, Number(process.env.AIHOT_LIMIT || 50));

  try {
    const response = await fetchWithTimeout(
      endpoint,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      },
      20000
    );

    if (!response.ok) {
      throw new Error(`AI HOT request failed with ${response.status}`);
    }

    const payload = await response.json();
    const rows = Array.isArray(payload?.items) ? payload.items : [];

    if (!rows.length) {
      throw new Error('AI HOT returned no items.');
    }

    return rows.slice(0, limit).map((item, index) => {
      const source = item.source || 'AI HOT';
      const trend = createTrend({
        platform: 'aihot',
        title: item.title || item.title_en || `AI HOT item ${index + 1}`,
        rank: index + 1,
        heat: null,
        url: item.url || 'https://aihot.virxact.com/',
        region,
        category: mapCategory(item.category),
        tags: ['aihot', 'ai', item.category, source].filter(Boolean),
        summary: item.summary || item.title_en || source,
        sourceType: 'public-api',
        sourceMessage: `AI HOT public API source: ${endpoint}.`
      });

      return {
        ...trend,
        capturedAt: parseDate(item.publishedAt) || trend.capturedAt,
        sourceName: source,
        externalId: item.id || ''
      };
    });
  } catch (error) {
    throw new Error(`AI HOT failed: ${error.message}`);
  }
}

function aiHotMode() {
  const mode = String(process.env.AIHOT_MODE || 'selected').trim();
  return mode === 'all' ? 'all' : 'selected';
}

function mapCategory(category) {
  return CATEGORY_MAP[category] || 'tech';
}

function parseDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

module.exports = {
  fetchAiHotTrends
};
