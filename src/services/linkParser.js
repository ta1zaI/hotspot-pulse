const { decodeHtmlEntities, fetchWithTimeout, nowIso } = require('../connectors/shared');
const { categoryLabel, hostFromUrl } = require('./daily');

async function parseManualLink(rawInput) {
  const originalInput = String(rawInput || '').trim();
  const url = extractUrl(originalInput);

  if (!url) {
    throw new Error('没有识别到有效链接。请粘贴分享文案里的 http 或 https 链接。');
  }

  const response = await fetchWithTimeout(
    url,
    {
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'
      }
    },
    16000
  );

  const finalUrl = response.url || url;
  const html = response.ok ? await response.text() : '';
  const meta = html ? extractMetadata(html, finalUrl) : {};
  const sourceLabel = inferSourceLabel(finalUrl, meta.siteName);

  return {
    url: finalUrl,
    title: meta.title || '',
    summary: meta.description || '',
    image: meta.image || '',
    sourceLabel,
    category: 'general',
    categoryLabel: categoryLabel('general'),
    capturedAt: nowIso(),
    parseStatus: meta.title ? 'ok' : 'partial',
    message: meta.title ? '已读取公开网页信息。' : '没有稳定抓到标题，可以手动补充后保存。'
  };
}

function extractUrl(value) {
  const match = String(value).match(/https?:\/\/[^\s"'<>，。；、)）]+/i);
  if (!match) return '';
  return match[0].replace(/[.,;!?]+$/, '');
}

function extractMetadata(html, url) {
  const title =
    readMeta(html, 'property', 'og:title') ||
    readMeta(html, 'name', 'twitter:title') ||
    readTitle(html);
  const description =
    readMeta(html, 'property', 'og:description') ||
    readMeta(html, 'name', 'description') ||
    readMeta(html, 'name', 'twitter:description');
  const image =
    readMeta(html, 'property', 'og:image') ||
    readMeta(html, 'name', 'twitter:image') ||
    '';
  const siteName = readMeta(html, 'property', 'og:site_name') || hostFromUrl(url);

  return {
    title: cleanText(title, 72),
    description: cleanText(description, 82),
    image: normalizeUrl(image, url),
    siteName: cleanText(siteName, 40)
  };
}

function readMeta(html, attr, attrValue) {
  const escaped = attrValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<meta[^>]+${attr}=["']${escaped}["'][^>]*>`, 'i');
  const tag = html.match(pattern)?.[0] || '';
  return readAttribute(tag, 'content');
}

function readTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1] : '';
}

function readAttribute(tag, attr) {
  const match = tag.match(new RegExp(`${attr}=["']([\\s\\S]*?)["']`, 'i'));
  return match ? match[1] : '';
}

function cleanText(value, limit = 120) {
  const text = decodeHtmlEntities(String(value || '').replace(/\s+/g, ' ').trim());
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function normalizeUrl(value, base) {
  if (!value) return '';
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

function inferSourceLabel(url, siteName) {
  const host = hostFromUrl(url);
  if (/douyin\.com|iesdouyin\.com/.test(host)) return '抖音';
  if (/xiaohongshu\.com|xhslink\.com/.test(host)) return '小红书';
  if (/bilibili\.com|b23\.tv/.test(host)) return 'B站';
  if (/youtube\.com|youtu\.be/.test(host)) return 'YouTube';
  return siteName || host || '手动添加';
}

module.exports = {
  extractUrl,
  parseManualLink
};
