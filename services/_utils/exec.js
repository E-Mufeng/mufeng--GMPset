'use strict';
// 聚创台 · 轻量命令执行工具（本地化自 novel-engine utils/exec）
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * 执行 shell 命令，返回 stdout。
 * @param {string} cmd 命令
 * @param {object} [opts] exec 选项
 * @returns {Promise<string>} stdout
 */
async function execCmd(cmd, opts) {
  const { stdout } = await execAsync(cmd, Object.assign({ windowsHide: true, maxBuffer: 1024 * 1024 * 50 }, opts || {}));
  return stdout;
}

module.exports = { execCmd, execAsync };
