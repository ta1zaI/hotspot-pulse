const { execFile } = require('node:child_process');

// System curl can use the local network configuration when Node's TLS connection fails.
async function requestText(url, { method = 'GET', headers = {}, body } = {}, timeoutMs = 8000) {
  try {
    const response = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
    const text = await response.text();
    return checkedResponse(response.status, text);
  } catch (error) {
    if (error.httpStatus) throw error;
    return requestWithCurl(url, { method, headers, body }, timeoutMs);
  }
}

function checkedResponse(status, text) {
  if (status < 200 || status >= 300) {
    const error = new Error(`Source request failed (HTTP ${status})`);
    error.httpStatus = status;
    throw error;
  }
  if (!text.trim()) throw Object.assign(new Error('Source returned an empty response'), { httpStatus: status });
  return text;
}

function requestWithCurl(url, { method, headers, body }, timeoutMs) {
  return new Promise((resolve, reject) => {
    // Pass configuration through stdin so credentials are not exposed in process arguments.
    const config = [
      `url = ${JSON.stringify(url)}`,
      `request = ${JSON.stringify(method)}`,
      ...Object.entries(headers).map(([name, value]) => `header = ${JSON.stringify(`${name}: ${value}`)}`),
      ...(body === undefined ? [] : [`data-binary = ${JSON.stringify(body)}`])
    ].join('\n');
    const child = execFile('curl', [
      '--config', '-', '--silent', '--show-error',
      '--max-time', String(Math.ceil(timeoutMs / 1000)), '--write-out', '\n%{http_code}'
    ], { timeout: timeoutMs + 2000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
      if (error) {
        reject(new Error(`Source network request failed (${error.code || 'curl'})`));
        return;
      }
      const separator = stdout.lastIndexOf('\n');
      try { resolve(checkedResponse(Number(stdout.slice(separator + 1)), stdout.slice(0, separator))); }
      catch (responseError) { reject(responseError); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(config);
  });
}

async function requestJson(url, options, timeoutMs) {
  return JSON.parse(await requestText(url, options, timeoutMs));
}

module.exports = { requestText, requestJson };
