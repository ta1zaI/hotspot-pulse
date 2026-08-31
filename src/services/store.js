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
    DAILY_HISTORY_DIR: path.join(dataDir, 'daily-history'),
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

async function writeDailyHistory(daily, retentionDays = 365) {
  const date = validDateString(daily?.date);
  if (!date) return;

  if (storeAdapter) {
    const history = await storeAdapter.readJson('daily-history', {});
    history[date] = daily;
    pruneDailyHistoryObject(history, retentionDays);
    return storeAdapter.writeJson('daily-history', history);
  }

  const { fs, path } = localModules();
  const { DAILY_HISTORY_DIR } = localPaths();
  await fs.mkdir(DAILY_HISTORY_DIR, { recursive: true });
  await writeJsonFile(path.join(DAILY_HISTORY_DIR, `${date}.json`), daily);
  await pruneDailyHistory(retentionDays);
}

async function readDailyHistory(date) {
  const safeDate = validDateString(date);
  if (!safeDate) return null;

  if (storeAdapter) {
    const history = await storeAdapter.readJson('daily-history', {});
    return history[safeDate] || null;
  }

  const { path } = localModules();
  const { DAILY_HISTORY_DIR } = localPaths();
  return readJsonFile(path.join(DAILY_HISTORY_DIR, `${safeDate}.json`), null);
}

async function readAllDailyHistory() {
  if (storeAdapter) {
    const history = await storeAdapter.readJson('daily-history', {});
    return Object.values(history).filter(Boolean).sort(sortDailyDesc);
  }

  const { fs, path } = localModules();
  const { DAILY_HISTORY_DIR } = localPaths();

  try {
    const files = await fs.readdir(DAILY_HISTORY_DIR);
    const entries = await Promise.all(
      files
        .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
        .map((file) => readJsonFile(path.join(DAILY_HISTORY_DIR, file), null))
    );
    return entries.filter(Boolean).sort(sortDailyDesc);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function listDailyHistory() {
  if (storeAdapter) {
    const history = await storeAdapter.readJson('daily-history', {});
    return Object.values(history).map(dailyHistorySummary).sort(sortHistoryDesc);
  }

  const { fs, path } = localModules();
  const { DAILY_HISTORY_DIR } = localPaths();

  try {
    const files = await fs.readdir(DAILY_HISTORY_DIR);
    const entries = await Promise.all(
      files
        .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
        .map(async (file) => {
          const daily = await readJsonFile(path.join(DAILY_HISTORY_DIR, file), null);
          return dailyHistorySummary(daily);
        })
    );
    return entries.filter(Boolean).sort(sortHistoryDesc);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function pruneDailyHistory(retentionDays = 365) {
  if (storeAdapter) {
    const history = await storeAdapter.readJson('daily-history', {});
    pruneDailyHistoryObject(history, retentionDays);
    return storeAdapter.writeJson('daily-history', history);
  }

  const { fs, path } = localModules();
  const { DAILY_HISTORY_DIR } = localPaths();
  const cutoff = retentionCutoffDate(retentionDays);

  try {
    const files = await fs.readdir(DAILY_HISTORY_DIR);
    await Promise.all(
      files
        .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
        .filter((file) => file.slice(0, 10) < cutoff)
        .map((file) => fs.unlink(path.join(DAILY_HISTORY_DIR, file)))
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
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

function validDateString(value) {
  const date = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

function dailyHistorySummary(daily) {
  const date = validDateString(daily?.date);
  if (!date) return null;

  return {
    date,
    updatedAt: daily.updatedAt || '',
    itemCount: daily.itemCount || 0,
    manualCount: daily.manualCount || 0,
    summary: daily.summary || ''
  };
}

function sortHistoryDesc(a, b) {
  return String(b.date).localeCompare(String(a.date));
}

function sortDailyDesc(a, b) {
  return String(b?.date || '').localeCompare(String(a?.date || ''));
}

function pruneDailyHistoryObject(history, retentionDays) {
  const cutoff = retentionCutoffDate(retentionDays);
  for (const date of Object.keys(history)) {
    if (!validDateString(date) || date < cutoff) {
      delete history[date];
    }
  }
}

function retentionCutoffDate(retentionDays) {
  const days = Math.max(1, Number(retentionDays) || 365);
  const date = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

module.exports = {
  setStoreAdapter,
  readSnapshot,
  readSourceCache,
  writeSnapshot,
  writeSourceCache,
  readDaily,
  writeDaily,
  writeDailyHistory,
  readDailyHistory,
  readAllDailyHistory,
  listDailyHistory,
  pruneDailyHistory,
  readManualLinks,
  writeManualLinks
};
