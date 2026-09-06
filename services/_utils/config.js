const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'data', 'config.json');

const DEFAULT_CONFIG = {
  backendPort: 8081,
  dataDir: path.join(PROJECT_ROOT, 'data', 'user-data'),
  musicDir: path.join(PROJECT_ROOT, 'data', 'music'),
  tempDir: path.join(PROJECT_ROOT, 'data', 'temp')
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('[Config] Failed to load, using defaults:', e.message);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('[Config] Save failed:', e.message);
    return false;
  }
}

function ensureDirs(config) {
  [config.dataDir, config.musicDir, config.tempDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

module.exports = { loadConfig, saveConfig, ensureDirs, DEFAULT_CONFIG };
