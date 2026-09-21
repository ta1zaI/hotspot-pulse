const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setStoreAdapter } = require('../src/services/store');
const { collectTrends } = require('../src/services/collector');

test('Collector retains successful data after failure, but never reuses old sample rows', async (t) => {
  const originalPlatforms = process.env.ACTIVE_PLATFORMS;
  process.env.ACTIVE_PLATFORMS = 'tiktok';
  t.mock.method(global, 'fetch', async () => new Response('Unavailable', { status: 503 }));
  let storedItems = [{ platform: 'tiktok', title: 'Fake', sourceType: 'sample-fallback' }];
  setStoreAdapter({
    readJson: async (key) => key === 'source-cache' ? { tiktok: { items: storedItems } } : { items: storedItems },
    writeJson: async () => {}
  });
  try {
    const empty = await collectTrends();
    assert.equal(empty.items.length, 0);
    assert.equal(empty.connectors[0].status, 'error');
    storedItems = [{ platform: 'tiktok', title: '#film', rank: 1, sourceType: 'public-api', capturedAt: '2026-09-20T00:00:00Z' }];
    const cached = await collectTrends();
    assert.equal(cached.items[0].capturedAt, storedItems[0].capturedAt);
    assert.equal(cached.connectors[0].sourceType, 'stale-cache');
  } finally {
    setStoreAdapter(null);
    if (originalPlatforms === undefined) delete process.env.ACTIVE_PLATFORMS;
    else process.env.ACTIVE_PLATFORMS = originalPlatforms;
  }
});
