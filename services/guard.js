// guard.js - DeepSeek API 成本防护层（Node 版，接入 writing-engine / proxy-server）
// 功能：余额熔断 + 输入 token 硬阈值 + 输出钳制 + 用量记账
// DeepSeek 成本防护层：熔断状态文件落在 聚创台本地 data/guard_state.json（无外部 ds_guard.py 依赖）
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const BASE = path.join(__dirname, '..');
const STATE_FILE = path.join(BASE, 'data', 'guard_state.json');
const USAGE_FILE = path.join(BASE, 'data', 'guard-usage.json');
const BALANCE_API = 'https://api.deepseek.com/user/balance';

// 阈值（可环境变量覆盖）
const MIN_BALANCE = parseFloat(process.env.DS_MIN_BALANCE || '1.0');
const BALANCE_TTL = parseInt(process.env.DS_BALANCE_TTL || '120', 10);
const MAX_INPUT_TOKENS = parseInt(process.env.DS_MAX_INPUT_TOKENS || '8000', 10);
const DEFAULT_MAX_OUTPUT = parseInt(process.env.DS_MAX_OUTPUT || '4096', 10);
const BLOCK_COOLDOWN = parseInt(process.env.DS_BLOCK_COOLDOWN || '600', 10);

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return {}; }
}
function saveState(state) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) {}
}

// 粗略 token 估算（与 Python 版一致：中文 1.5/字，其他 0.4/字符）
function countTokens(text) {
  if (!text) return 0;
  let chinese = 0;
  for (const ch of String(text)) {
    if (ch >= '\u4e00' && ch <= '\u9fff') chinese++;
  }
  return Math.round(chinese * 1.5 + (String(text).length - chinese) * 0.4);
}
function countMessagesTokens(messages) {
  let total = 0;
  for (const m of messages || []) {
    total += countTokens(m && m.content);
  }
  return total;
}

function getBalance(force) {
  return new Promise((resolve) => {
    const key = process.env.LOBSTER_APIKEY_DEEPSEEK || process.env.DEEPSEEK_API_KEY || '';
    if (!key) return resolve({ balance: null, ok: false });
    const state = loadState();
    const now = Date.now() / 1000;
    if (!force && state.balance != null && (now - (state.balance_cached_at || 0)) < BALANCE_TTL) {
      return resolve({ balance: parseFloat(state.balance), ok: true });
    }
    const req = https.get(BALANCE_API, {
      headers: { Authorization: 'Bearer ' + key },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          const bal = j.balance_infos && j.balance_infos[0] ? parseFloat(j.balance_infos[0].total_balance) : 0;
          state.balance = bal;
          state.balance_cached_at = now;
          saveState(state);
          resolve({ balance: bal, ok: !!j.is_available });
        } catch (e) { resolve({ balance: null, ok: false }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ balance: null, ok: false }); });
    req.on('error', () => resolve({ balance: null, ok: false }));
  });
}

async function checkBalanceGate() {
  const state = loadState();
  if (state.blocked_until && Date.now() / 1000 < state.blocked_until) {
    return { ok: false, reason: 'BALANCE_BLOCKED_COOLDOWN', balance: null };
  }
  const { balance, ok } = await getBalance(false);
  if (balance != null && balance < MIN_BALANCE) {
    state.blocked_until = Date.now() / 1000 + BLOCK_COOLDOWN;
    state.blocked_reason = 'balance_too_low';
    saveState(state);
    return { ok: false, reason: 'BALANCE_TOO_LOW:' + balance.toFixed(2), balance };
  }
  return { ok: true, reason: '', balance };
}

function fitMessages(messages, maxTokens) {
  if (!messages || !messages.length) return { messages, total: 0, truncated: false };
  const total = countMessagesTokens(messages);
  if (total <= maxTokens) return { messages, total, truncated: false };
  const budgetChars = Math.floor(maxTokens / 1.5); // 中文 1 字 ≈ 1.5 token，换算字符预算
  let remaining = budgetChars;
  const out = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = Object.assign({}, messages[i]);
    let content = m.content || '';
    if (remaining <= 0) content = '';
    else if (content.length > remaining) content = content.slice(0, remaining);
    remaining -= content.length;
    m.content = content;
    out.unshift(m);
  }
  return { messages: out, total: countMessagesTokens(out), truncated: true };
}

function clampMaxTokens(requested, ceiling) {
  const cap = ceiling || DEFAULT_MAX_OUTPUT;
  if (!requested) return cap;
  return Math.min(parseInt(requested, 10), cap);
}

function recordUsage(model, inputTokens, outputTokens, cacheHitTokens, task) {
  try {
    let entries = [];
    if (fs.existsSync(USAGE_FILE)) {
      entries = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8')).entries || [];
    }
    const cost = (inputTokens - cacheHitTokens) * 2.0 / 1e6 + cacheHitTokens * 0.5 / 1e6 + outputTokens * 8.0 / 1e6;
    entries.push({
      timestamp: new Date().toISOString(),
      model: model || 'deepseek-chat',
      input_tokens: inputTokens || 0,
      cache_hit_tokens: cacheHitTokens || 0,
      output_tokens: outputTokens || 0,
      total_tokens: (inputTokens || 0) + (outputTokens || 0),
      cost: Math.round(cost * 10000) / 10000,
      requests: 1,
      task: task || '',
      session: 'toolbox',
      source: 'guard-js'
    });
    entries = entries.slice(-2000);
    fs.mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
    fs.writeFileSync(USAGE_FILE, JSON.stringify({ entries }, null, 2), 'utf8');
  } catch (e) {}
}

async function guardedFetch(apiUrl, apiKey, body, opts) {
  // 统一成本防护封装：余额熔断 + 输入截断 + 输出钳制 + 用量记账
  // 返回 { ok, data, error }，data 为 DeepSeek 原始响应 JSON
  const gate = await checkBalanceGate();
  if (!gate.ok) {
    return { ok: false, error: 'BUDGET_BLOCKED: ' + gate.reason };
  }
  const b = JSON.parse(JSON.stringify(body));
  // 输入截断
  const fitted = fitMessages(b.messages, MAX_INPUT_TOKENS);
  if (fitted.truncated) {
    console.warn('[guard] 输入超限已截断: ≈' + countMessagesTokens(b.messages) + ' → ' + fitted.total + ' tokens');
    b.messages = fitted.messages;
  }
  // 输出钳制
  const ceiling = (opts && opts.maxOutputCeiling) || 8000;
  b.max_tokens = clampMaxTokens(b.max_tokens, ceiling);
  // 发送请求（带重试：429/5xx 重试 1 次）
  let lastErr = null;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify(b)
      });
      if (!r.ok) {
        const txt = (await r.text()).substring(0, 200);
        const st = r.status;
        if (st >= 400 && st < 500 && st !== 429) {
          return { ok: false, error: 'API ' + st + ': ' + txt };
        }
        lastErr = 'API ' + st + ': ' + txt;
        if (i === 0) {
          await new Promise(q => setTimeout(q, st === 429 ? 4000 : 2000));
          continue;
        }
        return { ok: false, error: lastErr };
      }
      const j = await r.json();
      recordUsage(b.model, j.usage && j.usage.prompt_tokens || 0, j.usage && j.usage.completion_tokens || 0, j.usage && j.usage.prompt_cache_hit_tokens || 0, (opts && opts.task) || 'writing-engine');
      return { ok: true, data: j };
    } catch (e) {
      lastErr = String(e.message || e);
      if (i === 0) { await new Promise(q => setTimeout(q, 2000)); }
    }
  }
  return { ok: false, error: lastErr || 'API call failed' };
}

module.exports = {
  MIN_BALANCE, BALANCE_TTL, MAX_INPUT_TOKENS, DEFAULT_MAX_OUTPUT, BLOCK_COOLDOWN,
  countTokens, countMessagesTokens, getBalance, checkBalanceGate,
  fitMessages, clampMaxTokens, recordUsage, guardedFetch
};

// CLI 自测：node guard.js
if (require.main === module) {
  (async () => {
    console.log('== guard.js 自测 ==');
    const { balance, ok } = await getBalance(true);
    console.log('余额查询:', balance, '| 可用:', ok);
    const g = await checkBalanceGate();
    console.log('熔断闸门:', g.ok ? '放行' : '拒绝(' + g.reason + ')');
    const msgs = [{ role: 'system', content: '你是助手' }, { role: 'user', content: '你好'.repeat(10000) }];
    const f = fitMessages(msgs, 2000);
    console.log('输入截断: 原token≈' + countMessagesTokens(msgs) + ' → 截断后≈' + f.total + ', 是否截断:' + f.truncated);
    console.log('输出钳制: clamp(12000)=' + clampMaxTokens(12000) + ', clamp(2048)=' + clampMaxTokens(2048) + ', clamp(None)=' + clampMaxTokens(null));
  })();
}
