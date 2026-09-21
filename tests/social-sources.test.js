const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseRedditRss, fetchRedditTrends } = require('../src/connectors/reddit');
const { parseCreativeCenterHashtags, fetchTikTokTrends } = require('../src/connectors/tiktok');
const { requestJson } = require('../src/connectors/request');

const entry = `<entry><title><![CDATA[A & B]]></title><category term="movies" label="r/movies"/>
  <link href="https://www.reddit.com/r/movies/comments/abc/title/"/>
  <content type="html">&lt;a href="https://wrong.example/"&gt;not a post link&lt;/a&gt;</content></entry>`;
const feed = `<feed xmlns="http://www.w3.org/2005/Atom">${entry}</feed>`;

test('Reddit reads Atom entries, not links in HTML content; deduplicates and does not invent scores', () => {
  const items = parseRedditRss(`<feed>${entry}${entry}<entry><title>Invalid</title><link href="javascript:alert(1)"/></entry></feed>`);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'A & B');
  assert.equal(items[0].heat, null);
  assert.equal(items[0].url, 'https://www.reddit.com/r/movies/comments/abc/title/');
  assert.equal(items[0].sourceType, 'rss');
  assert.throws(() => parseRedditRss('<html>Blocked</html>'), /no posts/);
  assert.throws(() => parseRedditRss('<feed><entry>'), /invalid RSS/);
});

test('TikTok accepts the new API format and rejects empty or failed responses', () => {
  const rows = parseCreativeCenterHashtags({ BaseResp: { StatusCode: 0 }, items: [
    { hashtagName: 'Cinema', rankIndex: 1, vv: 123 },
    { hashtagName: 'cinema', rankIndex: 2 }, null, { hashtagID: '3' }
  ] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rankIndex, 1);
  assert.throws(() => parseCreativeCenterHashtags({ BaseResp: { StatusCode: 1 }, items: rows }));
  assert.throws(() => parseCreativeCenterHashtags({ BaseResp: { StatusCode: 0 }, items: [] }));
});

test('Reddit falls back to the public daily top feed and reports its actual ranking', async (t) => {
  t.mock.method(global, 'fetch', async (url) => String(url).includes('/r/popular/')
    ? new Response('Blocked', { status: 403 }) : new Response(feed));
  const items = await fetchRedditTrends();
  assert.equal(items.length, 1);
  assert.match(items[0].sourceMessage, /r\/all\/top \(day\)/);
});

test('TikTok uses the new request fields and throws on failure instead of returning samples', async (t) => {
  t.mock.method(global, 'fetch', async (url, options) => {
    assert.match(url, /KnowledgeAPI\/GetHashtagList$/);
    assert.equal(options.method, 'POST');
    assert.equal(JSON.parse(options.body).timeRange, 7);
    return new Response(JSON.stringify({ BaseResp: { StatusCode: 0 }, items: [{ hashtagName: 'film', rankIndex: 2, vv: 55, publishCnt: 100 }] }));
  });
  const items = await fetchTikTokTrends();
  assert.equal(items[0].rank, 2);
  assert.equal(items[0].heat, 55);
  global.fetch = async () => new Response('Unavailable', { status: 503 });
  await assert.rejects(fetchTikTokTrends(), /503/);
  await assert.rejects(fetchRedditTrends(), /unavailable/);
});

test('Transport fallback preserves JSON body and authorization without shell interpolation', async (t) => {
  const http = require('node:http');
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    res.end(JSON.stringify({ authorization: req.headers.authorization, body: JSON.parse(body) }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.mock.method(global, 'fetch', async () => { throw new Error('Simulated TLS transport failure'); });
  try {
    const body = { text: 'a "quote" and a \\slash and $()' };
    const result = await requestJson(`http://127.0.0.1:${server.address().port}/`, {
      method: 'POST', headers: { Authorization: 'Bearer test-only', 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }, 2000);
    assert.equal(result.authorization, 'Bearer test-only');
    assert.deepEqual(result.body, body);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

function useTikTokTestSession(t) {
  const previous = process.env.TIKTOK_COOKIE;
  process.env.TIKTOK_COOKIE = 'sessionid=test-session-only';
  t.after(() => {
    if (previous === undefined) delete process.env.TIKTOK_COOKIE;
    else process.env.TIKTOK_COOKIE = previous;
  });
}

test('TikTok sends the configured session, follows pagination, and returns more than 30 rows without leaking cookies', async (t) => {
  useTikTokTestSession(t);
  const pages = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    assert.equal(options.headers.Cookie, 'sessionid=test-session-only');
    const { page, limit } = JSON.parse(options.body);
    pages.push(page);
    const items = Array.from({ length: page === 1 ? limit : 15 }, (_, i) => ({
      hashtagName: `topic${(page - 1) * limit + i + 1}`, rankIndex: (page - 1) * limit + i + 1
    }));
    return Response.json({ BaseResp: { StatusCode: 0 }, items, pagination: { hasMore: page === 1, totalCount: 35 } });
  });
  const items = await fetchTikTokTrends();
  assert.deepEqual(pages, [1, 2]);
  assert.equal(items.length, 35);
  assert.equal(items.at(-1).rank, 35);
  assert.match(items[0].sourceMessage, /authenticated chart/);
  assert.equal(JSON.stringify(items).includes('test-session-only'), false);
});

test('TikTok does not publish a partial chart when a later page fails or a session expires', async (t) => {
  useTikTokTestSession(t);
  const items = Array.from({ length: 20 }, (_, i) => ({ hashtagName: `topic${i}`, rankIndex: i + 1 }));
  t.mock.method(global, 'fetch', async (url, options) => JSON.parse(options.body).page === 1
    ? Response.json({ BaseResp: { StatusCode: 0 }, items, pagination: { hasMore: true } })
    : new Response('Expired', { status: 401 }));
  await assert.rejects(fetchTikTokTrends(), /401/);
  global.fetch = async () => Response.json({ BaseResp: { StatusCode: 0 }, items: items.slice(0, 3) });
  await assert.rejects(fetchTikTokTrends(), /TIKTOK_COOKIE/);
});

test('TikTok stops on a server repeating the same page instead of looping indefinitely', async (t) => {
  useTikTokTestSession(t);
  let requests = 0;
  t.mock.method(global, 'fetch', async () => {
    requests += 1;
    return Response.json({ BaseResp: { StatusCode: 0 },
      items: Array.from({ length: 20 }, (_, i) => ({ hashtagName: `topic${i}`, rankIndex: i + 1 })),
      pagination: { hasMore: true }
    });
  });
  await assert.rejects(fetchTikTokTrends(), /分页/);
  assert.equal(requests, 2);
});
