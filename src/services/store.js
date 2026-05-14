let storeAdapter = null;

function setStoreAdapter(adapter) {
  storeAdapter = adapter;
}

function localModules() {
  return {
    fs: require('fs/promises'),
    path: require('path')
  };
}

function localPaths() {
  const { path } = localModules();
  const dataDir = path.join(process.cwd(), 'data');
  return {
    DATA_FILE: path.join(dataDir, 'trends.json'),
    SOURCE_CACHE_FILE: path.join(dataDir, 'source-cache.json'),
    DAILY_FILE: path.join(dataDir, 'daily.json'),
    MANUAL_LINKS_FILE: path.join(dataDir, 'manual-links.json')
  };
}

async function readSnapshot() {
  if (storeAdapter) return storeAdapter.readJson('trends', null);

  const { DATA_FILE } = localPaths();
  try {
    const { fs } = localModules();
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeSnapshot(snapshot) {
  if (storeAdapter) return storeAdapter.writeJson('trends', snapshot);

  const { fs, path } = localModules();
  const { DATA_FILE } = localPaths();
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
}

async function readSourceCache() {
  if (storeAdapter) return storeAdapter.readJson('source-cache', {});

  const { SOURCE_CACHE_FILE } = localPaths();
  return readJsonFile(SOURCE_CACHE_FILE, {});
}

async function writeSourceCache(cache) {
  if (storeAdapter) return storeAdapter.writeJson('source-cache', cache);

  const { SOURCE_CACHE_FILE } = localPaths();
  await writeJsonFile(SOURCE_CACHE_FILE, cache);
}

async function readJsonFile(filePath, fallback) {
  try {
    const { fs } = localModules();
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

async function writeJsonFile(filePath, value) {
  const { fs, path } = localModules();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function readDaily() {
  if (storeAdapter) return storeAdapter.readJson('daily', null);

  const { DAILY_FILE } = localPaths();
  return readJsonFile(DAILY_FILE, null);
}

async function writeDaily(daily) {
  if (storeAdapter) return storeAdapter.writeJson('daily', daily);

  const { DAILY_FILE } = localPaths();
  await writeJsonFile(DAILY_FILE, daily);
}

async function readManualLinks() {
  if (storeAdapter) return storeAdapter.readJson('manual-links', []);

  const { MANUAL_LINKS_FILE } = localPaths();
  return readJsonFile(MANUAL_LINKS_FILE, []);
}

async function writeManualLinks(links) {
  if (storeAdapter) return storeAdapter.writeJson('manual-links', links);

  const { MANUAL_LINKS_FILE } = localPaths();
  await writeJsonFile(MANUAL_LINKS_FILE, links);
}

module.exports = {
  setStoreAdapter,
  readSnapshot,
  readSourceCache,
  writeSnapshot,
  writeSourceCache,
  readDaily,
  writeDaily,
  readManualLinks,
  writeManualLinks
};
