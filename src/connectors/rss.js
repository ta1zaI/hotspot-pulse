const { execFile } = require('child_process');
const { createTrend, fetchWithTimeout } = require('./shared');

async function fetchRssTrends({
  platform,
  region = 'cn',
  sources,
  category = 'gaming',
  limit = 30,
  sourceMessagePrefix = 'RSS source'
}) {
  const errors = [];

  for (const endpoint of sources) {
    try {
      const xml = await fetchRssText(endpoint);
      const rows = parseRssItems(xml);

      if (!rows.length) {
        throw new Error('RSS source returned no items.');
      }

      return rows.slice(0, limit).map((item, index) =>
        createTrend({
          platform,
          title: item.title,
          rank: index + 1,
          heat: null,
          url: item.link,
          region,
          category,
          tags: [platform, 'rss', category],
          summary: item.description,
          sourceType: 'rss',
          sourceMessage: `${sourceMessagePrefix}: ${endpoint}.`
        })
      );
    } catch (error) {
      errors.push(`${endpoint}: ${error.message}`);
    }
  }

  throw new Error(errors.join(' | '));
}

async function fetchRssText(endpoint) {
  try {
    const response = await fetchWithTimeout(
      endpoint,
      {
        headers: {
          Accept: 'application/rss+xml,text/xml,application/xml',
          'User-Agent': 'Mozilla/5.0'
        }
      },
      20000
    );

    if (!response.ok) {
      throw new Error(`RSS request failed with ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    return fetchRssTextWithCurl(endpoint, error);
  }
}

function fetchRssTextWithCurl(endpoint, originalError) {
  return new Promise((resolve, reject) => {
    execFile(
      'curl',
      [
        '--location',
        '--silent',
        '--show-error',
        '--max-time',
        '60',
        '--user-agent',
        'Mozilla/5.0',
        '--header',
        'Accept: application/rss+xml,text/xml,application/xml',
        endpoint
      ],
      { timeout: 70000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${originalError.message} | curl fallback failed: ${(stderr || error.message).trim()}`));
          return;
        }

        resolve(stdout);
      }
    );
  });
}

function parseRssItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => {
    const block = match[1];
    const title = decodeXml(readTag(block, 'title')).trim();
    const link = decodeXml(readTag(block, 'link')).trim();
    const description = decodeXml(stripTags(readTag(block, 'description'))).trim();

    return {
      title,
      link,
      description
    };
  }).filter((item) => item.title && item.link);
}

function readTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  if (!match) return '';
  return match[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
}

function stripTags(value = '') {
  return value.replace(/<[^>]+>/g, '');
}

function decodeXml(value = '') {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

module.exports = {
  fetchRssTrends
};
