const scriptsManager = {
    pollTimer: null,

    init() {
        this.loadScripts();
    },

    async loadScripts() {
        const list = document.getElementById('scripts-list');
        if (!list) return;
        list.innerHTML = '<div class="empty-state">⏳ 加载脚本列表...</div>';

        try {
            const r = await window.toolbox.api('GET', '/api/scripts/list');
            if (!r.scripts || r.scripts.length === 0) {
                list.innerHTML = '<div class="empty-state"><div style="font-size:32px;opacity:.5">📜</div><div style="margin-top:6px">暂无注册的脚本</div></div>';
                return;
            }

            list.innerHTML = '';

            // Group by tag prefix
            const groups = {};
            r.scripts.forEach(s => {
                const group = (s.tags && s.tags.find(t => t.startsWith('group:'))) || 'group:未分类';
                if (!groups[group]) groups[group] = [];
                groups[group].push(s);
            });

            Object.keys(groups).sort().forEach(gkey => {
                const gname = gkey.replace('group:', '');
                const scripts = groups[gkey];

                const section = document.createElement('div');
                section.style.cssText = 'margin-bottom:12px';

                const header = document.createElement('div');
                header.style.cssText = 'font-size:12px;font-weight:600;color:var(--text2);padding:4px 0 6px;border-bottom:1px solid var(--border);margin-bottom:6px';
                header.textContent = gname;
                section.appendChild(header);

                scripts.forEach(s => {
                    const card = document.createElement('div');
                    card.className = 'svc-item';
                    card.id = 'script-' + s.id;

                    // Port display
                    let portHtml = '';
                    if (s.ports && s.ports.length > 0) {
                        const activePorts = s.activePorts || [];
                        portHtml = s.ports.map(p => {
                            const active = activePorts.includes(p);
                            const conflict = s.portConflict;
                            return `<span class="port-badge ${active ? 'active' : ''} ${conflict ? 'conflict' : ''}" title="${active ? '运行中' : conflict ? '端口被占' : '空闲'}">:${p}</span>`;
                        }).join(' ');
                        if (s.portConflict) {
                            portHtml += ' <span class="port-warn" title="以下端口已被其他进程占用">⚠️</span>';
                        }
                    }

                    let statusText = s.running ? '▶️ 运行中' : '已停止';
                    if (s.running && s.pid) statusText += ` (PID:${s.pid})`;
                    if (s.portConflict) statusText = '⚠️ 端口冲突';

                    card.innerHTML = `
                        <span class="svi">📜</span>
                        <div style="flex:1;min-width:0">
                            <div class="svn">${this.esc(s.name)}</div>
                            <div class="svd">${this.esc(s.description || '')}</div>
                            <div style="margin-top:4px;font-size:11px;display:flex;gap:4px;flex-wrap:wrap">${portHtml}</div>
                        </div>
                        <div id="ss-${s.id}" class="svs ${s.running ? 'on' : 'uk'}">${statusText}</div>
                        <div class="btn-group" style="flex-shrink:0;margin-left:8px">
                            <button class="btn btn-sm script-run" data-id="${s.id}" ${s.running || s.portConflict ? 'disabled' : ''}>▶ 启动</button>
                            <button class="btn btn-sm btn-ghost script-stop" data-id="${s.id}" ${!s.running ? 'disabled' : ''}>■ 停止</button>
                        </div>
                    `;
                    section.appendChild(card);
                });

                list.appendChild(section);
            });

            // Bind run buttons
            list.querySelectorAll('.script-run').forEach(btn => {
                btn.addEventListener('click', async () => {
                    btn.disabled = true;
                    btn.textContent = '⏳ 启动中';
                    await this.runScript(btn.dataset.id);
                    this.loadScripts();
                });
            });

            // Bind stop buttons
            list.querySelectorAll('.script-stop').forEach(btn => {
                btn.addEventListener('click', async () => {
                    btn.disabled = true;
                    btn.textContent = '⏳ 停止中';
                    await this.stopScript(btn.dataset.id);
                    this.loadScripts();
                });
            });

        } catch (e) {
            list.innerHTML = '<div class="empty-state">❌ 加载失败: ' + this.esc(e.message) + '</div>';
        }
    },

    async runScript(id) {
        try {
            const r = await window.toolbox.api('POST', '/api/scripts/' + id + '/run');
            if (r.success) {
                // Poll for completion
                this.pollStatus(id);
            }
            return r;
        } catch (e) { return { error: e.message }; }
    },

    async stopScript(id) {
        try {
            return await window.toolbox.api('POST', '/api/scripts/' + id + '/stop');
        } catch (e) { return { error: e.message }; }
    },

    async pollStatus(id) {
        const ss = document.getElementById('ss-' + id);
        if (ss) ss.textContent = '▶️ 运行中';
        // Poll for 60 seconds max
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 3000));
            try {
                const s = await window.toolbox.api('GET', '/api/scripts/' + id + '/status');
                if (s.running) {
                    if (ss) ss.textContent = '▶️ 运行中 (PID: ' + (s.pid || '') + ')';
                } else {
                    if (ss) ss.textContent = s.exitCode === 0 ? '✅ 已完成' : '❌ 失败 (exit: ' + (s.exitCode || '?') + ')';
                    // Refresh button states
                    this.loadScripts();
                    return;
                }
            } catch(e) { break; }
        }
        // Timeout - refresh anyways
        this.loadScripts();
    },

    esc(s) { const d = document.createElement('div'); d.textContent = s||''; return d.innerHTML; }
};
window.scriptsManager = scriptsManager;
