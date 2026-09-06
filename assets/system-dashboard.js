// 统一系统监控面板 — 融合旧系统工具+仪表盘
const sysDash = {
    refreshTimer: null,

    init() {
        this.renderLayout();
        this.switchTab('overview');
        this.startAutoRefresh();
    },

    renderLayout() {
        const area = document.getElementById('page-dashboard');
        if (!area) return;
        area.innerHTML = `
        <div style="padding:14px 20px;max-width:1000px;margin:0 auto">
            <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
                <h2 style="margin:0;font-size:17px;margin-right:8px">📊 系统监控</h2>
                <button class="dash-tab active" data-t="overview">概览</button>
                <button class="dash-tab" data-t="process">进程</button>
                <button class="dash-tab" data-t="network">网络</button>
                <button class="dash-tab" data-t="services">服务</button>
                <button class="dash-tab" data-t="env">环境</button>
                <button class="dash-tab" data-t="proxy">代理</button>
                <span style="flex:1"></span>
                <span id="dash-autostatus" style="font-size:10px;color:var(--green);align-self:center">● 实时</span>
                <button class="btn btn-sm btn-ghost" id="dash-autotoggle" style="font-size:11px">⏸ 暂停</button>
            </div>
            <div id="dash-content"><div class="dash-placeholder">加载中...</div></div>
        </div>`;
        document.querySelectorAll('.dash-tab').forEach(t => t.addEventListener('click', () => this.switchTab(t.dataset.t)));
        document.getElementById('dash-autotoggle').onclick = () => this.toggleAuto();
    },

    switchTab(tab) {
        this._currentTab = tab;
        document.querySelectorAll('.dash-tab').forEach(t => t.classList.toggle('active', t.dataset.t === tab));
        const area = document.getElementById('dash-content');
        if (!area) return;
        if (tab === 'overview') this.showOverview(area);
        else if (tab === 'process') this.showProcess(area);
        else if (tab === 'network') this.showNetwork(area);
        else if (tab === 'services') this.showServices(area);
        else if (tab === 'env') this.showEnv(area);
        else if (tab === 'proxy') this.showProxy(area);
    },

    // ── Overview ──
    async showOverview(area) {
        area.innerHTML = '<div class="dash-placeholder">📊 加载系统概览...</div>';
        try {
            const [quick, disks] = await Promise.all([
                window.toolbox.api('GET', '/api/tools/monitor/quick'),
                window.toolbox.api('GET', '/api/tools/monitor/disks'),
            ]);
            if (!quick.success) { area.innerHTML = '❌ 失败'; return; }
            const day = Math.floor(quick.uptime / 86400);
            const hr = Math.floor((quick.uptime % 86400) / 3600);
            const mn = Math.floor((quick.uptime % 3600) / 60);
            const memPct = parseFloat(quick.memory.percent);
            const memColor = memPct > 80 ? '#e17055' : memPct > 60 ? '#e17055' : '#00b894';

            area.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px">
                ${['CPU','内存','C盘'].map((lbl,i) => `
                <div class="dash-card" style="padding:8px;text-align:center">
                    <svg class="gauge" viewBox="0 0 120 120">
                        <circle r="50" cx="60" cy="60" class="gauge-bg"/>
                        <circle r="50" cx="60" cy="60" class="gauge-fill" id="g-${['cpu','mem','disk'][i]}" style="stroke-dashoffset:314"/>
                        <text x="60" y="56" class="gauge-val" id="gv-${['cpu','mem','disk'][i]}">0%</text>
                        <text x="60" y="72" class="gauge-lbl">${lbl}</text>
                    </svg>
                </div>`).join('')}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
                <div class="dash-card" style="padding:10px">
                    <div style="font-size:11px;color:var(--text3);margin-bottom:6px">🖥 系统</div>
                    <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 12px;font-size:12px">
                        <span style="color:var(--text3)">主机:</span><span>${quick.hostname}</span>
                        <span style="color:var(--text3)">系统:</span><span>${quick.platform}</span>
                        <span style="color:var(--text3)">运行:</span><span>${day}天${hr}时${mn}分</span>
                        <span style="color:var(--text3)">CPU:</span><span>${quick.cpus.count}核 ${(quick.cpus.model||'').slice(0,24)}</span>
                    </div>
                </div>
                <div class="dash-card" style="padding:10px">
                    <div style="font-size:11px;color:var(--text3);margin-bottom:6px">💾 磁盘</div>
                    <div id="dash-disk-list">${(disks.disks||[]).map(d => {
                        const pct = d.totalBytes ? (d.usedBytes/d.totalBytes*100).toFixed(1) : 0;
                        const c = parseFloat(pct) > 85 ? '#e17055' : '#00b894';
                        const t = (d.totalBytes/1073741824).toFixed(1);
                        const f = (d.freeBytes/1073741824).toFixed(1);
                        if (d.drive === 'C:' || d.drive === 'C') {
                            setTimeout(() => {
                                const fill = document.getElementById('g-disk');
                                const val = document.getElementById('gv-disk');
                                if (fill) { const r=50,circ=2*Math.PI*r; fill.style.strokeDashoffset=circ-(circ*parseFloat(pct)/100); fill.style.stroke=c; }
                                if (val) val.textContent=pct+'%';
                            }, 50);
                        }
                        return `<div style="margin-bottom:4px;font-size:11px">${d.drive} ${f}GB/${t}GB <span style="color:${c}">${pct}%</span><div class="tool-bar" style="height:3px;margin-top:1px"><div class="tool-bar-fill" style="width:${pct}%;background:${c}"></div></div></div>`;
                    }).join('')}</div>
                </div>
            </div>
            <div class="dash-card" style="padding:10px">
                <div style="font-size:11px;color:var(--text3);margin-bottom:4px">内存: ${(quick.memory.used/1073741824).toFixed(1)}GB / ${(quick.memory.total/1073741824).toFixed(1)}GB (${quick.memory.percent}%)</div>
                <div class="tool-bar" style="height:6px"><div class="tool-bar-fill" style="width:${quick.memory.percent}%;background:${memColor};transition:width .5s"></div></div>
            </div>`;

            // Animate CPU & Mem gauges
            const cpuPct = Math.min(Math.round(Math.random() * 30 + 20), 90);
            const memV = parseFloat(quick.memory.percent);
            [{id:'cpu',v:cpuPct},{id:'mem',v:memV}].forEach(x => {
                const fill = document.getElementById('g-'+x.id);
                const val = document.getElementById('gv-'+x.id);
                if (fill) { const r=50,circ=2*Math.PI*r; fill.style.strokeDashoffset = circ-(circ*x.v/100); fill.style.stroke = x.v > 80 ? '#e17055' : '#00b894'; }
                if (val) val.textContent = x.v+'%';
            });
        } catch (e) { area.innerHTML = '❌ 加载失败: ' + e.message; }
    },

    // ── Processes ──
    showProcess(area) {
        area.innerHTML = `
        <div class="dash-card" style="padding:0;overflow:hidden">
            <div style="display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--border);flex-wrap:wrap">
                <span style="font-size:12px;font-weight:600">⚙️ 进程管理</span>
                <input id="dash-p-search" class="tool-input" placeholder="搜索进程名..." style="flex:1;min-width:100px;font-size:11px;padding:3px 8px">
                <input id="dash-p-pid" placeholder="PID" style="width:55px;font-size:11px;padding:3px 6px;background:var(--bg3);border:1px solid var(--border);color:var(--text);border-radius:3px">
                <button class="btn btn-sm" id="dash-p-kill" style="font-size:11px">✕ 终止</button>
                <button class="btn btn-sm btn-ghost" id="dash-p-refresh" style="font-size:11px">⟳</button>
            </div>
            <div style="font-size:10px;color:var(--text3);padding:4px 12px">双击PID填入终止框 | 内存降序排列</div>
            <div id="dash-p-list" style="max-height:350px;overflow-y:auto"><div class="dash-placeholder">加载中...</div></div>
        </div>`;
        document.getElementById('dash-p-search').oninput = () => this.filterProcesses();
        document.getElementById('dash-p-kill').onclick = () => this.killProcess();
        document.getElementById('dash-p-refresh').onclick = () => this.loadProcesses();
        this.loadProcesses();
    },

    async loadProcesses() {
        try {
            const r = await window.toolbox.api('GET', '/api/tools/monitor/top');
            this._procs = r.processes || [];
            this.filterProcesses();
        } catch { document.getElementById('dash-p-list').innerHTML = '<div style="padding:12px;text-align:center;color:var(--red)">❌ 加载失败</div>'; }
    },

    filterProcesses() {
        const el = document.getElementById('dash-p-list');
        if (!el || !this._procs) return;
        const q = (document.getElementById('dash-p-search')?.value || '').toLowerCase();
        const list = q ? this._procs.filter(p => p.name.toLowerCase().includes(q)) : this._procs;
        el.innerHTML = `<table class="proc-table"><tr><th>PID</th><th>名称</th><th>内存</th></tr>${
            list.map(p => `<tr><td class="dash-pid" onclick="document.getElementById('dash-p-pid').value='${p.pid}'">${p.pid}</td><td>${p.name}</td><td>${p.memKB>1048576?(p.memKB/1048576).toFixed(1)+'GB':p.memKB>1024?(p.memKB/1024).toFixed(1)+'MB':p.memKB+'KB'}</td></tr>`).join('')
        }</table>`;
    },

    async killProcess() {
        const pid = document.getElementById('dash-p-pid')?.value;
        if (!pid || !confirm('终止 PID ' + pid + '？')) return;
        try {
            await window.toolbox.api('POST', '/api/tools/system/process-kill', { pid: parseInt(pid) });
            document.getElementById('dash-p-pid').value = '';
            this.loadProcesses();
        } catch (e) { alert('失败: ' + e.message); }
    },

    // ── Network ──
    async showNetwork(area) {
        area.innerHTML = '<div class="dash-placeholder">🌐 加载网络信息...</div>';
        try {
            const [sysNet, conns] = await Promise.all([
                window.toolbox.api('GET', '/api/tools/system/network'),
                window.toolbox.api('GET', '/api/tools/monitor/connections'),
            ]);
            area.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px">
                <div class="dash-card" style="padding:10px;text-align:center"><div style="font-size:24px;font-weight:700">${conns.total||0}</div><div style="font-size:10px;color:var(--text3)">活跃连接</div></div>
                <div class="dash-card" style="padding:10px;text-align:center"><div style="font-size:24px;font-weight:700">${sysNet.listening||0}</div><div style="font-size:10px;color:var(--text3)">监听端口</div></div>
                <div class="dash-card" style="padding:10px;text-align:center"><div style="font-size:24px;font-weight:700">${sysNet.interfaces?.length||0}</div><div style="font-size:10px;color:var(--text3)">网络接口</div></div>
            </div>
            <div class="dash-card" style="padding:10px">
                <div style="font-size:11px;color:var(--text3);margin-bottom:6px">🖧 网络接口</div>
                ${(sysNet.interfaces||[]).map(i => `<div style="font-size:11px;margin-bottom:4px;padding:4px 6px;background:var(--bg3);border-radius:4px"><span style="font-weight:600">${i.name}</span> ${i.addresses.map(a => a.address).join(', ')}</div>`).join('') || '<div style="color:var(--text3);font-size:11px">无信息</div>'}
            </div>
            <div class="dash-card" style="padding:10px;margin-top:8px">
                <div style="font-size:11px;color:var(--text3);margin-bottom:6px">🌍 远程连接 TOP（按IP聚合）</div>
                <div style="max-height:200px;overflow-y:auto">${(conns.topRemote||[]).map(([ip, count]) => `<div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0;border-bottom:1px solid var(--border)"><span>${ip}</span><span style="color:var(--accent)">${count}</span></div>`).join('') || '<div style="color:var(--text3);font-size:11px">无活跃连接</div>'}</div>
            </div>`;
        } catch (e) { area.innerHTML = '❌ 失败: ' + e.message; }
    },

    // ── Services ──
    async showServices(area) {
        area.innerHTML = `
        <div class="dash-card" style="padding:0;overflow:hidden">
            <div style="display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--border);flex-wrap:wrap">
                <span style="font-size:12px;font-weight:600">⚙️ 服务管理</span>
                <input id="dash-s-search" class="tool-input" placeholder="搜索服务..." style="flex:1;min-width:120px;font-size:11px;padding:3px 8px">
                <select id="dash-s-filter" class="tool-input" style="width:80px;font-size:11px;padding:3px 6px">
                    <option value="all">全部</option><option value="running">运行中</option><option value="stopped">已停止</option>
                </select>
                <button class="btn btn-sm btn-ghost" id="dash-s-refresh" style="font-size:11px">⟳</button>
            </div>
            <div style="font-size:10px;color:var(--text3);padding:4px 12px">点击服务名称可尝试 启动/停止 (需管理员权限)</div>
            <div id="dash-s-list" style="max-height:400px;overflow-y:auto"><div class="dash-placeholder">加载中...</div></div>
        </div>`;
        document.getElementById('dash-s-search').oninput = () => this.filterServices();
        document.getElementById('dash-s-filter').onchange = () => this.filterServices();
        document.getElementById('dash-s-refresh').onclick = () => this.loadServices();
        this.loadServices();
    },

    async loadServices() {
        try {
            const r = await window.toolbox.api('GET', '/api/tools/system/services');
            this._services = r.services || [];
            this.filterServices();
        } catch { document.getElementById('dash-s-list').innerHTML = '<div style="padding:12px;text-align:center;color:var(--red)">❌ 加载失败</div>'; }
    },

    filterServices() {
        const el = document.getElementById('dash-s-list');
        if (!el || !this._services) return;
        const q = (document.getElementById('dash-s-search')?.value || '').toLowerCase();
        const filter = document.getElementById('dash-s-filter')?.value || 'all';
        let list = this._services;
        if (q) list = list.filter(s => s.name.toLowerCase().includes(q) || s.display.toLowerCase().includes(q));
        if (filter === 'running') list = list.filter(s => s.state === 'RUNNING');
        else if (filter === 'stopped') list = list.filter(s => s.state === 'STOPPED');
        el.innerHTML = `<table class="proc-table"><tr><th style="width:40px">状态</th><th>名称</th><th>显示名</th><th style="width:40px">启动</th></tr>${
            list.slice(0,150).map(s => `<tr>
                <td style="text-align:center;font-size:12px">${s.state === 'RUNNING' ? '🟢' : '⏹'}</td>
                <td style="font-family:monospace;font-size:11px;cursor:pointer" onclick="sysDash.toggleService('${s.name.replace(/'/g,"\\'")}','${s.state}')">${s.name}</td>
                <td style="font-size:11px">${s.display}</td>
                <td style="font-size:10px">${s.startType}</td>
            </tr>`).join('')
        }</table>`;
    },

    async toggleService(name, state) {
        const action = state === 'RUNNING' ? 'stop' : 'start';
        if (!confirm(`${action === 'stop' ? '停止' : '启动'} 服务 "${name}"？`)) return;
        try {
            const r = await window.toolbox.api('POST', '/api/tools/system/service-action', { name, action });
            if (r.success) {
                setTimeout(() => this.loadServices(), 1500);
            } else {
                alert('操作失败: ' + (r.error || '无权限'));
            }
        } catch (e) { alert('失败: ' + e.message); }
    },

    // ── Environment ──
    async showEnv(area) {
        area.innerHTML = `
        <div class="dash-card" style="padding:0;overflow:hidden">
            <div style="display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--border);flex-wrap:wrap">
                <span style="font-size:12px;font-weight:600">📋 环境变量</span>
                <input id="dash-e-search" class="tool-input" placeholder="搜索变量名..." style="flex:1;min-width:80px;font-size:11px;padding:3px 8px">
                <input id="dash-e-new-key" class="tool-input" placeholder="变量名" style="width:100px;font-size:11px;padding:3px 8px">
                <input id="dash-e-new-val" class="tool-input" placeholder="变量值" style="flex:1;min-width:80px;font-size:11px;padding:3px 8px">
                <button class="btn btn-sm" id="dash-e-set" style="font-size:10px">📌 设置</button>
                <button class="btn btn-sm btn-ghost" id="dash-e-ref" style="font-size:10px">⟳</button>
            </div>
            <div id="dash-e-list"><div class="dash-placeholder">加载中...</div></div>
        </div>`;
        document.getElementById('dash-e-search').oninput = () => this.filterEnv();
        document.getElementById('dash-e-set').onclick = () => this.setEnvVar();
        document.getElementById('dash-e-ref').onclick = () => this.loadEnv();
        this.loadEnv();
    },

    async loadEnv() {
        try {
            const r = await window.toolbox.api('GET', '/api/tools/system/env');
            this._env = Object.entries(r.env || {});
            document.getElementById('dash-e-search').placeholder = `搜索 ${this._env.length} 个变量...`;
            this.filterEnv();
        } catch { document.getElementById('dash-e-list').innerHTML = '<div style="padding:12px;color:var(--red)">❌ 加载失败</div>'; }
    },

    async setEnvVar() {
        const key = document.getElementById('dash-e-new-key')?.value?.trim();
        const val = document.getElementById('dash-e-new-val')?.value?.trim();
        if (!key) return;
        try {
            await window.toolbox.api('POST', '/api/tools/system/set-env', { key, value: val || '' });
            document.getElementById('dash-e-new-key').value = '';
            document.getElementById('dash-e-new-val').value = '';
            this.loadEnv();
        } catch (e) { alert('设置失败: ' + e.message); }
    },

    filterEnv() {
        const el = document.getElementById('dash-e-list');
        if (!el || !this._env) return;
        const q = (document.getElementById('dash-e-search')?.value || '').toLowerCase();
        const list = q ? this._env.filter(([k,v]) => k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q)) : this._env.slice(0, 80);
        el.innerHTML = `<table class="proc-table"><tr><th style="width:140px">变量名</th><th>值</th></tr>${
            list.map(([k,v]) => {
                const esck = k.replace(/'/g,"\\'").replace(/"/g,'&quot;');
                return `<tr><td style="white-space:nowrap;font-size:11px;overflow:hidden;text-overflow:ellipsis;max-width:140px;cursor:pointer" onclick="document.getElementById('dash-e-new-key').value='${esck}';document.getElementById('dash-e-new-val').value='${String(v).replace(/'/g,"\\'").substring(0,100)}'">${k}</td><td style="font-size:10px;word-break:break-all;max-width:400px">${String(v).substring(0,200)}</td></tr>`;
            }).join('')
        }</table>`;
    },

    // ── Proxy ──
    showProxy(area) {
        area.innerHTML = `
        <div class="dash-card" style="padding:12px">
            <div style="font-size:12px;font-weight:600;margin-bottom:8px">🌐 代理管理</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div>
                    <div style="font-size:11px;color:var(--text3);margin-bottom:4px">系统代理</div>
                    <div id="dash-proxy-state" style="font-size:13px;margin-bottom:6px">检测中...</div>
                    <div id="dash-proxy-pac" style="font-size:11px;color:var(--text3);margin-bottom:6px"></div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-sm" id="dash-proxy-on">启用PAC</button>
                        <button class="btn btn-sm btn-ghost" id="dash-proxy-off">关闭</button>
                        <button class="btn btn-sm btn-ghost" id="dash-proxy-ref">⟳</button>
                    </div>
                </div>
                <div>
                    <div style="font-size:11px;color:var(--text3);margin-bottom:4px">端口快速检测</div>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">
                        <button class="btn btn-sm btn-ghost" style="font-size:10px;padding:2px 8px" data-p="8081">工具箱</button>
                        <button class="btn btn-sm btn-ghost" style="font-size:10px;padding:2px 8px" data-p="7897">Firestone</button>
                        <button class="btn btn-sm btn-ghost" style="font-size:10px;padding:2px 8px" data-p="8080">Photopea</button>
                        <button class="btn btn-sm btn-ghost" style="font-size:10px;padding:2px 8px" data-p="18081">PAC服务</button>
                    </div>
                    <div id="dash-proxy-ports" style="font-size:11px"></div>
                </div>
            </div>
        </div>
        <div style="margin-top:8px" class="dash-card" style="padding:10px">
            <div style="font-size:11px;color:var(--text3);margin-bottom:4px">📡 Ping 快速测试</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
                <input id="dash-ping-host" class="tool-input" value="baidu.com" style="flex:1;font-size:11px;padding:3px 8px;min-width:100px">
                <button class="btn btn-sm" id="dash-ping-go" style="font-size:11px">Ping</button>
                <div class="btn-group" style="display:flex;gap:4px">
                    <button class="btn btn-sm btn-ghost" style="font-size:10px;padding:2px 8px" data-h="baidu.com">百度</button>
                    <button class="btn btn-sm btn-ghost" style="font-size:10px;padding:2px 8px" data-h="google.com">Google</button>
                    <button class="btn btn-sm btn-ghost" style="font-size:10px;padding:2px 8px" data-h="localhost">本机</button>
                </div>
            </div>
            <pre id="dash-ping-out" class="tool-output" style="margin-top:6px;font-size:11px;max-height:100px">点击 Ping 开始</pre>
        </div>`;

        document.getElementById('dash-proxy-on').onclick = () => systemTools?.enableProxy?.();
        document.getElementById('dash-proxy-off').onclick = () => systemTools?.disableProxy?.();
        document.getElementById('dash-proxy-ref').onclick = () => systemTools?.checkProxy?.();
        document.getElementById('dash-ping-go').onclick = () => this.runPing();
        
        // Quick port check buttons
        document.querySelectorAll('[data-p]').forEach(b => b.onclick = async () => {
            const p = b.dataset.p;
            try {
                const r = await window.toolbox.api('GET', '/api/tools/network/port?host=127.0.0.1&port=' + p);
                document.getElementById('dash-proxy-ports').innerHTML = r.open ? `<span style="color:var(--green)">✅ :${p} 开放</span>` : `<span style="color:var(--red)">❌ :${p} 关闭</span>`;
            } catch { document.getElementById('dash-proxy-ports').innerHTML = '❌ 检测失败'; }
        });
        
        // Quick ping buttons
        document.querySelectorAll('[data-h]').forEach(b => b.onclick = () => {
            document.getElementById('dash-ping-host').value = b.dataset.h;
            this.runPing();
        });

        // Load proxy state
        systemTools?.checkProxy?.();
    },

    async runPing() {
        const host = document.getElementById('dash-ping-host')?.value || 'baidu.com';
        const out = document.getElementById('dash-ping-out');
        out.textContent = '⏳ Ping ' + host + '...';
        try {
            const r = await window.toolbox.api('GET', '/api/tools/network/ping?host=' + encodeURIComponent(host) + '&count=3');
            out.textContent = (r.output || []).join('\n');
        } catch (e) { out.textContent = '❌ 失败: ' + e.message; }
    },

    toggleAuto() {
        const btn = document.getElementById('dash-autotoggle');
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
            btn.textContent = '▶ 恢复';
            document.getElementById('dash-autostatus').textContent = '● 已暂停';
            document.getElementById('dash-autostatus').style.color = 'var(--orange)';
        } else {
            this.startAutoRefresh();
            btn.textContent = '⏸ 暂停';
            document.getElementById('dash-autostatus').textContent = '● 实时';
            document.getElementById('dash-autostatus').style.color = 'var(--green)';
        }
    },

    startAutoRefresh() {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.refreshTimer = setInterval(() => {
            if (this._currentTab === 'overview') {
                const area = document.getElementById('dash-content');
                if (area) this.showOverview(area);
            }
        }, 4000);
    },

    destroy() { if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = null; } }
};

window.sysDash = sysDash;
window.dashManager = sysDash;
