// 内置工具后端配置（兼容层）
// 所有敏感参数统一从 data/config.json 的 builtinTools 读取，或由环境变量提供，
// 绝不在此文件硬编码任何密钥 / Token / 个人路径。
//
// 历史：早期版本曾把 DeepSeek API Key 写死在此处，已废弃。现在密钥只存在于
//   - 本地 data/config.json（已被 .gitignore 排除，不进仓库），或
//   - 进程环境变量（如 DEEPSEEK_API_KEY）
// 通过前端「设置 → 内置工具」即可在 UI 内填写，无需手改文件。

const { getWritingConfig, getMusicConfig, loadConfig } = require('./_utils/config');

// 兼容旧式 `config.DEEPSEEK_API_KEY` 取值（改为实时 getter，避免模块加载时缓存空值）
const shim = {
  getWritingConfig,
  getMusicConfig,
  loadConfig,
  get DEEPSEEK_API_KEY() { return getWritingConfig().apiKey; },
  get DEEPSEEK_API() { return getWritingConfig().api; },
  get DEEPSEEK_BALANCE_API() { return getWritingConfig().balanceApi; }
};

module.exports = shim;
