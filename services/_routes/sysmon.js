'use strict';
// P0 占位路由：sysmon 工具箱原型已就绪，后端对接开发中
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => res.json({ ok: true, note: 'sysmon prototype ready' }));
router.get('/info', (req, res) => res.json({ ok: true, tool: 'sysmon', status: 'prototype' }));

module.exports = router;
