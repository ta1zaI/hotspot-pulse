const http = require('http');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { loadEnv } = require('./services/env');

loadEnv();

const { collectTrends } = require('./services/collector');
const {
  listDailyHistory,
  readDaily,
  readDailyHistory,
  readManualLinks,
  readSnapshot,
  writeDailyHistory,
  writeDaily,
  writeManualLinks
} = require('./services/store');
const { buildDaily, createManualLink } = require('./services/daily');
const { parseManualLink } = require('./services/linkParser');

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '';
const REFRESH_INTERVAL_MINUTES = Number(process.env.REFRESH_INTERVAL_MINUTES || 30);
const DAILY_HISTORY_RETENTION_DAYS = Number(process.env.DAILY_HISTORY_RETENTION_DAYS || 365);
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const ADMIN_COOKIE = 'hp_admin';
const ADMIN_SESSION_HOURS = 12;
let refreshPromise = null;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/api/trends') {
      const snapshot = (await readSnapshot()) || (await refresh());
      return sendJson(res, 200, snapshot);
    }

    if (url.pathname === '/api/refresh' && req.method === 'POST') {
      const snapshot = await readSnapshot();
      if (snapshot) {
        const status = refreshPromise ? 'already-running' : 'started';
        refreshInBackground();
        return sendJson(res, 200, {
          ...snapshot,
          refreshStatus: status,
          refreshRequestedAt: new Date().toISOString()
        });
      }

      const freshSnapshot = await refresh();
      return sendJson(res, 200, freshSnapshot);
    }

    if (url.pathname === '/api/admin/session') {
      return sendJson(res, 200, { authenticated: isAdmin(req) });
    }

    if (url.pathname === '/api/admin/login' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!process.env.ADMIN_PASSWORD) {
        return sendJson(res, 503, { error: '服务器还没有配置 ADMIN_PASSWORD。' });
      }
      if (String(body.password || '') !== process.env.ADMIN_PASSWORD) {
        return sendJson(res, 401, { error: '管理员密码不正确。' });
      }

      setAdminCookie(res);
      return sendJson(res, 200, { authenticated: true });
    }

    if (url.pathname === '/api/admin/logout' && req.method === 'POST') {
      clearAdminCookie(res);
      return sendJson(res, 200, { authenticated: false });
    }

    if (url.pathname === '/api/daily') {
      if (req.method === 'GET') {
        const date = url.searchParams.get('date');
        if (date) {
          return sendJson(res, 200, (await readDailyHistory(date)) || emptyDaily(date));
        }

        return sendJson(res, 200, (await readDaily()) || emptyDaily());
      }

      if (req.method === 'POST') {
        requireAdmin(req);
        const body = await readJsonBody(req);
        const snapshot = (await readSnapshot()) || (await refresh());
        const manualLinks = await readManualLinks();
        const daily = buildDaily({
          snapshot,
          manualLinks,
          selectedIds: Array.isArray(body.selectedIds) ? body.selectedIds : []
        });
        await writeDaily(daily);
        return sendJson(res, 200, daily);
      }
    }

    if (url.pathname === '/api/daily/archive' && req.method === 'POST') {
      requireAdmin(req);
      const daily = (await readDaily()) || emptyDaily();
      await writeDailyHistory(daily, DAILY_HISTORY_RETENTION_DAYS);
      return sendJson(res, 200, {
        ok: true,
        date: daily.date,
        message: `已保存 ${daily.date} 的历史日报。`
      });
    }

    if (url.pathname === '/api/daily-history') {
      return sendJson(res, 200, {
        retentionDays: DAILY_HISTORY_RETENTION_DAYS,
        entries: await listDailyHistory()
      });
    }

    if (url.pathname === '/api/daily/push' && req.method === 'POST') {
      requireAdmin(req);
      const body = await readJsonBody(req);
      const daily = (await readDaily()) || emptyDaily();
      const result = await pushFeishuDaily(daily, req, body.target);
      return sendJson(res, 200, result);
    }

    if (url.pathname === '/api/manual-links') {
      requireAdmin(req);

      if (req.method === 'GET') {
        return sendJson(res, 200, await readManualLinks());
      }

      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        const links = await readManualLinks();
        const item = createManualLink(body);
        links.unshift(item);
        await writeManualLinks(links.slice(0, 100));
        return sendJson(res, 200, item);
      }

      if (req.method === 'DELETE') {
        await writeManualLinks([]);
        return sendJson(res, 200, { ok: true });
      }
    }

    if (url.pathname === '/api/manual-links/parse' && req.method === 'POST') {
      requireAdmin(req);
      const body = await readJsonBody(req);
      const parsed = await parseManualLink(body.input || body.url || '');
      return sendJson(res, 200, parsed);
    }

    if (url.pathname === '/health') {
      return sendJson(res, 200, { ok: true });
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error.message || 'Unexpected server error'
    });
  }
});

async function refresh() {
  if (!refreshPromise) {
    refreshPromise = collectTrends().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function refreshInBackground() {
  refresh().catch((error) => {
    console.warn(`Background trend refresh failed: ${error.message}`);
  });
}

async function serveStatic(requestPath, res) {
  const safePath = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendText(res, 403, 'Forbidden');
  }

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType =
      {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml'
      }[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(file);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return sendText(res, 404, 'Not found');
    }
    throw error;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

function sendText(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
    if (Buffer.concat(chunks).length > 1024 * 1024) {
      throw statusError(413, '请求内容太大。');
    }
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw statusError(400, '请求 JSON 格式不正确。');
  }
}

function requireAdmin(req) {
  if (!isAdmin(req)) {
    throw statusError(401, '需要管理员密码。');
  }
}

function isAdmin(req) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;

  const token = parseCookies(req.headers.cookie || '')[ADMIN_COOKIE];
  if (!token) return false;

  const [expiresAt, signature] = token.split('.');
  if (!expiresAt || !signature || Number(expiresAt) < Date.now()) return false;

  const expected = signAdminSession(expiresAt);
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function setAdminCookie(res) {
  const expiresAt = String(Date.now() + ADMIN_SESSION_HOURS * 60 * 60 * 1000);
  const token = `${expiresAt}.${signAdminSession(expiresAt)}`;
  res.setHeader(
    'Set-Cookie',
    `${ADMIN_COOKIE}=${token}; Path=/; Max-Age=${ADMIN_SESSION_HOURS * 60 * 60}; HttpOnly; SameSite=Lax`
  );
}

function clearAdminCookie(res) {
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
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

function emptyDaily(date = new Date().toISOString().slice(0, 10)) {
  return {
    date,
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

async function pushFeishuDaily(daily, req, target = 'prod') {
  const channel = target === 'test' ? 'test' : 'prod';
  const webhookEnv = channel === 'test' ? 'FEISHU_TEST_BOT_WEBHOOK' : 'FEISHU_BOT_WEBHOOK';
  const webhook = process.env[webhookEnv];
  if (!webhook) {
    throw statusError(503, `服务器还没有配置 ${webhookEnv}。`);
  }

  const dailyUrl = process.env.PUBLIC_DAILY_URL || `${originFromRequest(req)}/daily.html`;
  const channelLabel = channel === 'test' ? '测试群' : '正式群';
  const dailyDate = daily.date || new Date().toISOString().slice(0, 10);

  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msg_type: 'post',
      content: {
        post: {
          zh_cn: {
            title: '今日热点日报已更新',
            content: [
              [{ tag: 'text', text: `日期：${dailyDate}` }],
              [{ tag: 'a', text: '查看日报', href: dailyUrl }]
            ]
          }
        }
      }
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw statusError(502, `飞书${channelLabel}推送失败：${response.status} ${text}`);
  }

  try {
    const payload = JSON.parse(text);
    if (payload.code && payload.code !== 0) {
      throw statusError(502, `飞书${channelLabel}推送失败：${payload.msg || text}`);
    }
  } catch (error) {
    if (error.statusCode) throw error;
  }

  return { ok: true, target: channel, message: `飞书日报链接已推送到${channelLabel}。` };
}

function originFromRequest(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers.host}`;
}

server.listen(PORT, HOST || undefined, async () => {
  const hostLabel = HOST || 'localhost';
  console.log(`Hotspot Pulse is running at http://${hostLabel}:${PORT}`);
  try {
    await refresh();
    console.log('Initial trend snapshot generated.');
  } catch (error) {
    console.warn(`Initial trend snapshot failed: ${error.message}`);
  }

  setInterval(
    () => {
      refresh().catch((error) => {
        console.warn(`Scheduled trend refresh failed: ${error.message}`);
      });
    },
    Math.max(1, REFRESH_INTERVAL_MINUTES) * 60 * 1000
  );
});
