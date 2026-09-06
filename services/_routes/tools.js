const express = require('express');
const router = express.Router();
const os = require('os');
const { execSync, exec } = require('child_process');
const util = require('util');

// ───────── Network Tools ─────────

// Ping
router.get('/network/ping', (req, res) => {
    const { host, count } = req.query;
    if (!host) return res.status(400).json({ error: 'host required' });
    const c = parseInt(count) || 4;
    try {
        const out = execSync(`ping -n ${c} ${host.replace(/[;&|]/g,'')}`, { encoding: 'utf8', timeout: 30000 });
        const lines = out.split('\n').filter(l => l.trim());
        res.json({ success: true, host, count: c, output: lines });
    } catch (e) {
        res.json({ success: true, host, count: c, output: (e.stdout || '').split('\n').filter(l => l.trim()), error: e.message });
    }
});

// Traceroute
router.get('/network/tracert', (req, res) => {
    const { host } = req.query;
    if (!host) return res.status(400).json({ error: 'host required' });
    try {
        const out = execSync(`tracert -h 15 ${host.replace(/[;&|]/g,'')}`, { encoding: 'utf8', timeout: 30000 });
        res.json({ success: true, host, output: out.split('\n').filter(l => l.trim()) });
    } catch (e) {
        res.json({ success: false, host, output: (e.stdout || '').split('\n').filter(l => l.trim()), error: e.message });
    }
});

// DNS Lookup
router.get('/network/dns', (req, res) => {
    const { host } = req.query;
    if (!host) return res.status(400).json({ error: 'host required' });
    try {
        const out = execSync(`nslookup ${host.replace(/[;&|]/g,'')}`, { encoding: 'utf8', timeout: 10000 });
        const lines = out.split('\n').filter(l => l.trim());
        // Extract IPs
        const ips = lines.filter(l => l.includes('Address:') || l.match(/\d+\.\d+\.\d+\.\d+/)).map(l => l.trim());
        res.json({ success: true, host, output: lines, addresses: ips });
    } catch (e) {
        res.json({ success: false, host, output: (e.stdout || '').split('\n').filter(l => l.trim()), error: e.message });
    }
});

// Port Status Check
router.get('/network/port', (req, res) => {
    const { host, port } = req.query;
    if (!host || !port) return res.status(400).json({ error: 'host and port required' });
    const portNum = parseInt(port);
    try {
        const out = execSync(`powershell -Command "try { \$c=New-Object System.Net.Sockets.TcpClient; \$c.ConnectAsync('${host.replace(/[;&|']/g,'')}',${portNum}).Wait(3000); if(\$c.Connected){Write-Output 'OPEN'}else{Write-Output 'CLOSED'}; \$c.Dispose() } catch { Write-Output 'CLOSED' }"`, { encoding: 'utf8', timeout: 10000 }).trim();
        const isOpen = out.includes('OPEN');
        res.json({ success: true, host, port: portNum, status: isOpen ? 'OPEN' : 'CLOSED/FILTERED', open: isOpen });
    } catch (e) {
        res.json({ success: true, host, port: portNum, status: 'UNKNOWN', open: false, error: e.message });
    }
});

// HTTP Status Check
router.get('/network/http', (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url required' });
    try {
        const out = execSync(`curl.exe -s -o nul -w "%{http_code}|%{time_total}|%{size_download}" -L --max-time 10 ${url.replace(/[;&|]/g,'')}`, { encoding: 'utf8', timeout: 15000 }).trim();
        const parts = out.split('|');
        res.json({ success: true, url, httpCode: parseInt(parts[0]) || 0, timeSec: parseFloat(parts[1]) || 0, sizeBytes: parseInt(parts[2]) || 0 });
    } catch (e) {
        res.json({ success: false, url, error: e.message });
    }
});

// ───────── Text & Code Tools ─────────

// JSON Format/Validate
router.post('/text/json', (req, res) => {
    const { input, action } = req.body;
    if (!input) return res.status(400).json({ error: 'input required' });
    try {
        if (action === 'minify') {
            const parsed = JSON.parse(input);
            res.json({ success: true, output: JSON.stringify(parsed), valid: true });
        } else {
            const parsed = JSON.parse(input);
            res.json({ success: true, output: JSON.stringify(parsed, null, 2), valid: true });
        }
    } catch (e) {
        res.json({ success: false, output: '❌ JSON 解析失败: ' + e.message, valid: false, error: e.message });
    }
});

// Base64 Encode/Decode
router.post('/text/base64', (req, res) => {
    const { input, action } = req.body;
    if (!input) return res.status(400).json({ error: 'input required' });
    try {
        if (action === 'decode') {
            const decoded = Buffer.from(input, 'base64').toString('utf8');
            res.json({ success: true, output: decoded });
        } else {
            const encoded = Buffer.from(input, 'utf8').toString('base64');
            res.json({ success: true, output: encoded });
        }
    } catch (e) {
        res.json({ success: false, output: '❌ 转换失败: ' + e.message, error: e.message });
    }
});

// Regex Tester
router.post('/text/regex', (req, res) => {
    const { text, pattern, flags } = req.body;
    if (!text || !pattern) return res.status(400).json({ error: 'text and pattern required' });
    try {
        const regex = new RegExp(pattern, flags || 'g');
        const matches = [];
        let m;
        while ((m = regex.exec(text)) !== null) {
            matches.push({ index: m.index, match: m[0], groups: m.slice(1) });
            if (m.index === regex.lastIndex) regex.lastIndex++;
        }
        res.json({ success: true, matches, count: matches.length });
    } catch (e) {
        res.json({ success: false, error: '正则错误: ' + e.message });
    }
});

// Timestamp Converter
router.get('/text/timestamp', (req, res) => {
    const { value, type } = req.query;
    if (!value) return res.status(400).json({ error: 'value required' });
    try {
        let date;
        if (type === 'unix' || !type) {
            const ms = value.length <= 10 ? parseInt(value) * 1000 : parseInt(value);
            date = new Date(ms);
        } else {
            date = new Date(value);
        }
        if (isNaN(date.getTime())) {
            return res.json({ success: false, error: '无效的时间值' });
        }
        res.json({
            success: true,
            unix: Math.floor(date.getTime() / 1000),
            unixMs: date.getTime(),
            iso: date.toISOString(),
            local: date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
            utc: date.toUTCString(),
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            day: date.getDate(),
            hour: date.getHours(),
            minute: date.getMinutes(),
            second: date.getSeconds(),
            weekday: ['日','一','二','三','四','五','六'][date.getDay()]
        });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// URL Encode/Decode
router.post('/text/url', (req, res) => {
    const { input, action } = req.body;
    if (!input) return res.status(400).json({ error: 'input required' });
    try {
        if (action === 'decode') {
            res.json({ success: true, output: decodeURIComponent(input) });
        } else {
            res.json({ success: true, output: encodeURIComponent(input) });
        }
    } catch (e) {
        res.json({ success: false, output: '❌ 转换失败: ' + e.message });
    }
});

// ───────── System Tools ─────────

// System Info
router.get('/system/info', (req, res) => {
    try {
        const cpus = os.cpus();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        
        // Disk info (try wmic, fallback to node)
        let disks = [];
        try {
            const out = execSync('wmic logicaldisk get caption,size,freespace,volumename 2>&1', { encoding: 'utf8', timeout: 5000 });
            if (!out.includes('wmic') && !out.includes('���ڲ�')) {
                const lines = out.split('\n').filter(l => l.trim() && !l.includes('Caption'));
                disks = lines.map(l => {
                    const parts = l.trim().split(/\s+/);
                    return { drive: parts[0] || '', freeBytes: parseInt(parts[1]) || 0, totalBytes: parseInt(parts[2]) || 0, label: parts.slice(3).join(' ') || '' };
                }).filter(d => d.drive);
            }
        } catch {}
        // Fallback: get from OS drive info
        if (!disks.length) {
            try {
                const out = execSync('powershell -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free | ConvertTo-Json"', { encoding: 'utf8', timeout: 5000 });
                const json = JSON.parse(out);
                const arr = Array.isArray(json) ? json : [json];
                disks = arr.map(d => ({
                    drive: d.Name + ':',
                    freeBytes: d.Free || 0,
                    totalBytes: (d.Used || 0) + (d.Free || 0),
                    label: '',
                }));
            } catch {}
        }

        res.json({
            success: true,
            hostname: os.hostname(),
            platform: os.platform(),
            release: os.release(),
            arch: os.arch(),
            uptime: os.uptime(),
            cpu: {
                model: cpus[0]?.model || '',
                cores: cpus.length,
                speed: cpus[0]?.speed || 0,
                load: os.loadavg() || [0,0,0],
            },
            memory: {
                total: totalMem,
                free: freeMem,
                used: usedMem,
                percent: totalMem > 0 ? ((usedMem / totalMem) * 100).toFixed(1) : 0,
            },
            disks,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Process list
router.get('/system/processes', (req, res) => {
    try {
        const out = execSync('tasklist /fo csv /nh', { encoding: 'utf8', timeout: 5000 });
        const lines = out.split('\n').filter(l => l.trim());
        const processes = lines.map(l => {
            const parts = l.replace(/^"|"$/g,'').split('","');
            return { name: parts[0] || '', pid: parseInt(parts[1]) || 0, session: parts[2] || '', memKB: parseInt((parts[4]||'0').replace(/[^\d]/g,'')) || 0 };
        });
        res.json({ success: true, processes, total: processes.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Network stats
router.get('/system/network', (req, res) => {
    try {
        // Active connections
        const out1 = execSync('netstat -ano | findstr ESTABLISHED', { encoding: 'utf8', timeout: 5000 });
        const connections = out1.split('\n').filter(l => l.trim()).length;
        
        // Listening ports
        const out2 = execSync('netstat -ano | findstr LISTENING', { encoding: 'utf8', timeout: 5000 });
        const listening = out2.split('\n').filter(l => l.trim()).length;
        
        // Interfaces
        const interfaces = os.networkInterfaces();
        const ifaces = Object.entries(interfaces).map(([name, addrs]) => ({
            name, addresses: addrs.filter(a => !a.internal).map(a => ({ address: a.address, family: a.family, mac: a.mac }))
        })).filter(i => i.addresses.length > 0);

        res.json({ success: true, connections, listening, interfaces: ifaces });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Environment
router.get('/system/env', (req, res) => {
    try {
        const env = {};
        Object.keys(process.env).sort().forEach(k => { env[k] = process.env[k]; });
        const nodeV = process.version;
        const nodePath = process.execPath;
        res.json({ success: true, nodeVersion: nodeV, nodePath, envCount: Object.keys(env).length, env });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═════════ New: Hash Calculator ═════════
const crypto = require('crypto');

router.post('/text/hash', (req, res) => {
    const { input, algorithm } = req.body;
    if (!input) return res.status(400).json({ error: 'input required' });
    const alg = algorithm || 'md5';
    const supported = ['md5','sha1','sha256','sha512'];
    if (!supported.includes(alg)) return res.status(400).json({ error: 'unsupported algorithm, use: ' + supported.join(', ') });
    try {
        const hash = crypto.createHash(alg).update(input, 'utf8').digest('hex');
        res.json({ success: true, algorithm: alg, input, hash, upper: hash.toUpperCase() });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// ═════════ New: Password Generator ═════════
router.post('/text/password', (req, res) => {
    const { length, upper, lower, digits, special } = req.body;
    const len = Math.min(Math.max(parseInt(length) || 16, 4), 128);
    const sets = [];
    if (upper !== false) sets.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    if (lower !== false) sets.push('abcdefghijklmnopqrstuvwxyz');
    if (digits !== false) sets.push('0123456789');
    if (special !== false) sets.push('!@#$%^&*()_+-=[]{}|;:,.<>?');
    
    const allChars = sets.join('');
    if (!allChars) return res.json({ success: false, error: '至少选一个字符集' });
    
    let password = '';
    // Ensure at least one from each selected set
    for (const set of sets) {
        password += set[crypto.randomInt(set.length)];
    }
    // Fill the rest
    for (let i = password.length; i < len; i++) {
        password += allChars[crypto.randomInt(allChars.length)];
    }
    // Shuffle
    password = password.split('').sort(() => crypto.randomInt(3) - 1).join('');
    
    const entropy = Math.round(len * Math.log2(allChars.length));
    const strength = entropy >= 80 ? '非常强' : entropy >= 60 ? '强' : entropy >= 40 ? '中等' : '弱';
    
    res.json({ success: true, password, length: len, charset: allChars.length, entropy, strength });
});

// ═════════ New: Text Stats ═════════
router.post('/text/stats', (req, res) => {
    const { text } = req.body;
    if (!text && text !== '') return res.status(400).json({ error: 'text required' });
    const chars = text.length;
    const charsNoSpace = text.replace(/\s/g,'').length;
    const lines = text.split('\n').length;
    const words = text.trim() ? text.split(/\s+/).length : 0;
    const bytes = Buffer.byteLength(text, 'utf8');
    // CJK count
    const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
    const punctuation = (text.match(/[\u3000-\u303f\uff00-\uffef]/g) || []).length;
    const cjkTotal = cjk + punctuation;
    
    res.json({ success: true, chars, charsNoSpace, lines, words, bytes, cjk, punctuation, cjkTotal });
});

// ═════════ New: System Services ═════════
router.get('/system/services', (req, res) => {
    try {
        const out = execSync('sc.exe query type= service state= all', { encoding: 'utf8', timeout: 15000 });
        const lines = out.split('\n').filter(l => l.trim());
        const services = [];
        let current = { name: '', display: '', state: '', startType: '' };
        for (const line of lines) {
            const clean = line.replace(/\r/g,'');
            if (clean.startsWith('SERVICE_NAME: ')) {
                if (current.name) services.push(current);
                current = { name: clean.substring(14).trim(), display: '', state: '', startType: '' };
            } else if (clean.startsWith('DISPLAY_NAME: ')) {
                current.display = clean.substring(13).trim();
            } else if (clean.startsWith('        STATE')) {
                const s = clean.split(':')[1] || '';
                current.state = s.includes('RUNNING') ? 'RUNNING' : 'STOPPED';
            } else if (clean.startsWith('        START_TYPE')) {
                const t = clean.split(':')[1] || '';
                current.startType = t.includes('AUTO_START') ? '自动' : t.includes('DEMAND_START') ? '手动' : t.includes('DISABLED') ? '禁用' : '其他';
            }
        }
        if (current.name) services.push(current);
        res.json({ success: true, total: services.length, services });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═════════ New: GPU Info ═════════
router.get('/system/gpu', (req, res) => {
    try {
        let cards = [];
        try {
            const out = execSync('wmic path win32_videocontroller get caption,adapterram,driverversion,currenthorizontalresolution,currentverticalresolution,videoprocessor /format:csv 2>&1', { encoding: 'utf8', timeout: 5000 });
            const lines = out.split('\n').filter(l => l.trim() && !l.includes('wmic'));
            if (lines.length > 1) {
                cards = lines.slice(1).map(l => {
                    const parts = l.split(',');
                    return {
                        caption: (parts[1] || '').trim(),
                        adapterRam: parseInt(parts[2]) || 0,
                        driverVersion: (parts[3] || '').trim(),
                        hRes: parseInt(parts[4]) || 0,
                        vRes: parseInt(parts[5]) || 0,
                    };
                }).filter(c => c.caption && !c.caption.toLowerCase().includes('caption'));
            }
        } catch {}
        // Fallback: try dxdiag or just report N/A
        if (!cards.length) {
            cards = [{ caption: 'N/A (wmic 不可用)', adapterRam: 0, driverVersion: '', hRes: 0, vRes: 0 }];
        }
        res.json({ success: true, total: cards.length, cards });
    } catch (e) {
        res.json({ success: false, total: 0, cards: [{ caption: 'GPU 信息不可用: ' + e.message, adapterRam: 0 }] });
    }
});

// ═════════ New: Batch Port Scan (并发扫描) ═════════
const { exec: execCb } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(execCb);

router.get('/network/port-batch', async (req, res) => {
    const { host, ports } = req.query;
    if (!host || !ports) return res.status(400).json({ error: 'host and ports required' });
    const portList = ports.split(',').map(p => parseInt(p.trim())).filter(p => p > 0 && p <= 65535);
    if (!portList.length) return res.status(400).json({ error: 'no valid ports' });
    
    const safeHost = host.replace(/[;&|']/g, '');
    const scanList = portList.slice(0, 30);
    const results = [];
    
    // 并发扫描，每次最多 10 个端口同时进行
    const scanOne = async (portNum) => {
        try {
            const out = await execAsync(
                `powershell -Command "try { \$c=New-Object System.Net.Sockets.TcpClient; \$c.ConnectAsync('${safeHost}',${portNum}).Wait(2000); if(\$c.Connected){Write-Output 'OPEN'}else{Write-Output 'CLOSED'}; \$c.Dispose() } catch { Write-Output 'CLOSED' }"`,
                { encoding: 'utf8', timeout: 5000 }
            );
            const open = out.stdout.trim().includes('OPEN');
            // 获取进程名
            let procName = '';
            if (open) {
                try {
                    const r = require('child_process').execSync(`netstat -ano | findstr LISTENING | findstr :${portNum} `, { encoding: 'utf8', timeout: 3000 }).trim();
                    const pid = r.split(/\s+/).pop();
                    if (pid) {
                        const t = require('child_process').execSync(`tasklist /fi \"PID eq ${pid}\" /fo csv /nh`, { encoding: 'utf8', timeout: 3000 }).trim();
                        procName = t.split(',')[0]?.replace(/"/g, '') || '';
                    }
                } catch {}
            }
            return { port: portNum, open, processName: procName };
        } catch {
            return { port: portNum, open: false, processName: '' };
        }
    };
    
    const CONCURRENCY = 10;
    for (let i = 0; i < scanList.length; i += CONCURRENCY) {
        const batch = scanList.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(batch.map(p => scanOne(p)));
        results.push(...batchResults);
    }
    
    const openPorts = results.filter(r => r.open).map(r => r.port);
    res.json({ success: true, host, total: results.length, openCount: openPorts.length, openPorts, results });
});

// ═════════ GitHub Download Accelerator ═════════
const path = require('path');
const fs = require('fs');

const downloadTasks = {};
const downloadQueue = [];   // pending task IDs waiting for a slot
const MAX_CONCURRENT = 3;   // max simultaneous downloads
let activeCount = 0;        // currently running downloads
const SCRIPTS_DIR = path.join(__dirname, '..', '..', 'data', 'scripts');

// Max retries per mirror before moving to next
const MAX_RETRIES_PER_MIRROR = 2;

function processQueue() {
    while (activeCount < MAX_CONCURRENT && downloadQueue.length > 0) {
        const taskId = downloadQueue.shift();
        const task = downloadTasks[taskId];
        if (!task || task.cancelled || task.done) continue;
        activeCount++;
        task.stage = task.hasProxy ? '检测到代理，直连下载中...' : '使用镜像加速中...';
        const mirrors = getMirrors();
        runDownload(task, 0, 0, mirrors);
    }
}

function dequeueTask(taskId) {
    const idx = downloadQueue.indexOf(taskId);
    if (idx !== -1) downloadQueue.splice(idx, 1);
}

// Dynamic mirror selection: detect proxy, order mirrors accordingly
function getMirrors() {
    const hasProxy = detectLocalProxy();
    if (hasProxy) {
        // Clash/proxy active: direct is fastest (goes through proxy)
        return [
            { name: '直连(走代理)', url: (u) => u },
            { name: 'ghproxy.com', url: (u) => 'https://ghproxy.com/' + u },
            { name: 'ghproxy.net', url: (u) => 'https://ghproxy.net/' + u },
        ];
    }
    // No proxy: mirror first, direct last (likely blocked)
    return [
        { name: 'ghproxy.net', url: (u) => 'https://ghproxy.net/' + u },
        { name: 'ghproxy.com', url: (u) => 'https://ghproxy.com/' + u },
        { name: '直连(无代理)', url: (u) => u },
    ];
}

// Quick proxy detection (caches for 30s to avoid hammering)
let _proxyCache = null;
let _proxyCacheTime = 0;
function detectLocalProxy() {
    const now = Date.now();
    if (_proxyCache && now - _proxyCacheTime < 30000) return _proxyCache;
    _proxyCacheTime = now;
    _proxyCache = false;
    try {
        const out = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable', { encoding: 'utf8', timeout: 3000 });
        _proxyCache = out.includes('0x1');
    } catch {}
    return _proxyCache;
}

router.post('/download/github', (req, res) => {
    const { url } = req.body;
    if (!url || !url.includes('github.com')) {
        return res.json({ success: false, error: '请输入有效的GitHub地址' });
    }
    
    let downloadUrl = url;
    let filename;
    
    if (url.match(/github\.com\/[^\/]+\/[^\/]+$/)) {
        downloadUrl = url.replace(/\/?$/, '') + '/archive/refs/heads/main.zip';
        const parts = url.replace(/\/?$/, '').split('/');
        filename = parts[parts.length-1] + '-main.zip';
    } else if (url.match(/github\.com\/[^\/]+\/[^\/]+\/archive\//)) {
        filename = url.split('/').pop() || 'download.zip';
    } else if (url.match(/github\.com\/[^\/]+\/[^\/]+\/releases\//)) {
        filename = url.split('/').pop() || 'release.zip';
    } else if (url.match(/github\.com\/[^\/]+\/[^\/]+\/(blob|raw)\/+/)) {
        downloadUrl = url.replace('github.com', 'raw.githubusercontent.com').replace(/\/blob\//, '/');
        filename = url.split('/').pop() || 'file';
    } else if (url.match(/raw\.githubusercontent\.com|raw\.github\.com/)) {
        filename = url.split('/').pop() || 'file';
    } else if (url.match(/codeload\.github\.com/)) {
        // e.g. codeload.github.com/user/repo/zip/refs/heads/main
        const parts = url.replace(/\/$/,'').split('/');
        const repoName = parts[3] || ''; // user/repo
        const zipName = parts[4] || 'archive'; // zip/tar.gz
        const branch = parts[parts.length-1] || 'main';
        filename = repoName + '-' + branch + '.' + (zipName === 'tar.gz' ? 'tar.gz' : 'zip');
    } else {
        filename = url.split('/').pop() || 'download';
    }
    
    const taskId = crypto.randomUUID().slice(0, 8);
    const downloadDir = path.join(__dirname, '..', '..', 'data', 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });
    const localPath = path.join(downloadDir, taskId + '-' + filename);
    
    const task = {
        id: taskId, url: downloadUrl, filename,
        localPath, done: false, error: null, cancelled: false,
        progress: 0, speed: '', size: '', stage: 'init',
        startTime: Date.now(), cp: null,
    };
    const hasProxy = detectLocalProxy();
    task.hasProxy = hasProxy;
    task.queueTime = Date.now();
    downloadTasks[taskId] = task;
    
    // Queue management
    if (activeCount < MAX_CONCURRENT) {
        downloadQueue.push(taskId);
        processQueue();
        task.stage = hasProxy ? '检测到代理，直连下载中...' : '使用镜像加速中...';
    } else {
        downloadQueue.push(taskId);
        task.stage = '排队中 (第 ' + downloadQueue.length + ' 位)';
    }
    
    res.json({ success: true, taskId, filename, url: downloadUrl, queued: activeCount >= MAX_CONCURRENT });
});

// List all download tasks (for multi-task UI)
router.get('/download/tasks', (req, res) => {
    const taskList = Object.entries(downloadTasks).map(([id, t]) => {
        let status = 'waiting';
        if (t.done) status = t.error || t.cancelled ? 'failed' : 'done';
        else if (t.cancelled) status = 'cancelled';
        else if (downloadQueue.includes(id) && t.stage && t.stage.includes('排队')) status = 'queued';
        else status = 'downloading';
        
        let sizeStr = t.size;
        if (fs.existsSync(t.localPath)) sizeStr = formatSize(fs.statSync(t.localPath).size);
        
        return {
            id, filename: t.filename, url: t.url,
            done: t.done, cancelled: t.cancelled,
            progress: t.progress, speed: t.speed,
            size: sizeStr, error: t.error,
            stage: t.stage, status,
            queuePos: downloadQueue.indexOf(id) + 1 || 0,
        };
    }).sort((a, b) => {
        // Running first, then queued, then done
        const order = { downloading: 0, queued: 1, waiting: 2, done: 3, failed: 3, cancelled: 3 };
        return (order[a.status] || 9) - (order[b.status] || 9);
    });
    res.json({ tasks: taskList, total: taskList.length, activeCount, queueLength: downloadQueue.length, maxConcurrent: MAX_CONCURRENT });
});

router.get('/download/status/:taskId', (req, res) => {
    const task = downloadTasks[req.params.taskId];
    if (!task) return res.json({ success: false, error: 'Task not found' });
    let sizeStr = task.size;
    if (fs.existsSync(task.localPath)) {
        sizeStr = formatSize(fs.statSync(task.localPath).size);
    }
    res.json({
        done: task.done, progress: task.progress,
        speed: task.speed, filename: task.filename,
        size: sizeStr, error: task.error,
        stage: task.stage, localPath: task.localPath,
    });
});

router.post('/download/cancel/:taskId', (req, res) => {
    const task = downloadTasks[req.params.taskId];
    if (!task) return res.json({ success: false, error: 'Task not found' });
    task.cancelled = true;
    if (task.cp) { try { task.cp.kill(); } catch {} }
    task.done = true;
    task.stage = '已取消';
    // Remove from queue if pending
    dequeueTask(req.params.taskId);
    // Clean up partial file
    try { if (fs.existsSync(task.localPath)) fs.unlinkSync(task.localPath); } catch {}
    if (task.cp) activeCount = Math.max(0, activeCount - 1);
    processQueue();
    res.json({ success: true });
});

// ═════════ Download History & Proxy Status ═════════

const DOWNLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'downloads');

router.get('/download/history', (req, res) => {
    try {
        if (!fs.existsSync(DOWNLOADS_DIR)) {
            return res.json({ files: [], total: 0 });
        }
        const files = fs.readdirSync(DOWNLOADS_DIR)
            .filter(f => f.match(/^[a-f0-9]+-.+$/)) // only our download files
            .map(f => {
                const fullPath = path.join(DOWNLOADS_DIR, f);
                try {
                    const stat = fs.statSync(fullPath);
                    // Parse taskId and original filename
                    const match = f.match(/^([a-f0-9]+)-(.+)$/);
                    return {
                        filename: match ? match[2] : f,
                        taskId: match ? match[1] : 'unknown',
                        size: formatSize(stat.size),
                        bytes: stat.size,
                        modified: stat.mtime.toISOString(),
                        fullPath,
                    };
                } catch { return null; }
            })
            .filter(Boolean)
            .sort((a, b) => new Date(b.modified) - new Date(a.modified));
        res.json({ files, total: files.length });
    } catch (e) {
        res.json({ files: [], total: 0, error: e.message });
    }
});

router.get('/download/proxy', (req, res) => {
    // Detect Clash / proxy ports
    const proxies = [];
    const commonPorts = [7890, 7891, 7897, 7898, 1080, 10808, 10809, 8080];
    try {
        const out = execSync('netstat -ano', { encoding: 'utf8', timeout: 3000 });
        const listenLines = out.split('\n').filter(l => l.includes('LISTENING'));
        for (const port of commonPorts) {
            if (listenLines.some(l => l.includes(':' + port + ' '))) {
                proxies.push({ port, type: port >= 1080 && port <= 10809 ? 'SOCKS5' : 'HTTP', host: '127.0.0.1' });
            }
        }
    } catch {}
    // Also check registry for system proxy
    let systemProxy = false;
    try {
        const regOut = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable', { encoding: 'utf8', timeout: 3000 });
        systemProxy = regOut.includes('0x1');
    } catch {}
    
    res.json({
        proxies,
        systemProxy,
        count: proxies.length,
        note: proxies.length > 0
            ? `检测到 ${proxies.length} 个代理端口`
            : systemProxy
                ? '系统代理已启用（未检测到具体端口）'
                : '未检测到本地代理',
    });
});

router.delete('/download/history', (req, res) => {
    try {
        if (!fs.existsSync(DOWNLOADS_DIR)) return res.json({ success: true, removed: 0 });
        let removed = 0;
        const files = fs.readdirSync(DOWNLOADS_DIR);
        for (const f of files) {
            if (f.match(/^[a-f0-9]+-.+$/)) {
                try { fs.unlinkSync(path.join(DOWNLOADS_DIR, f)); removed++; } catch {}
            }
        }
        res.json({ success: true, removed });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

router.get('/download/stream/:taskId', (req, res) => {
    const task = downloadTasks[req.params.taskId];
    if (!task || !fs.existsSync(task.localPath)) {
        return res.status(404).json({ error: 'File not found' });
    }
    const stat = fs.statSync(task.localPath);
    if (stat.size === 0) {
        return res.status(500).json({ error: '文件为空，下载失败' });
    }
    res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(task.filename) + '"');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', 'application/octet-stream');
    fs.createReadStream(task.localPath).pipe(res);
});

function runDownload(task, mirrorIdx, retryCount, mirrors) {
    if (retryCount === undefined) retryCount = 0;
    if (!mirrors) mirrors = getMirrors();
    
    // All mirrors exhausted
    if (mirrorIdx >= mirrors.length) {
        task.done = true;
        task.progress = 0;
        task.stage = '所有镜像均失败';
        if (!task.error) task.error = '所有镜像均无法连接，请检查网络或开启代理';
        activeCount = Math.max(0, activeCount - 1);
        processQueue();
        return;
    }
    
    // Check if cancelled
    if (task.cancelled) {
        task.done = true; task.stage = '已取消';
        activeCount = Math.max(0, activeCount - 1);
        processQueue();
        return;
    }
    
    const mirror = mirrors[mirrorIdx];
    const targetUrl = mirror.url(task.url);
    const retryLabel = retryCount > 0 ? ` (第${retryCount + 1}次)` : '';
    task.stage = `尝试 ${mirror.name}${retryLabel}`;
    task.speed = '';
    task.progress = 0;
    
    // Write PS script
    const psScript = path.join(SCRIPTS_DIR, 'dl_' + task.id + '.ps1');
    const psContent = [
        'param([string]$url, [string]$out)',
        '$ErrorActionPreference = "Stop"',
        '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12',
        '$wc = New-Object System.Net.WebClient',
        '$sw = [System.Diagnostics.Stopwatch]::StartNew()',
        'try {',
        '    $wc.DownloadFile($url, $out)',
        '    $sw.Stop()',
        '    if (Test-Path $out) {',
        '        $size = (Get-Item $out).Length',
        '        if ($size -eq 0) { throw "File is 0 bytes" }',
        '        $speed = [math]::Round($size / [math]::Max($sw.Elapsed.TotalSeconds, 0.1) / 1024, 1)',
        '        Write-Host "DONE size=$size speed=${speed}KB/s"',
        '    } else { throw "File not created" }',
        '} catch {',
        '    Write-Host "ERR: $_"',
        '    exit 1',
        '}',
    ].join('\r\n');
    
    fs.writeFileSync(psScript, psContent, 'utf8');
    
    const cmd = [
        'powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', psScript,
        '-url', targetUrl,
        '-out', task.localPath,
    ];
    
    task.cp = exec(cmd.join(' '), { timeout: 120000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        // Clean up ps script
        try { fs.unlinkSync(psScript); } catch {}
        
        if (task.cancelled) return;
        
        // Check actual file
        if (fs.existsSync(task.localPath)) {
            const stat = fs.statSync(task.localPath);
            if (stat.size > 0) {
                const speedMatch = stdout.match(/DONE.*speed=([\d.]+)KB\/s/);
                task.speed = speedMatch ? speedMatch[1] + ' KB/s' : '—';
                task.size = formatSize(stat.size);
                
                // Validate ZIP integrity for archive files
                const isZipUrl = task.url.match(/\.zip$|\/archive\//);
                if (isZipUrl && !isValidZip(task.localPath)) {
                    // Truncated ZIP! Delete and retry.
                    try { fs.unlinkSync(task.localPath); } catch {}
                    task.error = `${mirror.name}: 文件不完整(ZIP截断)，重试中...`;
                    task.stage = task.error;
                    // Retry same mirror or move to next
                    if (!task.cancelled) {
                        if (retryCount + 1 < MAX_RETRIES_PER_MIRROR) {
                            task.cp = null;
                            runDownload(task, mirrorIdx, retryCount + 1, mirrors);
                        } else {
                            task.cp = null;
                            runDownload(task, mirrorIdx + 1, 0, mirrors);
                        }
                    }
                    return;
                }
                
                task.done = true;
                task.progress = 100;
                task.stage = '已完成';
                activeCount = Math.max(0, activeCount - 1);
                processQueue();
                return;
            }
        }
        
        // Failed
        const errMsg = stdout.match(/ERR: (.+)/)?.[1] || stderr || err?.message || '未知错误';
        const shortErr = errMsg.length > 80 ? errMsg.substring(0, 80) + '...' : errMsg;
        task.error = `${mirror.name}: ${shortErr}`;
        
        // Retry same mirror or move to next
        if (!task.cancelled) {
            if (retryCount + 1 < MAX_RETRIES_PER_MIRROR) {
                // Retry same mirror
                task.cp = null;
                runDownload(task, mirrorIdx, retryCount + 1, mirrors);
            } else {
                // Move to next mirror
                task.cp = null;
                runDownload(task, mirrorIdx + 1, 0, mirrors);
            }
        }
    });
    
    // Poll progress
    const pollInterval = setInterval(() => {
        if (task.done) { clearInterval(pollInterval); return; }
        if (task.cancelled) { clearInterval(pollInterval); return; }
        if (fs.existsSync(task.localPath)) {
            const stat = fs.statSync(task.localPath);
            if (stat.size > 0) {
                task.size = formatSize(stat.size);
                // Estimate progress from file size (pretend max ~100MB = 100%)
                task.progress = Math.min(90, Math.round(stat.size / 1048576));
                const elapsed = (Date.now() - task.startTime) / 1000;
                if (elapsed > 2) task.speed = formatSpeed(stat.size / elapsed);
            }
        }
    }, 2000);
    
    task.cp.on('close', () => {
        clearInterval(pollInterval);
    });
}

// Check if file is a complete ZIP (valid end-of-central-directory record)
function isValidZip(filePath) {
    try {
        if (!fs.existsSync(filePath)) return false;
        const stat = fs.statSync(filePath);
        if (stat.size < 22) return false; // ZIP minimum size
        // Read last 64KB to find EOCD signature 0x06054b50 (PK\x05\x06)
        const searchLen = Math.min(stat.size, 65536);
        const buf = Buffer.alloc(4);
        const fd = fs.openSync(filePath, 'r');
        let found = false;
        for (let offset = stat.size - searchLen; offset <= stat.size - 4; offset++) {
            try {
                fs.readSync(fd, buf, 0, 4, offset);
                if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x05 && buf[3] === 0x06) {
                    found = true;
                    break;
                }
            } catch { break; }
        }
        fs.closeSync(fd);
        return found;
    } catch { return false; }
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatSpeed(bytesPerSec) {
    if (bytesPerSec < 1024) return bytesPerSec.toFixed(0) + ' B/s';
    if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
    return (bytesPerSec / (1024 * 1024)).toFixed(1) + ' MB/s';
}

module.exports = router;
