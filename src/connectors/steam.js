const { createTrend, fetchWithTimeout } = require('./shared');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

function parseSteamSellers(payload, region = 'global') {
  const seen = new Set();
  const rows = (payload?.top_sellers?.items || []).filter((item) => {
    const key = `${item.type}:${item.id}`;
    if (!item.name || !Number.isInteger(item.id) || ![0, 1, 2].includes(item.type) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!rows.length) throw new Error('Steam returned no top sellers');
  return rows.slice(0, 30).map((item, index) => createTrend({
    platform: 'steam', title: item.name, rank: index + 1, region,
    url: `https://store.steampowered.com/${['app', 'sub', 'bundle'][item.type]}/${item.id}/`,
    category: 'gaming', tags: ['steam', 'top-sellers'],
    summary: `Steam 商店热销精选${item.discount_percent > 0 ? ` · 优惠 ${item.discount_percent}%` : ''}`,
    sourceType: 'public-api',
    sourceMessage: 'Steam store featured top sellers (US storefront); not the full global sales chart.'
  }));
}

async function fetchSteamTrends({ region = 'global' } = {}) {
  const endpoint = 'https://store.steampowered.com/api/featuredcategories?l=schinese&cc=us';
  let payload;
  try {
    const response = await fetchWithTimeout(endpoint);
    if (!response.ok) throw new Error(`Steam request failed with ${response.status}`);
    payload = await response.json();
  } catch (error) {
    try {
      const { stdout } = await execFileAsync('curl', [
        '--location', '--fail', '--silent', '--show-error', '--max-time', '15', endpoint
      ], { timeout: 18000, maxBuffer: 5 * 1024 * 1024, windowsHide: true });
      payload = JSON.parse(stdout);
    } catch (fallbackError) {
      throw new Error(`Steam: ${error.message}; curl: ${fallbackError.message}`);
    }
  }
  return parseSteamSellers(payload, region);
}

module.exports = { fetchSteamTrends, parseSteamSellers };
