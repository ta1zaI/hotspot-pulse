const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { Readable } = require('node:stream');
const store = require('../src/services/store');

test('saving updates latest and dated daily without a push, replacing the same date', async (t) => {
  const data = new Map([
    ['trends', { items: [], clusters: [] }],
    ['manual-links', []]
  ]);
  store.setStoreAdapter({
    async readJson(key, fallback) { return data.get(key) ?? fallback; },
    async writeJson(key, value) { data.set(key, structuredClone(value)); }
  });
  t.after(() => store.setStoreAdapter(null));
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const previous = { date: yesterday, items: [], itemCount: 0, summary: 'Previous day' };
  await store.writeDailyHistory(previous);
  let handler;
  const filename = path.resolve(__dirname, '../src/server.js');
  const localRequire = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require(name) {
      if (name === 'http') return { createServer(fn) { handler = fn; return { listen() {} }; } };
      if (name === './services/env') return { loadEnv() {} };
      if (name === './services/collector') return { collectTrends() { throw new Error('Unexpected collection'); } };
      return localRequire(name);
    },
    process: { env: { ADMIN_PASSWORD: 'test-only' }, cwd: () => path.dirname(path.dirname(filename)) },
    URL, Buffer, console
  }, { filename });
  let cookie = '';
  async function request(url, method = 'GET', body = {}) {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { url, method, headers: { host: 'localhost', cookie } });
    let status;
    let result;
    await handler(req, {
      setHeader(name, value) { if (name === 'Set-Cookie') cookie = value.split(';')[0]; },
      writeHead(value) { status = value; },
      end(value) { result = JSON.parse(value); }
    });
    assert.equal(status, 200, JSON.stringify(result));
    return result;
  }
  await request('/api/admin/login', 'POST', { password: 'test-only' });
  const first = await request('/api/daily', 'POST', { selectedIds: [] });
  assert.deepEqual(await request(`/api/daily?date=${first.date}`), first);
  data.set('manual-links', [{ id: 'manual:test', title: 'New saved item', url: 'https://example.com/new' }]);
  const second = await request('/api/daily', 'POST', { selectedIds: ['manual:test'] });
  assert.equal(second.itemCount, 1);
  assert.deepEqual(await request('/api/daily'), second);
  assert.deepEqual(await request(`/api/daily?date=${second.date}`), second);
  const history = await request('/api/daily-history');
  assert.equal(history.entries.filter(entry => entry.date === second.date).length, 1);
  assert.equal(history.retentionDays, 365);
  assert.deepEqual(await store.readDailyHistory(yesterday), previous);
});
