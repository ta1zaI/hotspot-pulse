const nowIso = () => new Date().toISOString();

function createTrend({
  platform,
  title,
  rank,
  heat = null,
  url = '',
  region = 'global',
  category = 'general',
  tags = [],
  summary = '',
  sourceType = 'sample',
  sourceMessage = ''
}) {
  const cleanTitle = decodeHtmlEntities(title);
  const cleanSummary = decodeHtmlEntities(summary);

  return {
    id: `${platform}:${region}:${String(cleanTitle).toLowerCase().replace(/\s+/g, '-')}`,
    platform,
    title: cleanTitle,
    rank,
    heat,
    url,
    region,
    category,
    tags,
    summary: cleanSummary,
    sourceType,
    sourceMessage,
    capturedAt: nowIso()
  };
}

function decodeHtmlEntities(value = '') {
  let result = String(value);

  for (let index = 0; index < 3; index += 1) {
    const decoded = result
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));

    if (decoded === result) break;
    result = decoded;
  }

  return result;
}

function scoreRank(rank, total = 20) {
  const normalized = Math.max(0, total - rank + 1);
  return Math.round((normalized / total) * 100);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithPowerShell(url, headers = {}, timeoutMs = 25000) {
  let execFile;
  try {
    ({ execFile } = require('child_process'));
  } catch {
    return fetchWithTimeout(url, { headers }, timeoutMs);
  }

  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$headers = @{}
if ($env:FETCH_HEADERS_JSON) {
  $parsed = $env:FETCH_HEADERS_JSON | ConvertFrom-Json
  foreach ($prop in $parsed.PSObject.Properties) {
    $headers[$prop.Name] = [string]$prop.Value
  }
}
try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri $env:FETCH_URL -Headers $headers -TimeoutSec 20
  [PSCustomObject]@{
    status = [int]$response.StatusCode
    body = [string]$response.Content
  } | ConvertTo-Json -Compress
} catch [System.Net.WebException] {
  $status = 0
  $body = $_.Exception.Message
  if ($_.Exception.Response) {
    $status = [int]$_.Exception.Response.StatusCode
    $stream = $_.Exception.Response.GetResponseStream()
    if ($stream) {
      $reader = New-Object System.IO.StreamReader($stream)
      $body = $reader.ReadToEnd()
    }
  }
  [PSCustomObject]@{
    status = $status
    body = [string]$body
  } | ConvertTo-Json -Compress
}
`;

  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        timeout: timeoutMs,
        windowsHide: true,
        env: {
          ...process.env,
          FETCH_URL: url,
          FETCH_HEADERS_JSON: JSON.stringify(headers)
        },
        maxBuffer: 10 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error((stderr || error.message).trim()));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve({
            ok: result.status >= 200 && result.status < 300,
            status: result.status,
            async text() {
              return result.body;
            },
            async json() {
              return JSON.parse(result.body);
            }
          });
        } catch (parseError) {
          reject(parseError);
        }
      }
    );
  });
}

function sourceMessage(item) {
  return item?.sourceMessage || '';
}

module.exports = {
  createTrend,
  decodeHtmlEntities,
  fetchJsonWithPowerShell,
  fetchWithTimeout,
  nowIso,
  scoreRank,
  sourceMessage
};
