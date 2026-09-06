const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const execAsync = promisify(exec);

// ===== Proxy Management =====
router.get('/proxy/status', async (req, res) => {
    try {
        const regPath = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
        const result = await execAsync(`powershell -Command "Get-ItemProperty '${regPath}' | Select-Object ProxyEnable, AutoConfigURL, ProxyServer | ConvertTo-Json"`);
        const data = JSON.parse(result.stdout.trim());
        res.json({
            enabled: data.ProxyEnable === 1,
            autoConfigUrl: data.AutoConfigURL || null,
            proxyServer: data.ProxyServer || null,
            proxyPac: data.AutoConfigURL || null
        });
    } catch (err) {
        res.status(500).json({ error: '获取代理状态失败: ' + err.message });
    }
});

router.post('/proxy/enable', async (req, res) => {
    try {
        const { pacUrl, server, mode } = req.body;
        
        if (mode === 'global' && server) {
            // 全局代理模式: 设置代理服务器地址（如 127.0.0.1:7897）
            await execAsync(`powershell -Command "Set-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name ProxyEnable -Value 1"`);
            await execAsync(`powershell -Command "Set-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name ProxyServer -Value '${server}'"`);
            await execAsync(`powershell -Command "Remove-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name AutoConfigURL -ErrorAction SilentlyContinue"`);
            return res.json({ success: true, mode: 'global', server });
        }
        
        // PAC 模式
        if (pacUrl) {
            await execAsync(`powershell -Command "Set-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name AutoConfigURL -Value '${pacUrl}'"`);
            await execAsync(`powershell -Command "Set-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name ProxyEnable -Value 0"`);
            return res.json({ success: true, mode: 'pac', pacUrl });
        }
        
        res.status(400).json({ error: '需要指定 pacUrl（PAC模式）或 server+mode=global（全局模式）' });
    } catch (err) {
        res.status(500).json({ error: '启用代理失败: ' + err.message });
    }
});

router.post('/proxy/disable', async (req, res) => {
    try {
        await execAsync(`powershell -Command "Set-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name ProxyEnable -Value 0; Remove-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name AutoConfigURL -ErrorAction SilentlyContinue"`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: '禁用代理失败: ' + err.message });
    }
});

// ===== Port Monitor =====
router.get('/ports', async (req, res) => {
    try {
        const result = await execAsync('netstat -ano | findstr LISTENING');
        const lines = result.stdout.trim().split('\n').filter(l => l.trim());
        let ports = lines.map(l => {
            const parts = l.trim().split(/\s+/);
            const addr = parts[1] || '';
            const port = addr.includes(':') ? addr.split(':').pop() : '';
            const pid = parts[parts.length - 1] || '';
            return { address: addr, port: parseInt(port), pid: parseInt(pid) };
        }).filter(p => p.port && !isNaN(p.port));
        
        // 获取进程名（一次 tasklist 查出所有）
        const pidMap = {};
        try {
            const taskOut = require('child_process').execSync('tasklist /fo csv /nh', { encoding: 'utf8', timeout: 5000 });
            taskOut.trim().split('\n').forEach(line => {
                const parts = line.split(',');
                if (parts.length >= 2) {
                    const name = parts[0].replace(/"/g, '');
                    const pid = parseInt(parts[1].replace(/"/g, ''));
                    if (!isNaN(pid)) pidMap[pid] = name;
                }
            });
        } catch {}
        ports = ports.map(p => ({ ...p, processName: pidMap[p.pid] || 'System' }));
        
        // 按端口号/范围过滤
        const portFilter = req.query.port;
        const rangeFilter = req.query.range;
        if (portFilter) {
            const p = parseInt(portFilter);
            if (!isNaN(p)) ports = ports.filter(x => x.port === p);
        }
        if (rangeFilter) {
            const parts = rangeFilter.split('-');
            const lo = parseInt(parts[0]), hi = parseInt(parts[1] || parts[0]);
            if (!isNaN(lo) && !isNaN(hi)) ports = ports.filter(x => x.port >= lo && x.port <= hi);
        }
        
        res.json({ ports, count: ports.length });
    } catch (err) {
        res.status(500).json({ error: '获取端口失败: ' + err.message });
    }
});

// ===== Network Diagnostic =====
router.get('/network/diag', async (req, res) => {
    try {
        const host = req.query.host || 'baidu.com';
        const result = await execAsync(`ping -n 2 ${host}`);
        const lines = result.stdout.split('\n').filter(l => l.trim());
        const avgLine = lines.find(l => l.includes('平均') || l.includes('Average') || l.includes('Approximate'));
        const stats = {
            host,
            reachable: result.stdout.includes('TTL') || result.stdout.includes('时间'),
            details: lines.slice(-3).join('\n').trim()
        };
        // Also check local proxy service
        let proxyOk = false;
        try {
            const proxyResult = await execAsync('powershell -Command "(Invoke-WebRequest -Uri http://127.0.0.1:18081/proxy.pac -TimeoutSec 3).StatusCode"');
            proxyOk = proxyResult.stdout.trim() === '200';
        } catch (e) { proxyOk = false; }
        stats.proxyService = proxyOk;
        res.json(stats);
    } catch (err) {
        res.json({ host, reachable: false, error: err.message });
    }
});

// ===== Process List =====
router.get('/processes', async (req, res) => {
    try {
        const result = await execAsync('powershell -Command "Get-Process | Select-Object Id, ProcessName, @{N=\'MemMB\';E={[math]::Round($_.WorkingSet64/1MB,1)}}, StartTime | Sort-Object -Property WorkingSet64 -Descending | ConvertTo-Json -Compress"');
        const allProcs = JSON.parse(result.stdout.trim());
        const procs = Array.isArray(allProcs) ? allProcs.slice(0, 30) : [allProcs];
        res.json({ processes: procs, total: Array.isArray(allProcs) ? allProcs.length : 1 });
    } catch (err) {
        res.status(500).json({ error: '获取进程失败: ' + err.message });
    }
});

// ===== Disk Info =====
router.get('/disk', async (req, res) => {
    try {
        const result = await execAsync('powershell -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{N=\'TotalGB\';E={[math]::Round($_.Used/1GB + $_.Free/1GB, 1)}}, @{N=\'UsedGB\';E={[math]::Round($_.Used/1GB, 1)}}, @{N=\'FreeGB\';E={[math]::Round($_.Free/1GB, 1)}}, @{N=\'UsedPct\';E={[math]::Round($_.Used*100/($_.Used+$_.Free), 1)}} | ConvertTo-Json -Compress"');
        const disks = JSON.parse(result.stdout.trim());
        res.json({ disks: Array.isArray(disks) ? disks : [disks] });
    } catch (err) {
        res.status(500).json({ error: '获取磁盘信息失败: ' + err.message });
    }
});

// ===== System Info =====
router.get('/info', async (req, res) => {
    try {
        const uptime = os.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const mins = Math.floor((uptime % 3600) / 60);
        const memTotalGB = Math.round(os.totalmem() / 1073741824 * 10) / 10;
        const memFreeGB = Math.round(os.freemem() / 1073741824 * 10) / 10;
        const memUsedGB = Math.round((memTotalGB - memFreeGB) * 10) / 10;
        const usedPct = Math.round((1 - os.freemem() / os.totalmem()) * 100);
        const cpus = os.cpus();
        const cpuModel = cpus.length > 0 ? cpus[0].model.replace(/\s+/g, ' ').trim() : '?';
        res.json({
            hostname: os.hostname(),
            os: `${os.type()} ${os.release()}`,
            uptime: `${days}天 ${hours}时 ${mins}分`,
            cpu: `${cpuModel} (${cpus.length}逻辑核)`,
            mem: { totalGB: memTotalGB, usedGB: memUsedGB, freeGB: memFreeGB, usedPct }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== Kill Process =====
router.post('/kill', (req, res) => {
    const pid = req.body?.pid;
    if (!pid) return res.status(400).json({ error: '缺少 PID' });
    exec(`taskkill /f /pid ${pid}`, (err) => {
        if (err) return res.status(500).json({ error: '终止失败: ' + err.message });
        res.json({ success: true });
    });
});

module.exports = router;
