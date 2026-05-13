import crypto from 'node:crypto';
import collectorModule from './services/collector.js';
import storeModule from './services/store.js';
import dailyModule from './services/daily.js';
import linkParserModule from './services/linkParser.js';

const { collectTrends } = collectorModule;
const {
  readDaily,
  readManualLinks,
  readSnapshot,
  setStoreAdapter,
  writeDaily,
  writeManualLinks
} = storeModule;
const { buildDaily, createManualLink } = dailyModule;
const { parseManualLink } = linkParserModule;

const ADMIN_COOKIE = 'hp_admin';
const ADMIN_SESSION_HOURS = 12;
let refreshPromise = null;

export default {
  async fetch(request, env) {
    configureRuntime(env);

    try {
      const url = new URL(request.url);

      if (url.pathname === '/api/trends') {
        const snapshot = (await readSnapshot()) || (await refresh());
        return sendJson(snapshot);
      }

      if (url.pathname === '/api/refresh' && request.method === 'POST') {
        requireAdmin(request);
        const snapshot = await refresh();
        return sendJson(snapshot);
      }

      if (url.pathname === '/api/admin/session') {
        return sendJson({ authenticated: isAdmin(request) });
      }

      if (url.pathname === '/api/admin/login' && request.method === 'POST') {
        const body = await readJsonBody(request);
        if (!process.env.ADMIN_PASSWORD) {
          return sendJson({ error: '服务器还没有配置 ADMIN_PASSWORD。' }, 503);
        }
        if (String(body.password || '') !== process.env.ADMIN_PASSWORD) {
          return sendJson({ error: '管理员密码不正确。' }, 401);
        }

        return sendJson({ authenticated: true }, 200, {
          'Set-Cookie': adminCookie()
        });
      }

      if (url.pathname === '/api/admin/logout' && request.method === 'POST') {
        return sendJson({ authenticated: false }, 200, {
          'Set-Cookie': `${ADMIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`
        });
      }

      if (url.pathname === '/api/daily') {
        if (request.method === 'GET') {
          return sendJson((await readDaily()) || emptyDaily());
        }

        if (request.method === 'POST') {
          requireAdmin(request);
          const body = await readJsonBody(request);
          const snapshot = (await readSnapshot()) || (await refresh());
          const manualLinks = await readManualLinks();
          const daily = buildDaily({
            snapshot,
            manualLinks,
            selectedIds: Array.isArray(body.selectedIds) ? body.selectedIds : []
          });
          await writeDaily(daily);
          return sendJson(daily);
        }
      }

      if (url.pathname === '/api/daily/push' && request.method === 'POST') {
        requireAdmin(request);
        const daily = (await readDaily()) || emptyDaily();
        const result = await pushWeComDaily(daily, request);
        return sendJson(result);
      }

      if (url.pathname === '/api/manual-links') {
        requireAdmin(request);

        if (request.method === 'GET') {
          return sendJson(await readManualLinks());
        }

        if (request.method === 'POST') {
          const body = await readJsonBody(request);
          const links = await readManualLinks();
          const item = createManualLink(body);
          links.unshift(item);
          await writeManualLinks(links.slice(0, 100));
          return sendJson(item);
        }

        if (request.method === 'DELETE') {
          await writeManualLinks([]);
          return sendJson({ ok: true });
        }
      }

      if (url.pathname === '/api/manual-links/parse' && request.method === 'POST') {
        requireAdmin(request);
        const body = await readJsonBody(request);
        const parsed = await parseManualLink(body.input || body.url || '');
        return sendJson(parsed);
      }

      if (url.pathname === '/health') {
        return sendJson({ ok: true });
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return sendJson({ error: error.message || 'Unexpected server error' }, error.statusCode || 500);
    }
  },

  async scheduled(_event, env, ctx) {
    configureRuntime(env);
    ctx.waitUntil(refresh().catch((error) => console.warn(`Scheduled trend refresh failed: ${error.message}`)));
  }
};

function configureRuntime(env) {
  process.env = {
    ...process.env,
    ...Object.fromEntries(Object.entries(env).filter(([, value]) => typeof value === 'string'))
  };
  setStoreAdapter(createD1Store(env.DB));
}

function createD1Store(db) {
  return {
    async readJson(key, fallback) {
      await ensureSchema(db);
      const row = await db.prepare('SELECT value FROM app_state WHERE key = ?').bind(key).first();
      return row?.value ? JSON.parse(row.value) : fallback;
    },

    async writeJson(key, value) {
      await ensureSchema(db);
      await db
        .prepare(
          `INSERT INTO app_state (key, value, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        )
        .bind(key, JSON.stringify(value), new Date().toISOString())
        .run();
    }
  };
}

async function ensureSchema(db) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    )
    .run();
}

async function refresh() {
  if (!refreshPromise) {
    refreshPromise = collectTrends().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function sendJson(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}

async function readJsonBody(request) {
  const raw = await request.text();
  if (raw.length > 1024 * 1024) throw statusError(413, '请求内容太大。');
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw statusError(400, '请求 JSON 格式不正确。');
  }
}

function requireAdmin(request) {
  if (!isAdmin(request)) throw statusError(401, '需要管理员密码。');
}

function isAdmin(request) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;

  const token = parseCookies(request.headers.get('Cookie') || '')[ADMIN_COOKIE];
  if (!token) return false;

  const [expiresAt, signature] = token.split('.');
  if (!expiresAt || !signature || Number(expiresAt) < Date.now()) return false;

  const expected = signAdminSession(expiresAt);
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function adminCookie() {
  const expiresAt = String(Date.now() + ADMIN_SESSION_HOURS * 60 * 60 * 1000);
  const token = `${expiresAt}.${signAdminSession(expiresAt)}`;
  return `${ADMIN_COOKIE}=${token}; Path=/; Max-Age=${ADMIN_SESSION_HOURS * 60 * 60}; HttpOnly; SameSite=Lax; Secure`;
}

function signAdminSession(expiresAt) {
  return crypto.createHmac('sha256', process.env.ADMIN_PASSWORD || '').update(expiresAt).digest('base64url');
}

function parseCookies(cookieHeader) {
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((part) => part.trim().split('='))
      .filter(([key, value]) => key && value)
  );
}

function statusError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function emptyDaily() {
  return {
    date: new Date().toISOString().slice(0, 10),
    updatedAt: '',
    selectedIds: [],
    itemCount: 0,
    manualCount: 0,
    platformCount: 0,
    items: [],
    sections: [],
    summary: '今日日报还没有选择热点。'
  };
}

async function pushWeComDaily(daily, request) {
  const webhook = process.env.WECOM_BOT_WEBHOOK;
  if (!webhook) throw statusError(503, '服务器还没有配置 WECOM_BOT_WEBHOOK。');

  const dailyUrl = process.env.PUBLIC_DAILY_URL || `${new URL(request.url).origin}/daily.html`;
  const content = [`**今日热点日报已更新**`, `日期：${daily.date || new Date().toISOString().slice(0, 10)}`, '', `[查看日报](${dailyUrl})`].join('\n');

  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'markdown',
      markdown: { content }
    })
  });

  const text = await response.text();
  if (!response.ok) throw statusError(502, `企业微信推送失败：${response.status} ${text}`);
  return { ok: true, message: '企业微信日报链接已推送。' };
}
