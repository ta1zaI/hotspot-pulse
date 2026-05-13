const { createTrend, fetchWithTimeout } = require('./shared');

async function fetchGameresTrends({ region = 'cn' } = {}) {
  const endpoint = process.env.GAMERES_JSON_URL || 'https://www.gameres.com/newslistJson';

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
      throw new Error(`GameRes request failed with ${response.status}`);
    }

    const payload = await response.json();
    const rows = Array.isArray(payload?.list) ? payload.list : [];

    if (!rows.length) {
      throw new Error('GameRes returned no rows.');
    }

    return rows.slice(0, 20).map((item, index) => {
      const title = item.subject || `GameRes article ${index + 1}`;
      const url = item.wailian || item.url || `/thread-${item.id}-1-1.html`;

      return createTrend({
        platform: 'gameres',
        title,
        rank: index + 1,
        heat: null,
        url: normalizeGameresUrl(url),
        region,
        category: 'gaming',
        tags: ['gameres', 'game-industry'],
        summary: item.summary || '',
        sourceType: 'public-api',
        sourceMessage: `GameRes public JSON source: ${endpoint}.`
      });
    });
  } catch (error) {
    throw new Error(`GameRes failed: ${error.message}`);
  }
}

function normalizeGameresUrl(url) {
  if (!url) return 'https://www.gameres.com/';
  if (url.startsWith('http')) return url;
  return `https://www.gameres.com${url}`;
}

module.exports = {
  fetchGameresTrends
};
