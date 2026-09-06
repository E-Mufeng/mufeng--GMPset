const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { execSync } = require('child_process');
const router = express.Router();

const MANIFEST_DIR = path.join(__dirname, '..', '..', 'data', 'script-manager', 'manifests');
const SCRIPT_DIR = path.join(__dirname, '..', '..', 'data', 'script-manager', 'scripts');

// Track running processes
const runningProcesses = {};

function readManifests() {
    try {
        if (!fs.existsSync(MANIFEST_DIR)) return [];
        const files = fs.readdirSync(MANIFEST_DIR).filter(f => f.endsWith('.manifest.json'));
        return files.map(f => {
            try {
                const raw = fs.readFileSync(path.join(MANIFEST_DIR, f), 'utf-8');
                const m = JSON.parse(raw);
                return {
                    id: f.replace('.manifest.json', ''),
                    name: m.name || f,
                    description: m.description || '',
                    entry_point: m.entry_point || '',
                    work_dir: m.work_dir || '',
                    tags: m.tags || [],
                    timeout_seconds: m.timeout_seconds || 120,
                    status: m.status || 'unknown',
                    registered_at: m.registered_at || null,
                    updated_at: m.updated_at || null,
                    script_type: m.script_type || 'shell',
                    alias: m.alias || null,
                    ports: m.ports || [] // declared ports this script uses
                };
            } catch (e) { return null; }
        }).filter(Boolean);
    } catch (e) { return []; }
}

// Get all listening ports from netstat
function getListeningPorts() {
    try {
        const out = execSync('netstat -ano | findstr LISTENING', { encoding: 'utf8', timeout: 3000 });
        const ports = [];
        out.split('\n').forEach(line => {
            const m = line.match(/:(\d+)\s+/);
            if (m && m[1]) ports.push(parseInt(m[1]));
        });
        return [...new Set(ports)].sort((a,b)=>a-b);
    } catch (e) { return []; }
}

// List all scripts
router.get('/list', (req, res) => {
    const listeningPorts = getListeningPorts();
    const scripts = readManifests();
    const withStatus = scripts.map(s => ({
        ...s,
        running: !!runningProcesses[s.id],
        pid: runningProcesses[s.id]?.pid || null,
        startedAt: runningProcesses[s.id]?.startedAt || null,
        // Only show ports that are actually in use
        activePorts: runningProcesses[s.id] ? s.ports.filter(p => listeningPorts.includes(p)) : [],
        // Show port conflicts
        portConflict: s.ports.some(p => listeningPorts.includes(p) && !runningProcesses[s.id]),
    }));
    res.json({ scripts: withStatus, count: withStatus.length });
});

// Get single script details
router.get('/:id', (req, res) => {
    const scripts = readManifests();
    const s = scripts.find(x => x.id === req.params.id);
    if (!s) return res.status(404).json({ error: 'Script not found' });
    const listeningPorts = getListeningPorts();
    res.json({
        ...s,
        running: !!runningProcesses[s.id],
        pid: runningProcesses[s.id]?.pid || null,
        activePorts: runningProcesses[s.id] ? s.ports.filter(p => listeningPorts.includes(p)) : [],
        portConflict: s.ports.some(p => listeningPorts.includes(p) && !runningProcesses[s.id]),
    });
});

// Execute a script
router.post('/:id/run', (req, res) => {
    const scripts = readManifests();
    const s = scripts.find(x => x.id === req.params.id);
    if (!s) return res.status(404).json({ error: 'Script not found' });

    if (runningProcesses[s.id]) {
        return res.json({ success: false, error: 'Already running', pid: runningProcesses[s.id].pid });
    }

    if (!s.entry_point || !fs.existsSync(s.entry_point)) {
        return res.status(400).json({ error: 'Entry point not found: ' + (s.entry_point || 'N/A') });
    }

    // Check port conflicts
    if (s.ports && s.ports.length > 0) {
        const listeningPorts = getListeningPorts();
        const conflicts = s.ports.filter(p => listeningPorts.includes(p));
        if (conflicts.length > 0) {
            return res.status(409).json({
                error: '端口冲突',
                detail: `以下端口已被占用: ${conflicts.join(', ')}`,
                conflicts
            });
        }
    }

    try {
        const cp = spawn('cmd.exe', ['/c', s.entry_point], {
            cwd: s.work_dir || path.dirname(s.entry_point),
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        const startTime = new Date().toISOString();
        runningProcesses[s.id] = { pid: cp.pid, startedAt: startTime, process: cp };

        let stdout = '';
        let stderr = '';
        cp.stdout.on('data', d => stdout += d.toString());
        cp.stderr.on('data', d => stderr += d.toString());

        const timeout = setTimeout(() => {
            cp.kill();
            runningProcesses[s.id].killedByTimeout = true;
        }, (s.timeout_seconds || 120) * 1000);

        cp.on('close', (code) => {
            clearTimeout(timeout);
            runningProcesses[s.id].exitCode = code;
            runningProcesses[s.id].stdout = stdout;
            runningProcesses[s.id].stderr = stderr;
            setTimeout(() => { delete runningProcesses[s.id]; }, 30000);
        });

        res.json({ success: true, pid: cp.pid, startedAt: startTime });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Stop a running script
router.post('/:id/stop', (req, res) => {
    const proc = runningProcesses[req.params.id];
    if (!proc) return res.json({ success: false, error: 'Not running' });

    try {
        proc.process.kill();
        // Also kill the declared ports in case they're orphaned
        const scripts = readManifests();
        const s = scripts.find(x => x.id === req.params.id);
        if (s && s.ports) {
            s.ports.forEach(port => {
                try {
                    const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8', timeout: 2000 });
                    out.split('\n').forEach(line => {
                        const m = line.match(/(\d+)$/);
                        if (m) execSync(`taskkill /f /pid ${m[1]} 2>nul`, { timeout: 1000 });
                    });
                } catch {}
            });
        }
        res.json({ success: true, pid: proc.pid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get script run status/output
router.get('/:id/status', (req, res) => {
    const proc = runningProcesses[req.params.id];
    if (!proc) return res.json({ running: false });

    // Check actual listening ports
    const listeningPorts = getListeningPorts();
    const scripts = readManifests();
    const s = scripts.find(x => x.id === req.params.id);
    const activePorts = s && s.ports ? s.ports.filter(p => listeningPorts.includes(p)) : [];

    res.json({
        running: true,
        pid: proc.pid,
        startedAt: proc.startedAt,
        exitCode: proc.exitCode ?? null,
        killedByTimeout: proc.killedByTimeout || false,
        stdout: proc.stdout || '',
        stderr: proc.stderr || '',
        activePorts,
    });
});

module.exports = router;
