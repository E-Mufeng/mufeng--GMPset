'use strict';
// 桥接：novel-engine 的 writing-engine 是「模块」（backend/writing-engine/index.js，导出 router），
// 而非 routes/ 下的独立路由文件。这里把它挂到 /api/writing/engine。
const engine = require('../writing-engine');
module.exports = engine.router || engine;
