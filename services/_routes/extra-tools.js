// ═══════════════════════════════════
// 系统监控 & 文本实验室 后端 API
// ═══════════════════════════════════
const express = require('express');
const router = express.Router();
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

// ───── 文本实验室 ─────

// Text Diff (simple line-based)
router.post('/text/diff', (req, res) => {
    const { text1, text2 } = req.body;
    if (text1 === undefined || text2 === undefined) return res.status(400).json({ error: 'text1 and text2 required' });
    const lines1 = text1.split('\n');
    const lines2 = text2.split('\n');
    const maxLen = Math.max(lines1.length, lines2.length);
    const diffs = [];
    let totalChanges = 0;
    for (let i = 0; i < maxLen; i++) {
        const l1 = i < lines1.length ? lines1[i] : null;
        const l2 = i < lines2.length ? lines2[i] : null;
        if (l1 !== l2) {
            totalChanges++;
            diffs.push({ line: i + 1, old: l1, new: l2, type: l1 === null ? 'added' : l2 === null ? 'removed' : 'changed' });
        }
    }
    // Also do character diff for matching lines that changed
    res.json({ success: true, totalLines1: lines1.length, totalLines2: lines2.length, changed: totalChanges, diffs });
});

// Markdown to HTML (simple conversion)
router.post('/text/markdown', (req, res) => {
    const { text } = req.body;
    if (text === undefined) return res.status(400).json({ error: 'text required' });
    let html = text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
        .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
    html = '<p>' + html + '</p>';
    res.json({ success: true, html });
});

// Code Snippets
const SNIPPETS_FILE = path.join(__dirname, '..', '..', 'data', 'snippets.json');

function loadSnippets() {
    try {
        if (fs.existsSync(SNIPPETS_FILE)) {
            return JSON.parse(fs.readFileSync(SNIPPETS_FILE, 'utf8'));
        }
    } catch {}
    return { snippets: [] };
}

function saveSnippets(data) {
    try {
        const dir = path.dirname(SNIPPETS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(SNIPPETS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) { console.error('Save snippets failed:', e.message); }
}

router.get('/lab/snippets', (req, res) => {
    const data = loadSnippets();
    res.json({ success: true, snippets: data.snippets });
});

router.post('/lab/snippet', (req, res) => {
    const { id, title, code, language, tags } = req.body;
    if (!title || !code) return res.status(400).json({ error: 'title and code required' });
    const data = loadSnippets();
    if (id) {
        const idx = data.snippets.findIndex(s => s.id === id);
        if (idx >= 0) {
            data.snippets[idx] = { ...data.snippets[idx], title, code, language: language || 'plaintext', tags: tags || [], updatedAt: new Date().toISOString() };
            saveSnippets(data);
            return res.json({ success: true, snippet: data.snippets[idx] });
        }
    }
    const snippet = { id: crypto.randomUUID().slice(0,8), title, code, language: language || 'plaintext', tags: tags || [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    data.snippets.push(snippet);
    saveSnippets(data);
    res.json({ success: true, snippet });
});

router.delete('/lab/snippet/:id', (req, res) => {
    const data = loadSnippets();
    data.snippets = data.snippets.filter(s => s.id !== req.params.id);
    saveSnippets(data);
    res.json({ success: true });
});

// ───── 系统监控 ─────

// Quick metrics (fast, no execSync)
router.get('/monitor/quick', (req, res) => {
    try {
        const cpus = os.cpus();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        
        // CPU load per core (rough estimate)
        const cpuLoad = cpus.map(c => ({
            model: c.model.slice(0,20),
            speed: c.speed,
            times: c.times
        }));
        
        const memPercent = totalMem > 0 ? ((usedMem / totalMem) * 100).toFixed(1) : 0;
        
        res.json({
            success: true,
            hostname: os.hostname(),
            platform: os.platform(),
            uptime: os.uptime(),
            cpus: { count: cpus.length, model: cpus[0]?.model || '', speed: cpus[0]?.speed || 0 },
            memory: { total: totalMem, used: usedMem, free: freeMem, percent: memPercent },
            timestamp: Date.now()
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Disk quick info
router.get('/monitor/disks', (req, res) => {
    try {
        let disks = [];
        try {
            const out = execSync('powershell -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free | ConvertTo-Json"', { encoding: 'utf8', timeout: 5000 });
            const json = JSON.parse(out);
            const arr = Array.isArray(json) ? json : [json];
            disks = arr.map(d => ({
                drive: d.Name + ':',
                freeBytes: d.Free || 0,
                totalBytes: (d.Used || 0) + (d.Free || 0),
                usedBytes: d.Used || 0,
            }));
        } catch {}
        res.json({ success: true, disks });
    } catch (e) {
        res.json({ success: true, disks: [] });
    }
});

// Top processes (fast)
router.get('/monitor/top', (req, res) => {
    try {
        const out = execSync('tasklist /fo csv /nh', { encoding: 'utf8', timeout: 5000 });
        const lines = out.split('\n').filter(l => l.trim());
        const processes = lines.map(l => {
            const parts = l.replace(/^"|"$/g,'').split('","');
            return { name: parts[0] || '', pid: parseInt(parts[1]) || 0, session: parts[2] || '', memKB: parseInt((parts[4]||'0').replace(/[^\d]/g,'')) || 0 };
        }).sort((a,b) => b.memKB - a.memKB).slice(0, 30);
        res.json({ success: true, processes, total: lines.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Kill process
router.post('/system/process-kill', (req, res) => {
    const { pid } = req.body;
    if (!pid) return res.status(400).json({ error: 'pid required' });
    try {
        execSync(`taskkill /pid ${parseInt(pid)} /f`, { encoding: 'utf8', timeout: 5000 });
        res.json({ success: true, pid });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Active connections detail
router.get('/monitor/connections', (req, res) => {
    try {
        const out = execSync('netstat -ano | findstr ESTABLISHED', { encoding: 'utf8', timeout: 5000 });
        const lines = out.split('\n').filter(l => l.trim());
        const connections = lines.map(l => {
            const parts = l.trim().split(/\s+/);
            return {
                protocol: parts[0] || '',
                local: parts[1] || '',
                remote: parts[2] || '',
                state: parts[3] || '',
                pid: parseInt(parts[4]) || 0
            };
        }).filter(c => c.protocol);
        // Aggregate by remote IP
        const grouped = {};
        connections.forEach(c => {
            const ip = c.remote.split(':')[0];
            grouped[ip] = (grouped[ip] || 0) + 1;
        });
        const top = Object.entries(grouped).sort((a,b) => b[1] - a[1]).slice(0, 30);
        res.json({ success: true, total: connections.length, connections, topRemote: top });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ───── Lab Snippets ─────
const LAB_DATA = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(LAB_DATA)) fs.mkdirSync(LAB_DATA, { recursive: true });

function loadSnippets() {
    try {
        const p = path.join(LAB_DATA, 'snippets.json');
        return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
    } catch { return []; }
}
function saveSnippets(d) { fs.writeFileSync(path.join(LAB_DATA, 'snippets.json'), JSON.stringify(d, null, 2), 'utf8'); }

router.get('/lab/snippets', (req, res) => res.json({ snippets: loadSnippets() }));
router.post('/lab/snippet', (req, res) => {
    const { id, title, code, language, tags } = req.body;
    if (!title || code === undefined) return res.status(400).json({ error: 'title and code required' });
    const snippets = loadSnippets();
    if (id) {
        const s = snippets.find(x => x.id === id);
        if (s) { Object.assign(s, { title, code, language, tags, updatedAt: new Date().toISOString() }); saveSnippets(snippets); return res.json(s); }
    }
    const snip = { id: Date.now().toString(36) + Math.random().toString(36).slice(2,5), title, code, language: language || 'plaintext', tags: tags || [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    snippets.push(snip);
    saveSnippets(snippets);
    res.json(snip);
});
router.delete('/lab/snippet/:id', (req, res) => { saveSnippets(loadSnippets().filter(s => s.id !== req.params.id)); res.json({ success: true }); });

// ───── Saved Passwords ─────
function loadPasswords() {
    try {
        const p = path.join(LAB_DATA, 'saved-passwords.json');
        return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
    } catch { return []; }
}
function savePasswords(d) { fs.writeFileSync(path.join(LAB_DATA, 'saved-passwords.json'), JSON.stringify(d, null, 2), 'utf8'); }

router.get('/text/saved-passwords', (req, res) => res.json({ passwords: loadPasswords() }));
router.post('/text/save-password', (req, res) => {
    const { name, password } = req.body;
    if (!name || !password) return res.status(400).json({ error: 'name and password required' });
    const list = loadPasswords();
    list.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2,4), name, password, createdAt: new Date().toISOString() });
    savePasswords(list);
    res.json({ success: true });
});
router.delete('/text/saved-password/:id', (req, res) => { savePasswords(loadPasswords().filter(p => p.id !== req.params.id)); res.json({ success: true }); });

// Set environment variable (process-level, temporary)
router.post('/system/set-env', (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key required' });
    try {
        process.env[key] = String(value || '');
        res.json({ success: true, key, value: process.env[key] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Service action (start/stop)
router.post('/system/service-action', (req, res) => {
    const { name, action } = req.body;
    if (!name || !action) return res.status(400).json({ error: 'name and action required' });
    if (!['start','stop','restart'].includes(action)) return res.status(400).json({ error: 'action must be start/stop/restart' });
    try {
        execSync(`sc.exe ${action} "${name.replace(/[&"]/g,'')}"`, { encoding: 'utf8', timeout: 10000 });
        res.json({ success: true, name, action });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

module.exports = router;
