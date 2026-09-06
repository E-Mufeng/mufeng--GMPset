'use strict';
// 聚创台 · 通用真实路由挂载服务
// 直接 require 并挂载工具箱(工具箱 :8081) backend/routes/<TOOL>.js 真实路由模块，
// 零重写、不丢功能。每个工具独占一个端口，由 聚创台统一启动/停止/健康检查。
//
// 支持：
//   MOUNT_ROUTES  - 逗号分隔的路由名列表（默认取 MOUNT_TOOL）
//   MOUNT_PATHS   - 与 ROUTES 对齐的挂载前缀（默认 /api/<route>）
//   MOUNT_STATIC_PATH / MOUNT_STATIC_DIR - 可选：挂载一个静态目录（如阅读室下载目录）
// 依赖解析：所有依赖由本项目 package.json 管理，不再依赖外部 novel-engine。
// 路由模块统一从 services/_routes 加载，工具专有工具/引擎后续对接时放入本项目内。

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const TOOL = process.env.MOUNT_TOOL;
const PORT = parseInt(process.env.MOUNT_PORT || '0', 10);
const ROUTES = (process.env.MOUNT_ROUTES || TOOL || 'x')
  .split(',').map(s => s.trim()).filter(Boolean);
const PATHS = (process.env.MOUNT_PATHS || '')
  .split(',').map(s => s.trim());
const STATIC_PATH = process.env.MOUNT_STATIC_PATH || '';
const STATIC_DIR = process.env.MOUNT_STATIC_DIR || '';

if (!TOOL || !PORT || ROUTES.length === 0) {
  console.error('[mount] 配置无效: TOOL=' + TOOL + ' PORT=' + PORT + ' ROUTES=' + JSON.stringify(ROUTES));
  process.exit(1);
}

// 让挂载模块内部的「自调用」（如 music 的 download 经 config.backendPort 回源 playurl）
// 指向本挂载端口，使每个挂载服务独立自洽。仅在内存中补丁本进程的 loadConfig。
try {
  const configUtil = require('../_utils/config');
  if (configUtil && typeof configUtil.loadConfig === 'function') {
    const _orig = configUtil.loadConfig;
    configUtil.loadConfig = function () {
      const c = _orig.apply(this, arguments);
      c.backendPort = PORT;
      return c;
    };
  }
} catch (e) {
  console.warn('[mount] 无法补丁 loadConfig（不影响启动）: ' + (e && e.message));
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// 解析单个路由模块文件（全部本地化，不再依赖外部 novel-engine）
function resolveRouteFile(name) {
  const routesDir = path.join(__dirname, '..', '_routes');
  return path.join(routesDir, name + '.js');
}

let mounted = 0;
for (let i = 0; i < ROUTES.length; i++) {
  const name = ROUTES[i];
  const file = resolveRouteFile(name);
  if (!fs.existsSync(file)) {
    console.error('[mount] 路由文件不存在: ' + file);
    process.exit(1);
  }
  let mod;
  try {
    mod = require(file);
  } catch (e) {
    console.error('[mount] 加载路由失败: ' + file);
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
  }
  // writing-engine 等模块以 { router } 形式导出
  const routeMod = (mod && mod.router) ? mod.router : mod;
  const mp = PATHS[i] || ('/api/' + name);

  // 注意：express.Router 本身也是 function（可调用），故必须先判「是否为 router（带 .use）」，
  // 再判「是否为 function(app) 自注册风格」，否则会把 router 误当函数执行而出错。
  if (routeMod && typeof routeMod.use === 'function') {
    app.use(mp, routeMod);
    console.log('[mount] 挂载 router: ' + mp + '  <- ' + name);
    mounted++;
  } else if (typeof routeMod === 'function') {
    // 自注册风格：函数直接接收 app，自行决定路由路径（忽略 mp）
    try { routeMod(app); }
    catch (e) { console.error('[mount] 路由自注册失败: ' + name, e); process.exit(1); }
    console.log('[mount] 自注册: ' + name + '  (prefix=' + mp + ')');
    mounted++;
  } else {
    console.error('[mount] 路由既不是 router 也不是 function(app): ' + name);
    process.exit(1);
  }
}

// 可选静态目录（如阅读室 /reading-downloads）
if (STATIC_PATH && STATIC_DIR && fs.existsSync(STATIC_DIR)) {
  app.use(STATIC_PATH, express.static(STATIC_DIR, { maxAge: 0 }));
  console.log('[mount] 静态目录: ' + STATIC_PATH + '  <- ' + STATIC_DIR);
}

if (mounted === 0) {
  console.error('[mount] 未挂载任何路由');
  process.exit(1);
}

// 健康检查 / 关闭（聚创台启动器与前端探测用）
app.get('/api/health', (req, res) => res.json({ ok: true, tool: TOOL, port: PORT, ts: Date.now() }));
app.post('/api/shutdown', (req, res) => {
  res.json({ ok: true });
  setTimeout(() => process.exit(0), 150);
});

app.listen(PORT, '127.0.0.1', () => {
  console.log('[mount:' + TOOL + '] 已挂载真实路由，监听 ' + PORT + '  routes=' + ROUTES.join(',') + '  共 ' + mounted + ' 个');
});
