const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'trends.json');
const DAILY_FILE = path.join(DATA_DIR, 'daily.json');
const MANUAL_LINKS_FILE = path.join(DATA_DIR, 'manual-links.json');

async function readSnapshot() {
  try {
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
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
}

async function readJsonFile(filePath, fallback) {
  try {
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
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function readDaily() {
  return readJsonFile(DAILY_FILE, null);
}

async function writeDaily(daily) {
  await writeJsonFile(DAILY_FILE, daily);
}

async function readManualLinks() {
  return readJsonFile(MANUAL_LINKS_FILE, []);
}

async function writeManualLinks(links) {
  await writeJsonFile(MANUAL_LINKS_FILE, links);
}

module.exports = {
  readSnapshot,
  writeSnapshot,
  readDaily,
  writeDaily,
  readManualLinks,
  writeManualLinks
};
