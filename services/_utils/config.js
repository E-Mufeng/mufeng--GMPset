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

// ───────────────────────────────────────────────────────────
// 内置工具配置：统一从 data/config.json 的 builtinTools 读取
// （绝不硬编码密钥；缺失时回退到环境变量，再回退到公开默认值）
// 每次调用都实时读取配置文件，使前端 UI 修改无需重启即生效。
// ───────────────────────────────────────────────────────────
function getWritingConfig() {
  const main = loadConfig();
  const bw = (main.builtinTools && main.builtinTools.writing) || {};
  return {
    // 真实密钥仅在本地 data/config.json 或环境变量中，不进源码/仓库
    apiKey: bw.apiKey || process.env.DEEPSEEK_API_KEY || '',
    api: bw.api || 'https://api.deepseek.com/v1/chat/completions',
    balanceApi: bw.balanceApi || 'https://api.deepseek.com/user/balance',
    model: bw.model || 'deepseek-chat'
  };
}

function getMusicConfig() {
  const main = loadConfig();
  const bm = (main.builtinTools && main.builtinTools.music) || {};
  return {
    // 留空则使用内置默认第三方音源代理；可填自备代理地址
    apiUrl: bm.apiUrl || '',
    // 默认搜索音源平台：tencent / kugou / kuwo / baidu
    source: bm.source || 'tencent',
    // 可选：VIP 账号 Cookie，用于提升部分音源可用性与音质
    cookie: bm.cookie || ''
  };
}

module.exports = { loadConfig, saveConfig, ensureDirs, getWritingConfig, getMusicConfig, DEFAULT_CONFIG };
