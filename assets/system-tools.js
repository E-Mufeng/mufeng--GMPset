const systemTools = {
    init() {
        document.getElementById('proxy-ref').addEventListener('click', () => this.checkProxy());
        document.getElementById('proxy-on').addEventListener('click', () => this.enableProxy());
        document.getElementById('proxy-off').addEventListener('click', () => this.disableProxy());
        // 代理模式切换时显示/隐藏服务器地址输入
        const modeSel = document.getElementById('proxy-mode');
        if (modeSel) {
            modeSel.addEventListener('change', () => {
                document.getElementById('proxy-server-input').style.display =
                    modeSel.value === 'global' ? 'block' : 'none';
            });
        }
        document.getElementById('ping-btn').addEventListener('click', () => this.ping());
        this.loadDiskInfo();
        document.getElementById('port-ref').addEventListener('click', () => this.loadPorts());
        document.getElementById('proc-ref').addEventListener('click', () => this.loadProcesses());
        document.getElementById('proc-ref-inline').addEventListener('click', () => this.loadProcesses());
        document.getElementById('kill-btn').addEventListener('click', () => this.killProcess());
        this.loadSystemInfo();
        document.getElementById('sys-ref').addEventListener('click', () => this.loadSystemInfo());
    },

    async checkProxy() {
        const result = await window.toolbox.api('GET', '/api/system/proxy/status');
        const state = document.getElementById('pstate');
        const pacRow = document.getElementById('proxy-pac-row');
        const serverRow = document.getElementById('proxy-server-row');
        const pacUrl = document.getElementById('ppac');
        const pserver = document.getElementById('pserver');
        if (result.error) { state.textContent = '获取失败'; return; }
        if (result.proxyPac) {
            state.textContent = 'PAC 模式';
            pacRow.style.display = 'flex';
            if (serverRow) serverRow.style.display = 'none';
            pacUrl.textContent = result.proxyPac;
        } else if (result.proxyServer && result.enabled) {
            state.textContent = '全局代理: ' + result.proxyServer;
            pacRow.style.display = 'none';
            if (serverRow) { serverRow.style.display = 'flex'; pserver.textContent = result.proxyServer; }
        } else {
            state.textContent = '未启用';
            pacRow.style.display = 'none';
            if (serverRow) serverRow.style.display = 'none';
        }
    },

    async enableProxy() {
        const mode = document.getElementById('proxy-mode')?.value || 'pac';
        const pacUrl = 'http://127.0.0.1:18081/proxy.pac';
        const server = document.getElementById('proxy-server')?.value || '';
        
        if (mode === 'global' && !server) {
            alert('请填写代理服务器地址，格式如 127.0.0.1:7897');
            return;
        }
        
        const body = mode === 'global' ? { mode: 'global', server } : { pacUrl };
        const result = await window.toolbox.api('POST', '/api/system/proxy/enable', body);
        if (result.success) this.checkProxy();
    },

    async disableProxy() {
        const result = await window.toolbox.api('POST', '/api/system/proxy/disable');
        if (result.success) this.checkProxy();
    },

    async ping() {
        const host = document.getElementById('ping-host').value.trim() || 'baidu.com';
        const result = await window.toolbox.api('GET', `/api/system/network/diag?host=${encodeURIComponent(host)}`);
        const el = document.getElementById('ping-r');
        if (result.error) { el.textContent = '诊断失败: ' + result.error; return; }
        let text = `目标: ${result.host}\n连通: ${result.reachable ? '✅ 可达' : '❌ 不可达'}\n`;
        if (result.proxyService !== undefined) text += `PAC 服务: ${result.proxyService ? '✅ 运行中' : '❌ 未响应'}\n`;
        text += result.details || '';
        el.textContent = text;
    },

    async loadDiskInfo() {
        const result = await window.toolbox.api('GET', '/api/system/disk');
        const el = document.getElementById('disk-info');
        if (result.error) { el.textContent = '获取失败: ' + result.error; return; }
        if (!result.disks) { el.textContent = '无磁盘信息'; return; }
        let text = '';
        result.disks.forEach(d => { text += `${d.Name}: ${d.FreeGB}GB 空闲 / ${d.TotalGB}GB (已用 ${d.UsedPct}%)\n`; });
        el.textContent = text;
    },

    async loadPorts() {
        const filter = document.getElementById('port-filter')?.value?.trim() || '';
        let url = '/api/system/ports';
        if (filter) {
            if (filter.includes('-')) url += '?range=' + filter;
            else url += '?port=' + filter;
        }
        const result = await window.toolbox.api('GET', url);
        const el = document.getElementById('port-list');
        if (result.error) { el.textContent = '获取失败: ' + result.error; return; }
        if (!result.ports || result.ports.length === 0) { el.textContent = '无监听端口'; return; }
        const knownPorts = { 8081: '工具箱后端', 7897: 'Firestone 代理', 18081: 'PAC 服务', 8080: 'Photopea', 8443: 'Firestone HTTPS' };
        let text = `共 ${result.count} 个监听端口\n`;
        result.ports.slice(0, 40).forEach(p => {
            const name = knownPorts[p.port] || p.processName || ('PID: ' + p.pid);
            text += `  ${String(p.port).padEnd(5)}→ ${name}\n`;
        });
        if (result.ports.length > 40) text += `\n... 还有 ${result.ports.length - 40} 个端口`;
        el.textContent = text;
    },

    // ===== Process Manager =====
    async loadProcesses() {
        const result = await window.toolbox.api('GET', '/api/system/processes');
        const el = document.getElementById('proc-list');
        if (result.error) { el.textContent = '获取失败: ' + result.error; return; }
        if (!result.processes || result.processes.length === 0) { el.textContent = '无进程'; return; }
        let text = `共 ${result.total} 个进程 (显示内存前30)\n\n`;
        text += 'PID'.padEnd(8) + '名称'.padEnd(22) + '内存'.padEnd(12) + '启动时间\n';
        text += '-'.repeat(60) + '\n';
        result.processes.forEach(p => {
            const time = p.StartTime ? new Date(p.StartTime).toLocaleTimeString('zh-CN') : '';
            text += String(p.Id).padEnd(8) + String(p.ProcessName||'?').padEnd(22) + (p.MemMB ? p.MemMB+'MB'.padEnd(10) : '').padEnd(12) + time + '\n';
        });
        el.textContent = text;
    },

    async killProcess() {
        const pid = document.getElementById('kill-pid').value.trim();
        if (!pid || isNaN(pid)) { document.getElementById('kill-result').textContent = '输入有效 PID'; return; }
        const result = await window.toolbox.api('POST', '/api/system/kill', { pid: parseInt(pid) });
        document.getElementById('kill-result').textContent = result.success ? `✅ 已终止 PID ${pid}` : (result.error || '终止失败');
    },

    // ===== System Info =====
    async loadSystemInfo() {
        const result = await window.toolbox.api('GET', '/api/system/info');
        const el = document.getElementById('sys-info');
        if (result.error) { el.textContent = '获取失败: ' + result.error; return; }
        let text = `主机: ${result.hostname || '?'}\n`;
        text += `系统: ${result.os || '?'}\n`;
        text += `运行时间: ${result.uptime || '?'}\n`;
        text += `CPU: ${result.cpu || '?'}\n`;
        if (result.mem) text += `内存: ${result.mem.usedGB}GB / ${result.mem.totalGB}GB (${result.mem.usedPct}%)`;
        el.textContent = text;
    }
};
window.systemTools = systemTools;
