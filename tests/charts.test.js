const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSteamSellers } = require('../src/connectors/steam');
const { parseImdbFeed, isFreshImdbCache, fetchImdbMovieTrends } = require('../src/connectors/imdb');
const { setStoreAdapter } = require('../src/services/store');
const { classifyTrend } = require('../src/services/taxonomy');

test('Steam deduplicates products and preserves product URL types without inventing sales', () => {
  const items = parseSteamSellers({ top_sellers: { items: [
    { id: 10, type: 0, name: 'Game &amp; DLC' },
    { id: 10, type: 0, name: 'Game &amp; DLC' },
    { id: 10, type: 1, name: 'Package' },
    { id: 20, type: 2, name: 'Bundle', discount_percent: 20 },
    { id: 30, type: 9, name: 'Unknown' }
  ] } });
  assert.equal(items.length, 3);
  assert.equal(items[0].title, 'Game & DLC');
  assert.equal(items[0].heat, null);
  assert.equal(items[1].url, 'https://store.steampowered.com/sub/10/');
  assert.equal(items[2].rank, 3);
  assert.throws(() => parseSteamSellers({}));
});

test('IMDb accepts documented feed shapes and preserves ranks and source timestamp', () => {
  const items = parseImdbFeed({ type: 'IMDb MOVIEmeter', timestamp: '2026-09-20T00:00:00Z', trends: [
    { rank: 2, title: 'Second' }, { rank: 1, title: 'First' },
    { rank: 1, title: 'Duplicate' }, { rank: 11, title: 'Not free tier' }, null
  ] });
  assert.deepEqual(items.map((item) => item.title), ['First', 'Second']);
  assert.equal(items[0].heat, null);
  assert.equal(items[0].category, 'entertainment');
  assert.equal(items[0].sourceUpdatedAt, '2026-09-20T00:00:00.000Z');
  assert.equal(parseImdbFeed({ type: 'IMDb MOVIEmeter', data: [[1, 'A & B']] })[0].url, 'https://www.imdb.com/find/?q=A%20%26%20B&s=tt');
  assert.throws(() => parseImdbFeed({ type: 'IMDb MOVIEmeter', data: [] }));
  assert.throws(() => parseImdbFeed({ type: 'Google Trends', data: [[1, 'Not a movie']] }));
  assert.equal(classifyTrend('Game Night', 'entertainment', 'imdb_movie'), 'entertainment');
  assert.equal(classifyTrend('Movie Studio', 'gaming', 'steam'), 'gaming');
});

test('IMDb cache lasts seven days and rejects the old page source', () => {
  const items = parseImdbFeed({ type: 'IMDb MOVIEmeter', data: [[1, 'First']] });
  const captured = Date.parse(items[0].capturedAt);
  assert.equal(isFreshImdbCache(items, 'global', captured + 86400000), true);
  assert.equal(isFreshImdbCache(items, 'global', captured + 604799999), true);
  assert.equal(isFreshImdbCache(items, 'global', captured + 604800000), false);
  assert.equal(isFreshImdbCache(items, 'cn', captured), false);
  assert.equal(isFreshImdbCache([{ ...items[0], tags: ['imdb'] }], 'global', captured), false);
});

test('IMDb unwraps the live provider response and rejects API errors inside HTTP 200', () => {
  const body = { type: 'IMDb MOVIEmeter', as_of_ts: '2026-09-20T02:01:45Z', data: [[1, 'A Movie (2026)']] };
  const items = parseImdbFeed({ statusCode: 200, body: JSON.stringify(body) });
  assert.equal(items[0].title, 'A Movie (2026)');
  assert.equal(items[0].sourceUpdatedAt, '2026-09-20T02:01:45.000Z');
  assert.equal(parseImdbFeed({ statusCode: 200, body })[0].rank, 1);
  assert.throws(() => parseImdbFeed({ statusCode: 403, body: '{}' }), /403/);
  assert.throws(() => parseImdbFeed({ statusCode: 200, body: '{' }));
});

test('IMDb reuses persisted cache without credentials or another API call', async () => {
  const items = parseImdbFeed({ type: 'IMDb MOVIEmeter', data: [[1, 'Cached']] });
  setStoreAdapter({ readJson: async () => ({ imdb_movie: { items } }) });
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('Unexpected paid quota usage'); };
  try {
    const results = await Promise.all([fetchImdbMovieTrends(), fetchImdbMovieTrends()]);
    assert.equal(results[0][0].title, 'Cached');
    assert.equal(results[1][0].capturedAt, items[0].capturedAt);
  } finally {
    global.fetch = originalFetch;
    setStoreAdapter(null);
  }
});
