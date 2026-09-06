// 工具集合：网络工具 / 文本工具 / 系统信息
const toolManager = {
    currentCategory: null,
    currentTool: null,

    init() {
        this.renderCategories();
        this.bindGlobalKeys();
    },

    TIP_DESC: '<div style="font-size:11px;color:var(--text3);margin-bottom:10px;line-height:1.5">{desc}</div>',
    tip(d) { return this.TIP_DESC.replace('{desc}', d); },

    renderCategories() {
        const area = document.getElementById('main-content');
        if (!area) return;

        area.innerHTML = `
        <div style="padding:20px 24px;max-width:1000px;margin:0 auto">
            <h2 style="margin:0 0 20px;font-size:18px">🔧 工具集合</h2>
            <p style="font-size:12px;color:var(--text3);margin-bottom:16px">所有工具本地执行，不依赖外部API，数据不出本机。</p>
            <div class="tool-grid-2">
                <div class="tool-cat-card" data-cat="network">
                    <div class="tcc-icon">🌐</div>
                    <div class="tcc-title">网络工具</div>
                    <div class="tcc-desc">Ping / 路由追踪 / DNS / 端口检测 / 批量扫端口 / HTTP检测<br><span style="font-size:11px;color:var(--text3)">排查网络问题、检测服务可用性、扫端口</span></div>
                </div>
                <div class="tool-cat-card" data-cat="text">
                    <div class="tcc-icon">📝</div>
                    <div class="tcc-title">文本工具</div>
                    <div class="tcc-desc">JSON / Base64 / 正则 / 时间戳 / URL / 哈希 / 密码生成 / 文本统计<br><span style="font-size:11px;color:var(--text3)">开发调试、数据转换、加解密辅助</span></div>
                </div>
                <div class="tool-cat-card" data-cat="lab">
                    <div class="tcc-icon">🧪</div>
                    <div class="tcc-title">文本实验室</div>
                    <div class="tcc-desc">Diff对比 / Markdown预览 / 代码片段管理<br><span style="font-size:11px;color:var(--text3)">文本差异对比、Markdown编辑渲染、代码片段保存管理</span></div>
                </div>
                <div class="tool-cat-card" data-cat="download">
                    <div class="tcc-icon">⬇️</div>
                    <div class="tcc-title">下载工具</div>
                    <div class="tcc-desc">GitHub加速下载：通过国内镜像代理加速GitHub仓库/Release下载<br><span style="font-size:11px;color:var(--text3)">github.com 慢？用镜像代理加速到飞起</span></div>
                </div>
            </div>
        </div>`;

        area.querySelectorAll('.tool-cat-card').forEach(c => {
            c.addEventListener('click', () => this.showCategory(c.dataset.cat));
        });
    },

    showCategory(cat) {
        this.currentCategory = cat;
        this.currentTool = null;
        const area = document.getElementById('main-content');
        if (!area) return;

        if (cat === 'network') {
            area.innerHTML = this.networkPage();
            this.bindNetworkEvents();
        } else if (cat === 'text') {
            area.innerHTML = this.textPage();
            this.bindTextEvents();
        } else if (cat === 'lab') {
            area.innerHTML = this.labPage();
            this.bindLabEvents();
        } else if (cat === 'download') {
            area.innerHTML = this.downloadPage();
            this.bindDownloadEvents();
        }
    },

    // ═══════════ NETWORK TOOLS ═══════════
    networkPage() {
        return `
        <div style="padding:16px 24px;max-width:900px;margin:0 auto">
            <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
                <button class="tool-tab active" data-tool="ping">🏓 Ping</button>
                <button class="tool-tab" data-tool="tracert">📍 路由追踪</button>
                <button class="tool-tab" data-tool="dns">🔍 DNS查询</button>
                <button class="tool-tab" data-tool="port">🔌 端口检测</button>
                <button class="tool-tab" data-tool="port-batch">⚡ 批量扫端口</button>
                <button class="tool-tab" data-tool="http">🌐 HTTP检测</button>
                <button class="tool-tab" style="margin-left:auto" data-tool="back">← 返回分类</button>
            </div>
            <div style="font-size:12px;color:var(--text3);margin-bottom:10px;padding:8px 10px;background:var(--bg2);border-radius:6px;border-left:3px solid var(--accent)">
                🌐 排查网络问题、检测服务器连通性、查看路由路径、扫端口查服务。所有检测本地执行。
            </div>
            <div id="net-tool-content">
                <div class="tool-placeholder">选择上方工具开始</div>
            </div>
        </div>`;
    },

    bindNetworkEvents() {
        document.querySelectorAll('#main-content .tool-tab').forEach(t => {
            t.addEventListener('click', () => {
                if (t.dataset.tool === 'back') return this.renderCategories();
                document.querySelectorAll('#main-content .tool-tab').forEach(x => x.classList.remove('active'));
                t.classList.add('active');
                this.showNetTool(t.dataset.tool);
            });
        });
    },

    showNetTool(tool) {
        const area = document.getElementById('net-tool-content');
        if (!area) return;
        this.currentTool = tool;

        if (tool === 'ping') {
            area.innerHTML = `
            <div class="tool-panel">
                ${this.tip('测试目标主机的网络连通性和延迟。填写域名或IP地址，设置发包次数，返回每个数据包的TTL、时间和统计摘要。')}
                <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
                    <input id="net-ping-host" class="tool-input" placeholder="域名或IP" value="baidu.com" style="flex:1;min-width:150px">
                    <input id="net-ping-count" class="tool-input" placeholder="次数" value="4" style="width:60px">
                    <button class="btn" id="net-ping-go">开始 Ping</button>
                </div>
                <pre id="net-ping-out" class="tool-output">等待测试...</pre>
            </div>`;
            document.getElementById('net-ping-go').onclick = () => this.runPing();

        } else if (tool === 'tracert') {
            area.innerHTML = `
            <div class="tool-panel">
                ${this.tip('追踪数据包到达目标经过的每一跳路由节点。适合排查"到哪个节点断了"或"哪一跳延迟暴增"。最多追踪15跳。')}
                <div style="display:flex;gap:8px;margin-bottom:12px">
                    <input id="net-tr-host" class="tool-input" placeholder="域名或IP" value="baidu.com" style="flex:1">
                    <button class="btn" id="net-tr-go">开始追踪</button>
                </div>
                <pre id="net-tr-out" class="tool-output">等待测试...</pre>
            </div>`;
            document.getElementById('net-tr-go').onclick = () => this.runTracert();

        } else if (tool === 'dns') {
            area.innerHTML = `
            <div class="tool-panel">
                ${this.tip('查询域名的DNS解析记录，查看域名对应的IP地址。适合排查"域名打不开是不是DNS问题"或检查DNS劫持。')}
                <div style="display:flex;gap:8px;margin-bottom:12px">
                    <input id="net-dns-host" class="tool-input" placeholder="域名" value="baidu.com" style="flex:1">
                    <button class="btn" id="net-dns-go">查询</button>
                </div>
                <pre id="net-dns-out" class="tool-output">等待查询...</pre>
            </div>`;
            document.getElementById('net-dns-go').onclick = () => this.runDns();

        } else if (tool === 'port') {
            area.innerHTML = `
            <div class="tool-panel">
                ${this.tip('检测指定IP或域名上的单个端口是否开放。3秒超时，适合快速验证某个服务（如SSH:22, Web:80/443）是否在线。')}
                <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
                    <input id="net-port-host" class="tool-input" placeholder="域名或IP" value="baidu.com" style="flex:1;min-width:150px">
                    <input id="net-port-num" class="tool-input" placeholder="端口" value="80" style="width:80px">
                    <button class="btn" id="net-port-go">检测</button>
                </div>
                <div id="net-port-result" class="tool-output" style="font-size:14px">等待检测...</div>
            </div>`;
            document.getElementById('net-port-go').onclick = () => this.runPort();

        } else if (tool === 'port-batch') {
            area.innerHTML = `
            <div class="tool-panel">
                ${this.tip('批量扫描目标主机上的多个端口。默认扫描27个常用服务端口（FTP/SSH/DNS/HTTP/HTTPS/MySQL/Redis等），结果绿色徽标显示开放端口号。每个端口超时2秒。')}
                <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
                    <input id="net-pb-host" class="tool-input" placeholder="目标IP或域名" value="localhost" style="flex:1;min-width:150px">
                    <button class="btn btn-ghost" id="net-pb-common">常用端口</button>
                    <button class="btn" id="net-pb-go">开始扫描</button>
                </div>
                <div id="net-pb-progress" style="font-size:12px;color:var(--text3);margin-bottom:6px"></div>
                <div id="net-pb-result"></div>
            </div>`;
            document.getElementById('net-pb-go').onclick = () => this.runBatchPort();
            document.getElementById('net-pb-common').onclick = () => {
                document.getElementById('net-pb-host').value = 'localhost';
                this.runBatchPortCommon();
            };
        } else if (tool === 'http') {
            area.innerHTML = `
            <div class="tool-panel">
                ${this.tip('用 curl 检测HTTP/HTTPS URL的状态码、响应时间、内容大小。自动跟随重定向（-L），不超过10秒超时。三卡片展示：状态码（颜色编码）、耗时、大小。')}
                <div style="display:flex;gap:8px;margin-bottom:12px">
                    <input id="net-http-url" class="tool-input" placeholder="URL" value="https://baidu.com" style="flex:1">
                    <button class="btn" id="net-http-go">检测</button>
                </div>
                <div id="net-http-result" class="tool-output" style="font-size:14px">等待检测...</div>
            </div>`;
            document.getElementById('net-http-go').onclick = () => this.runHttp();
        }
    },

    async runPing() {
        const host = document.getElementById('net-ping-host').value.trim();
        const count = document.getElementById('net-ping-count').value.trim() || '4';
        const out = document.getElementById('net-ping-out');
        out.textContent = '⏳ Ping ' + host + '...';
        try {
            const r = await window.toolbox.api('GET', '/api/tools/network/ping?host=' + encodeURIComponent(host) + '&count=' + count);
            out.textContent = (r.output || []).join('\n');
        } catch (e) { out.textContent = '❌ 失败: ' + e.message; }
    },

    async runTracert() {
        const host = document.getElementById('net-tr-host').value.trim();
        const out = document.getElementById('net-tr-out');
        out.textContent = '⏳ 追踪 ' + host + '...';
        try {
            const r = await window.toolbox.api('GET', '/api/tools/network/tracert?host=' + encodeURIComponent(host));
            out.textContent = (r.output || []).join('\n');
        } catch (e) { out.textContent = '❌ 失败: ' + e.message; }
    },

    async runDns() {
        const host = document.getElementById('net-dns-host').value.trim();
        const out = document.getElementById('net-dns-out');
        out.textContent = '⏳ 查询 ' + host + '...';
        try {
            const r = await window.toolbox.api('GET', '/api/tools/network/dns?host=' + encodeURIComponent(host));
            out.textContent = (r.output || []).join('\n');
        } catch (e) { out.textContent = '❌ 失败: ' + e.message; }
    },

    async runPort() {
        const host = document.getElementById('net-port-host').value.trim();
        const port = document.getElementById('net-port-num').value.trim();
        const result = document.getElementById('net-port-result');
        result.innerHTML = '⏳ 检测 ' + host + ':' + port + '...';
        try {
            const r = await window.toolbox.api('GET', '/api/tools/network/port?host=' + encodeURIComponent(host) + '&port=' + port);
            if (r.open) {
                result.innerHTML = '<div style="color:var(--green);font-size:24px;font-weight:bold">✅ 端口 ' + r.port + ' 开放</div><div style="color:var(--text2);margin-top:4px">' + r.host + ':' + r.port + '</div>';
            } else {
                result.innerHTML = '<div style="color:var(--red);font-size:24px;font-weight:bold">❌ 端口 ' + r.port + ' 关闭/被过滤</div><div style="color:var(--text2);margin-top:4px">' + r.host + ':' + r.port + '</div>';
            }
        } catch (e) { result.innerHTML = '❌ 失败: ' + e.message; }
    },

    async runBatchPort() {
        const host = document.getElementById('net-pb-host').value.trim() || 'localhost';
        const progress = document.getElementById('net-pb-progress');
        const result = document.getElementById('net-pb-result');
        
        // 先从 netstat 获取实际监听的端口
        let realPorts = [];
        try {
            const netstat = await window.toolbox.api('GET', '/api/system/ports');
            if (netstat.ports) {
                realPorts = [...new Set(netstat.ports.map(p => p.port))];
                progress.textContent = '⏳ 发现 ' + realPorts.length + ' 个实际端口 + 27 个常用端口...';
            }
        } catch {}
        // 合并实际端口 + 常用端口，去重
        const commonPorts = this.getCommonPorts();
        const allPorts = [...new Set([...realPorts, ...commonPorts])];
        progress.textContent = '⏳ 扫描 ' + host + ' 共 ' + allPorts.length + ' 个端口...';
        try {
            const r = await window.toolbox.api('GET', '/api/tools/network/port-batch?host=' + encodeURIComponent(host) + '&ports=' + allPorts.join(','));
            progress.textContent = '';
            if (r.openCount === 0) {
                result.innerHTML = '<div style="font-size:14px;color:var(--text3);text-align:center;padding:20px">✅ 扫描完毕，没有开放端口</div>';
            } else {
                result.innerHTML = '<div style="margin-bottom:8px;font-size:13px">找到 <strong>' + r.openCount + '</strong> 个开放端口 (实际端口+' + commonPorts.length + '常用)</div>' +
                    '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
                    (r.results || []).filter(x => x.open).map(x =>
                        '<span style="background:var(--green);color:#fff;padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600">' +
                        x.port + (x.processName ? ' ' + x.processName.replace('.exe','') : '') +
                        '</span>'
                    ).join('') +
                    '</div>';
            }
        } catch (e) { result.innerHTML = '❌ 失败: ' + e.message; }
    },

    runBatchPortCommon() {
        const ports = this.getCommonPorts();
        const host = document.getElementById('net-pb-host').value.trim() || 'localhost';
        this.runBatchPortWith(host, ports);
    },

    getCommonPorts() {
        return [21,22,23,25,53,80,110,143,389,443,465,587,636,993,995,1433,1521,3306,3389,5432,5900,6379,8080,8443,9090,27017];
    },

    async runBatchPortWith(host, ports) {
        const progress = document.getElementById('net-pb-progress');
        const result = document.getElementById('net-pb-result');
        progress.textContent = '⏳ 扫描 ' + host + '...';
        try {
            const r = await window.toolbox.api('GET', '/api/tools/network/port-batch?host=' + encodeURIComponent(host) + '&ports=' + ports.join(','));
            progress.textContent = '';
            if (r.openCount === 0) {
                result.innerHTML = '<div style="font-size:14px;color:var(--text3);text-align:center;padding:20px">✅ 没有开放端口</div>';
            } else {
                result.innerHTML = '<div style="margin-bottom:8px;font-size:13px">找到 <strong>' + r.openCount + '</strong> 个开放端口</div>' +
                    '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
                    (r.results || []).filter(x => x.open).map(x =>
                        '<span style="background:var(--green);color:#fff;padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600">' +
                        x.port + (x.processName ? ' ' + x.processName.replace('.exe','') : '') +
                        '</span>'
                    ).join('') +
                    '</div>';
            }
        } catch (e) { result.innerHTML = '❌ 失败: ' + e.message; }
    },

    async runHttp() {
        const url = document.getElementById('net-http-url').value.trim();
        const result = document.getElementById('net-http-result');
        result.innerHTML = '⏳ 检测 ' + url + '...';
        try {
            const r = await window.toolbox.api('GET', '/api/tools/network/http?url=' + encodeURIComponent(url));
            const code = r.httpCode;
            const color = code >= 200 && code < 400 ? 'var(--green)' : code >= 400 && code < 500 ? 'var(--orange)' : 'var(--red)';
            result.innerHTML = `
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
                    <div class="stat-card"><div class="stat-val" style="color:${color}">${code}</div><div class="stat-lbl">HTTP状态码</div></div>
                    <div class="stat-card"><div class="stat-val">${r.timeSec.toFixed(2)}s</div><div class="stat-lbl">响应时间</div></div>
                    <div class="stat-card"><div class="stat-val">${(r.sizeBytes/1024).toFixed(1)}KB</div><div class="stat-lbl">内容大小</div></div>
                </div>`;
        } catch (e) { result.innerHTML = '❌ 失败: ' + e.message; }
    },

    // ═══════════ TEXT TOOLS ═══════════
    textPage() {
        return `
        <div style="padding:16px 24px;max-width:900px;margin:0 auto">
            <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
                <button class="tool-tab active" data-tool="json">📦 JSON</button>
                <button class="tool-tab" data-tool="base64">🔐 Base64</button>
                <button class="tool-tab" data-tool="regex">🔍 正则测试</button>
                <button class="tool-tab" data-tool="timestamp">⏰ 时间戳</button>
                <button class="tool-tab" data-tool="url">🔗 URL编解码</button>
                <button class="tool-tab" data-tool="hash">🔑 哈希</button>
                <button class="tool-tab" data-tool="password">🔒 密码生成</button>
                <button class="tool-tab" data-tool="stats">📊 文本统计</button>
                <button class="tool-tab" style="margin-left:auto" data-tool="back">← 返回分类</button>
            </div>
            <div style="font-size:12px;color:var(--text3);margin-bottom:10px;padding:8px 10px;background:var(--bg2);border-radius:6px;border-left:3px solid var(--accent)">
                📝 开发调试常用工具：数据处理、格式转换、加解密、生成测试数据。所有计算本地完成。
            </div>
            <div id="txt-tool-content">
                <div class="tool-placeholder">选择上方工具开始</div>
            </div>
        </div>`;
    },

    bindTextEvents() {
        document.querySelectorAll('#main-content .tool-tab').forEach(t => {
            t.addEventListener('click', () => {
                if (t.dataset.tool === 'back') return this.renderCategories();
                document.querySelectorAll('#main-content .tool-tab').forEach(x => x.classList.remove('active'));
                t.classList.add('active');
                this.showTextTool(t.dataset.tool);
            });
        });
    },

    showTextTool(tool) {
        const area = document.getElementById('txt-tool-content');
        if (!area) return;
        this.currentTool = tool;

        if (tool === 'json') {
            area.innerHTML = `
            <div class="tool-panel">
                ${this.tip('粘贴JSON文本后点击"格式化为美"自动缩进排版，点击"压缩"去掉空白字符。自动校验JSON语法有效性，右上角实时显示 ✅ 或 ❌。')}
                <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
                    <button class="btn" id="txt-json-format">格式化为美</button>
                    <button class="btn btn-ghost" id="txt-json-minify">压缩</button>
                    <span style="flex:1"></span>
                    <span id="txt-json-status" style="font-size:12px;color:var(--text3)"></span>
                </div>
                <textarea id="txt-json-in" class="tool-textarea" placeholder="粘贴JSON..." style="height:200px"></textarea>
                <div style="margin:6px 0;font-size:12px;color:var(--text3)">▼ 结果</div>
                <textarea id="txt-json-out" class="tool-textarea" placeholder="结果" style="height:200px" readonly></textarea>
            </div>`;
            document.getElementById('txt-json-format').onclick = () => this.processJson('format');
            document.getElementById('txt-json-minify').onclick = () => this.processJson('minify');

        } else if (tool === 'base64') {
            area.innerHTML = `
            <div class="tool-panel">
                ${this.tip('Base64编解码。编码：将文本转为Base64字符串（UTF-8）。解码：将Base64还原为原始文本。适合查看JWT payload、传输二进制数据。')}
                <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
                    <button class="btn" id="txt-b64-encode">编码 →</button>
                    <button class="btn btn-ghost" id="txt-b64-decode">← 解码</button>
                </div>
                <textarea id="txt-b64-in" class="tool-textarea" placeholder="输入文本或Base64..." style="height:150px"></textarea>
                <div style="margin:6px 0;font-size:12px;color:var(--text3)">▼ 结果</div>
                <textarea id="txt-b64-out" class="tool-textarea" placeholder="结果" style="height:150px" readonly></textarea>
            </div>`;
            document.getElementById('txt-b64-encode').onclick = () => this.processBase64('encode');
            document.getElementById('txt-b64-decode').onclick = () => this.processBase64('decode');

        } else if (tool === 'regex') {
            area.innerHTML = `
            <div class="tool-panel">
                ${this.tip('测试正则表达式匹配。填正则（不要包含/分隔符，如 \\\\d+ 而不是 /\\\\d+/），flags框填 g/i/m。返回每个匹配的位置、内容和捕获组。')}
                <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;align-items:center">
                    <input id="txt-regex-pattern" class="tool-input" placeholder="正则表达式" style="flex:1;font-family:monospace">
                    <input id="txt-regex-flags" class="tool-input" placeholder="flags" value="g" style="width:60px;font-family:monospace">
                    <button class="btn" id="txt-regex-go">测试</button>
                    <span id="txt-regex-count" style="font-size:12px;color:var(--text3);margin-left:8px"></span>
                </div>
                <textarea id="txt-regex-text" class="tool-textarea" placeholder="待匹配的文本..." style="height:180px"></textarea>
                <pre id="txt-regex-out" class="tool-output" style="max-height:200px">结果</pre>
            </div>`;
            document.getElementById('txt-regex-go').onclick = () => this.runRegex();

        } else if (tool === 'timestamp') {
            const now = Math.floor(Date.now() / 1000);
            area.innerHTML = `
            <div class="tool-panel">
                ${this.tip('时间戳转换。填入Unix秒/毫秒数或ISO日期字符串，选择类型后点击转换。同时输出Unix秒、毫秒、ISO、北京时间、UTC、年月日时分秒星期。')}
                <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
                    <input id="txt-ts-value" class="tool-input" placeholder="时间戳或日期" value="${now}" style="flex:1;font-family:monospace">
                    <select id="txt-ts-type" class="tool-input" style="width:100px">
                        <option value="unix">Unix秒</option>
                        <option value="unixms">Unix毫秒</option>
                        <option value="iso">ISO日期</option>
                    </select>
                    <button class="btn" id="txt-ts-go">转换</button>
                </div>
                <pre id="txt-ts-out" class="tool-output" style="max-height:300px">结果...</pre>
            </div>`;
            document.getElementById('txt-ts-go').onclick = () => this.runTimestamp();

        } else if (tool === 'url') {
            area.innerHTML = `
            <div class="tool-panel">
                ${this.tip('URL编解码。编码：将文本转为URL安全的 encodeURIComponent 格式。解码：将编码后的URL参数还原。适合处理含中文/特殊符号的URL。')}
                <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
                    <button class="btn" id="txt-url-encode">编码 →</button>
                    <button class="btn btn-ghost" id="txt-url-decode">← 解码</button>
                </div>
                <textarea id="txt-url-in" class="tool-textarea" placeholder="输入..." style="height:120px"></textarea>
                <div style="margin:6px 0;font-size:12px;color:var(--text3)">▼ 结果</div>
                <textarea id="txt-url-out" class="tool-textarea" placeholder="结果" style="height:120px" readonly></textarea>
            </div>`;
            document.getElementById('txt-url-encode').onclick = () => this.processUrl('encode');
            document.getElementById('txt-url-decode').onclick = () => this.processUrl('decode');
        } else if (tool === 'hash') {
            area.innerHTML = `
            <div class="tool-panel">
                ${this.tip('计算文本的哈希值。支持MD5/SHA1/SHA256/SHA512。下拉选择算法，输入文本点"计算哈希"。结果显示摘要（小写）和大写版本。')}
                <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;align-items:center">
                    <select id="txt-hash-alg" class="tool-input" style="width:100px">
                        <option value="md5">MD5</option>
                        <option value="sha1">SHA1</option>
                        <option value="sha256" selected>SHA256</option>
                        <option value="sha512">SHA512</option>
                    </select>
                    <button class="btn" id="txt-hash-go">计算哈希</button>
                </div>
                <textarea id="txt-hash-in" class="tool-textarea" placeholder="输入要计算哈希的文本..." style="height:120px"></textarea>
                <pre id="txt-hash-out" class="tool-output" style="max-height:120px">结果</pre>
            </div>`;
            document.getElementById('txt-hash-go').onclick = () => this.runHash();
        } else if (tool === 'password') {
            area.innerHTML = `
            <div class="tool-panel">
                ${this.tip('生成随机密码。勾选需要的字符类型组合（大写/小写/数字/符号），设置长度后点击生成。左侧显示强度/熵值，可命名保存到密码库。')}
                <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;align-items:center">
                    <span style="font-size:12px;color:var(--text3);margin-right:4px">长度:</span>
                    <input id="txt-pw-len" type="number" class="tool-input" value="16" min="4" max="128" style="width:70px">
                    <label style="font-size:12px;display:flex;align-items:center;gap:3px;cursor:pointer"><input type="checkbox" id="txt-pw-upper" checked> A-Z</label>
                    <label style="font-size:12px;display:flex;align-items:center;gap:3px;cursor:pointer"><input type="checkbox" id="txt-pw-lower" checked> a-z</label>
                    <label style="font-size:12px;display:flex;align-items:center;gap:3px;cursor:pointer"><input type="checkbox" id="txt-pw-digit" checked> 0-9</label>
                    <label style="font-size:12px;display:flex;align-items:center;gap:3px;cursor:pointer"><input type="checkbox" id="txt-pw-special" checked> !@#</label>
                    <button class="btn" id="txt-pw-go">生成</button>
                    <button class="btn btn-ghost" id="txt-pw-copy">📋 复制</button>
                </div>
                <div style="display:flex;gap:8px;margin-bottom:6px">
                    <div id="txt-pw-result" class="tool-output" style="flex:1;font-size:16px;text-align:center;letter-spacing:1px;min-height:50px;display:flex;align-items:center;justify-content:center">点击生成</div>
                    <div style="width:140px;border:1px solid var(--border);border-radius:6px;padding:8px;background:var(--bg3)">
                        <div style="font-size:11px;color:var(--text3);margin-bottom:2px">强度</div>
                        <div style="font-size:20px;font-weight:700" id="txt-pw-strength">-</div>
                        <div style="font-size:10px;color:var(--text3);margin-top:4px">熵: <span id="txt-pw-entropy">-</span> bit</div>
                        <div style="font-size:10px;color:var(--text3)">位数: <span id="txt-pw-length">-</span></div>
                    </div>
                </div>
                <div style="display:flex;gap:6px;margin-top:4px">
                    <input id="txt-pw-save-name" class="tool-input" placeholder="命名保存此密码到本地库..." style="flex:1;font-size:11px;padding:3px 8px">
                    <button class="btn btn-sm" id="txt-pw-save-btn" style="font-size:11px">💾 保存</button>
                </div>
                <div id="txt-pw-saved-list" style="margin-top:8px"></div>
            </div>`;
            document.getElementById('txt-pw-go').onclick = () => this.runPassword();
            document.getElementById('txt-pw-copy').onclick = () => {
                const pw = document.getElementById('txt-pw-result').textContent;
                if (pw && pw !== '点击生成') navigator.clipboard.writeText(pw);
            };
            document.getElementById('txt-pw-save-btn').onclick = () => this.savePassword();
            this.loadSavedPasswords();
        } else if (tool === 'stats') {
            area.innerHTML = `
            <div class="tool-panel">
                ${this.tip('统计文本的字数信息：字符数（含/不含空格）、汉字数、标点数、词数、行数、UTF-8字节数。支持中英文混排。')}
                <div style="margin-bottom:8px">
                    <button class="btn" id="txt-stats-go">统计</button>
                </div>
                <textarea id="txt-stats-in" class="tool-textarea" placeholder="粘贴文本..." style="height:180px"></textarea>
                <pre id="txt-stats-out" class="tool-output" style="max-height:250px">结果</pre>
            </div>`;
            document.getElementById('txt-stats-go').onclick = () => this.runTextStats();
        }
    },

    async processJson(action) {
        const input = document.getElementById('txt-json-in').value;
        const out = document.getElementById('txt-json-out');
        const status = document.getElementById('txt-json-status');
        out.value = '⏳ 处理中...';
        try {
            const r = await window.toolbox.api('POST', '/api/tools/text/json', { input, action });
            out.value = r.output || r.error;
            status.textContent = r.valid ? '✅ 有效JSON' : '❌ 无效';
        } catch (e) { out.value = '❌ ' + e.message; }
    },

    async processBase64(action) {
        const input = document.getElementById('txt-b64-in').value;
        document.getElementById('txt-b64-out').value = '⏳ 处理中...';
        try {
            const r = await window.toolbox.api('POST', '/api/tools/text/base64', { input, action });
            document.getElementById('txt-b64-out').value = r.output || r.error;
        } catch (e) { document.getElementById('txt-b64-out').value = '❌ ' + e.message; }
    },

    async processUrl(action) {
        const input = document.getElementById('txt-url-in').value;
        document.getElementById('txt-url-out').value = '⏳ 处理中...';
        try {
            const r = await window.toolbox.api('POST', '/api/tools/text/url', { input, action });
            document.getElementById('txt-url-out').value = r.output || r.error;
        } catch (e) { document.getElementById('txt-url-out').value = '❌ ' + e.message; }
    },

    async runRegex() {
        const text = document.getElementById('txt-regex-text').value;
        const pattern = document.getElementById('txt-regex-pattern').value;
        const flags = document.getElementById('txt-regex-flags').value;
        const out = document.getElementById('txt-regex-out');
        const count = document.getElementById('txt-regex-count');
        out.textContent = '⏳ 测试中...';
        try {
            const r = await window.toolbox.api('POST', '/api/tools/text/regex', { text, pattern, flags });
            if (r.success) {
                out.textContent = r.count === 0 ? '⚠️ 无匹配结果' : r.matches.map((m, i) => `[${i+1}] 位置 ${m.index}: "${m.match}"${m.groups.length ? ' 捕获: '+m.groups.join(', ') : ''}`).join('\n');
                count.textContent = `共 ${r.count} 个匹配`;
            } else {
                out.textContent = '❌ ' + r.error;
                count.textContent = '';
            }
        } catch (e) { out.textContent = '❌ ' + e.message; }
    },

    async runTimestamp() {
        const value = document.getElementById('txt-ts-value').value.trim();
        const type = document.getElementById('txt-ts-type').value;
        const out = document.getElementById('txt-ts-out');
        out.textContent = '⏳ 转换中...';
        try {
            const r = await window.toolbox.api('GET', '/api/tools/text/timestamp?value=' + encodeURIComponent(value) + '&type=' + type);
            if (r.success) {
                out.textContent = [
                    `Unix秒:     ${r.unix}`,
                    `Unix毫秒:   ${r.unixMs}`,
                    `ISO:        ${r.iso}`,
                    `北京时间:   ${r.local}`,
                    `UTC:        ${r.utc}`,
                    `日期:       ${r.year}年${r.month}月${r.day}日`,
                    `时间:       ${r.hour}:${String(r.minute).padStart(2,'0')}:${String(r.second).padStart(2,'0')}`,
                    `星期:       星期${r.weekday}`,
                ].join('\n');
            } else {
                out.textContent = '❌ ' + r.error;
            }
        } catch (e) { out.textContent = '❌ ' + e.message; }
    },

    async runHash() {
        const input = document.getElementById('txt-hash-in').value;
        const algorithm = document.getElementById('txt-hash-alg').value;
        const out = document.getElementById('txt-hash-out');
        out.textContent = '⏳ 计算中...';
        try {
            const r = await window.toolbox.api('POST', '/api/tools/text/hash', { input, algorithm });
            if (r.success) {
                out.textContent = r.algorithm.toUpperCase() + ':\n' + r.hash + '\n\n大写:\n' + r.upper;
            } else {
                out.textContent = '❌ ' + r.error;
            }
        } catch (e) { out.textContent = '❌ ' + e.message; }
    },

    async runPassword() {
        const length = document.getElementById('txt-pw-len').value;
        const result = document.getElementById('txt-pw-result');
        const upper = document.getElementById('txt-pw-upper').checked;
        const lower = document.getElementById('txt-pw-lower').checked;
        const digits = document.getElementById('txt-pw-digit').checked;
        const special = document.getElementById('txt-pw-special').checked;
        if (!upper && !lower && !digits && !special) { result.textContent = '⚠️ 请至少选择一种字符类型'; return; }
        result.textContent = '⏳ 生成中...';
        try {
            const r = await window.toolbox.api('POST', '/api/tools/text/password', { length: parseInt(length) || 16, upper, lower, digits, special });
            if (r.success) {
                result.textContent = r.password;
                document.getElementById('txt-pw-strength').textContent = r.strength;
                document.getElementById('txt-pw-entropy').textContent = r.entropy;
                document.getElementById('txt-pw-length').textContent = r.length;
            } else {
                result.textContent = '❌ ' + r.error;
            }
        } catch (e) { result.textContent = '❌ ' + e.message; }
    },

    async savePassword() {
        const name = document.getElementById('txt-pw-save-name')?.value?.trim();
        const pw = document.getElementById('txt-pw-result')?.textContent;
        if (!name || !pw || pw === '点击生成') { alert('请先生成密码，再填写名称保存'); return; }
        try {
            await window.toolbox.api('POST', '/api/tools/text/save-password', { name, password: pw });
            document.getElementById('txt-pw-save-name').value = '';
            this.loadSavedPasswords();
        } catch (e) { alert('保存失败: ' + e.message); }
    },

    async loadSavedPasswords() {
        const el = document.getElementById('txt-pw-saved-list');
        if (!el) return;
        try {
            const r = await window.toolbox.api('GET', '/api/tools/text/saved-passwords');
            const list = r.passwords || [];
            if (!list.length) { el.innerHTML = '<div style="font-size:11px;color:var(--text3)">暂无保存的密码</div>'; return; }
            el.innerHTML = '<div style="font-size:11px;color:var(--text3);margin-bottom:4px">已保存的密码 (' + list.length + '):</div>' + list.reverse().map(s => `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--bg3);border-radius:4px;margin-bottom:3px;font-size:11px"><span><strong>${s.name}</strong> <code style="color:var(--accent);margin-left:6px">${s.password}</code></span><button class="snip-del" data-id="${s.id}" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px">✕</button></div>`).join('');
            el.querySelectorAll('.snip-del').forEach(btn => btn.onclick = async (e) => {
                e.stopPropagation();
                if (!confirm('删除此密码？')) return;
                await window.toolbox.api('DELETE', '/api/tools/text/saved-password/' + btn.dataset.id);
                this.loadSavedPasswords();
            });
        } catch { el.innerHTML = '<div style="font-size:11px;color:var(--red)">加载失败</div>'; }
    },

    async runTextStats() {
        const text = document.getElementById('txt-stats-in').value;
        const out = document.getElementById('txt-stats-out');
        out.textContent = '⏳ 统计中...';
        try {
            const r = await window.toolbox.api('POST', '/api/tools/text/stats', { text });
            if (r.success) {
                out.textContent = [
                    '字符数（含空格）:  ' + r.chars,
                    '字符数（不含空格）: ' + r.charsNoSpace,
                    '汉字数:               ' + r.cjk,
                    '标点数:               ' + r.punctuation,
                    '词数:                 ' + r.words,
                    '行数:                 ' + r.lines,
                    'UTF-8 字节:          ' + r.bytes,
                ].join('\n');
            } else {
                out.textContent = '❌ ' + r.error;
            }
        } catch (e) { out.textContent = '❌ ' + e.message; }
    },

    // ═══════════ SYSTEM INFO ═══════════
    systemPage() {
        return `
        <div style="padding:16px 24px;max-width:900px;margin:0 auto">
            <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
                <button class="tool-tab active" data-tool="summary">📊 概览</button>
                <button class="tool-tab" data-tool="processes">⚙️ 进程</button>
                <button class="tool-tab" data-tool="network">🌐 网络</button>
                <button class="tool-tab" data-tool="env">📋 环境变量</button>
                <button class="tool-tab" data-tool="services">⚙️ 服务列表</button>
                <button class="tool-tab" data-tool="gpu">🎮 GPU信息</button>
                <button class="tool-tab" style="margin-left:auto" data-tool="back">← 返回分类</button>
            </div>
            <div style="font-size:12px;color:var(--text3);margin-bottom:10px;padding:8px 10px;background:var(--bg2);border-radius:6px;border-left:3px solid var(--accent)">
                💻 全面了解系统运行状态：资源使用率、运行进程、网络连接、系统服务。所有数据来自本机。
            </div>
            <div id="sys-tool-content"><div class="tool-placeholder">加载中...</div></div>
        </div>`;
    },

    bindSystemEvents() {
        document.querySelectorAll('#main-content .tool-tab').forEach(t => {
            t.addEventListener('click', () => {
                if (t.dataset.tool === 'back') return this.renderCategories();
                document.querySelectorAll('#main-content .tool-tab').forEach(x => x.classList.remove('active'));
                t.classList.add('active');
                this.showSysTool(t.dataset.tool);
            });
        });
    },

    showSysTool(tool) {
        if (tool === 'summary') this.loadSystemInfo();
        else if (tool === 'processes') this.loadProcesses();
        else if (tool === 'network') this.loadNetworkInfo();
        else if (tool === 'env') this.loadEnvInfo();
        else if (tool === 'services') this.loadServices();
        else if (tool === 'gpu') this.loadGpuInfo();
    },

    async loadSystemInfo() {
        const area = document.getElementById('sys-tool-content');
        if (!area) return;
        area.innerHTML = '<div class="tool-panel">' + this.tip('系统概览：主机名、系统版本、运行时间、CPU型号和核心数。内存和磁盘用量用进度条展示，超60%橙色、超80%（磁盘85%）红色预警。') + '<div class="tool-placeholder">📊 加载系统信息...</div></div>';
        try {
            const r = await window.toolbox.api('GET', '/api/tools/system/info');
            if (!r.success) { area.innerHTML = '❌ 失败'; return; }
            
            const day = Math.floor(r.uptime / 86400);
            const hour = Math.floor((r.uptime % 86400) / 3600);
            const min = Math.floor((r.uptime % 3600) / 60);

            const memPct = parseFloat(r.memory.percent);
            const memColor = memPct > 80 ? 'var(--red)' : memPct > 60 ? 'var(--orange)' : 'var(--green)';

            let diskHtml = '';
            if (r.disks && r.disks.length) {
                r.disks.forEach(d => {
                    const pct = d.totalBytes > 0 ? ((1 - d.freeBytes/d.totalBytes) * 100).toFixed(1) : 0;
                    const pctNum = parseFloat(pct);
                    const dColor = pctNum > 85 ? 'var(--red)' : pctNum > 70 ? 'var(--orange)' : 'var(--green)';
                    diskHtml += `<div style="margin-bottom:8px">
                        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px">
                            <span>${d.drive} ${d.label}</span>
                            <span>${(d.totalBytes/1073741824).toFixed(1)}GB / ${(d.freeBytes/1073741824).toFixed(1)}GB 可用 (${pct}% 已用)</span>
                        </div>
                        <div class="tool-bar"><div class="tool-bar-fill" style="width:${pct}%;background:${dColor}"></div></div>
                    </div>`;
                });
            }

            area.innerHTML = `
                <div class="tool-panel">
                    ${this.tip('系统概览：主机名、系统版本、运行时间、CPU型号和核心数。内存和磁盘用量用进度条展示，超60%橙色、超80%（磁盘85%）红色预警。')}
                    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:16px">
                        <div class="stat-card"><div class="stat-val">${r.hostname}</div><div class="stat-lbl">主机名</div></div>
                        <div class="stat-card"><div class="stat-val">${r.platform} ${r.arch}</div><div class="stat-lbl">系统</div></div>
                        <div class="stat-card"><div class="stat-val">${day}天${hour}时${min}分</div><div class="stat-lbl">运行时间</div></div>
                        <div class="stat-card"><div class="stat-val">${r.cpu.cores}核</div><div class="stat-lbl">${(r.cpu.model||'').slice(0,30)}</div></div>
                    </div>

                    <div style="margin-bottom:12px">
                        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px">
                            <span>内存使用</span>
                            <span>${(r.memory.used/1073741824).toFixed(1)}GB / ${(r.memory.total/1073741824).toFixed(1)}GB (${r.memory.percent}%)</span>
                        </div>
                        <div class="tool-bar"><div class="tool-bar-fill" style="width:${r.memory.percent}%;background:${memColor}"></div></div>
                    </div>

                    <div style="font-size:13px;font-weight:600;margin-bottom:8px">💾 磁盘</div>
                    ${diskHtml || '<div style="color:var(--text3);font-size:12px">无磁盘信息</div>'}
                </div>`;
        } catch (e) { area.innerHTML = '❌ 加载失败: ' + e.message; }
    },

    async loadProcesses() {
        const area = document.getElementById('sys-tool-content');
        if (!area) return;
        area.innerHTML = '<div class="tool-panel">' + this.tip('当前系统的进程列表，按内存占用降序排列显示前50个。显示PID、进程名称、内存占用量（KB/MB/GB自适应）。适合快速定位内存占用大的进程。') + '<div class="tool-placeholder">⚙️ 加载进程列表...</div></div>';
        try {
            const r = await window.toolbox.api('GET', '/api/tools/system/processes');
            if (!r.success) { area.innerHTML = '❌ 失败'; return; }
            const top = r.processes.sort((a,b) => b.memKB - a.memKB).slice(0, 50);
            area.innerHTML = `
                <div class="tool-panel" style="padding:0;overflow:hidden">
                    <div style="padding:8px 12px">${this.tip('当前系统的进程列表，按内存占用降序排列显示前50个。显示PID、进程名称、内存占用量。适合快速定位内存占用大的进程。')}</div>
                    <div style="max-height:400px;overflow-y:auto">
                    <table class="proc-table">
                        <tr><th>PID</th><th>名称</th><th>内存</th></tr>
                        ${top.map(p => `<tr><td>${p.pid}</td><td>${p.name}</td><td>${p.memKB > 1048576 ? (p.memKB/1048576).toFixed(1)+'GB' : p.memKB > 1024 ? (p.memKB/1024).toFixed(1)+'MB' : p.memKB+'KB'}</td></tr>`).join('')}
                    </table>
                    </div>
                    <div style="font-size:12px;color:var(--text3);padding:6px 12px">共 ${r.total} 个进程 | 显示内存占用前50</div>
                </div>`;
        } catch (e) { area.innerHTML = '❌ 失败: ' + e.message; }
    },

    async loadNetworkInfo() {
        const area = document.getElementById('sys-tool-content');
        if (!area) return;
        area.innerHTML = '<div class="tool-panel">' + this.tip('网络连接统计：当前活跃TCP连接数、监听端口数。列出所有网卡接口的IP地址和MAC地址。适合查看"本机开了哪些端口"和"有哪些网卡"。') + '<div class="tool-placeholder">🌐 加载网络信息...</div></div>';
        try {
            const r = await window.toolbox.api('GET', '/api/tools/system/network');
            if (!r.success) { area.innerHTML = '❌ 失败'; return; }
            area.innerHTML = `
                <div class="tool-panel">
                    ${this.tip('网络连接统计：当前活跃TCP连接数、监听端口数。列出所有网卡接口的IP地址和MAC地址。')}
                    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:16px">
                        <div class="stat-card"><div class="stat-val">${r.connections}</div><div class="stat-lbl">活跃连接</div></div>
                        <div class="stat-card"><div class="stat-val">${r.listening}</div><div class="stat-lbl">监听端口</div></div>
                    </div>
                    <div style="font-size:13px;font-weight:600;margin-bottom:8px">🖧 网络接口</div>
                    ${r.interfaces.map(i => `
                        <div style="font-size:12px;margin-bottom:6px;padding:6px 8px;background:var(--bg2);border-radius:4px">
                            <div style="font-weight:600">${i.name}</div>
                            ${i.addresses.map(a => `<div>${a.family === 'IPv4' ? '🌐' : '🔷'} ${a.address} (MAC: ${a.mac})</div>`).join('')}
                        </div>
                    `).join('') || '<div style="color:var(--text3);font-size:12px">无网络接口信息</div>'}
                </div>`;
        } catch (e) { area.innerHTML = '❌ 失败: ' + e.message; }
    },

    async loadEnvInfo() {
        const area = document.getElementById('sys-tool-content');
        if (!area) return;
        area.innerHTML = '<div class="tool-panel">' + this.tip('系统环境变量列表。显示Node.js版本和可执行文件路径，以及所有环境变量的名称和值（前100个）。适合排查路径配置问题。') + '<div class="tool-placeholder">📋 加载环境变量...</div></div>';
        try {
            const r = await window.toolbox.api('GET', '/api/tools/system/env');
            if (!r.success) { area.innerHTML = '❌ 失败'; return; }
            const envArr = Object.entries(r.env).slice(0, 100);
            area.innerHTML = `
                <div class="tool-panel" style="padding:0;overflow:hidden">
                    <div style="padding:8px 12px">${this.tip('系统环境变量列表。显示Node.js版本和可执行文件路径，以及所有环境变量的名称和值（前100个）。')}</div>
                    <div style="max-height:400px;overflow-y:auto">
                    <table class="proc-table">
                        <tr><th style="width:180px">变量名</th><th>值</th></tr>
                        ${envArr.map(([k,v]) => `<tr><td style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px">${k}</td><td style="font-size:11px;word-break:break-all">${String(v).substring(0,200)}</td></tr>`).join('')}
                    </table>
                    </div>
                    <div style="font-size:12px;color:var(--text3);padding:6px 12px">Node ${r.nodeVersion} | 共 ${r.envCount} 个变量 | 显示前100</div>
                </div>`;
        } catch (e) { area.innerHTML = '❌ 失败: ' + e.message; }
    },

    async loadServices() {
        const area = document.getElementById('sys-tool-content');
        if (!area) return;
        area.innerHTML = '<div class="tool-panel">' + this.tip('Windows系统服务列表。显示所有服务的名称、显示名、运行状态（🟢运行中/⏹已停止）和启动类型（自动/手动/禁用）。共扫描314个系统服务。') + '<div class="tool-placeholder">⚙️ 加载系统服务列表...</div></div>';
        try {
            const r = await window.toolbox.api('GET', '/api/tools/system/services');
            if (!r.success) { area.innerHTML = '❌ 失败'; return; }
            const running = r.services.filter(s => s.state === 'RUNNING').length;
            const stopped = r.services.filter(s => s.state === 'STOPPED').length;
            area.innerHTML = `
                <div class="tool-panel" style="padding:0;overflow:hidden">
                    <div style="padding:8px 12px">${this.tip('Windows系统服务列表。显示所有服务的名称、显示名、运行状态和启动类型。')}</div>
                    <div style="font-size:12px;color:var(--text3);padding:0 12px 8px;display:flex;gap:12px;flex-wrap:wrap">
                        <span>共 ${r.total} 个服务</span>
                        <span style="color:var(--green)">▶ ${running} 运行中</span>
                        <span style="color:var(--text3)">⏹ ${stopped} 已停止</span>
                        <span style="flex:1"></span>
                        <span style="font-size:11px;color:var(--text2)">显示前200条</span>
                    </div>
                    <div style="max-height:450px;overflow-y:auto">
                    <table class="proc-table">
                        <tr><th style="width:50px">状态</th><th>名称</th><th>显示名</th><th style="width:50px">启动</th></tr>
                        ${r.services.slice(0,200).map(s => `<tr>
                            <td style="text-align:center">${s.state === 'RUNNING' ? '🟢' : '⏹'}</td>
                            <td style="font-family:monospace;font-size:11px">${s.name}</td>
                            <td>${s.display}</td>
                            <td style="font-size:11px">${s.startType}</td>
                        </tr>`).join('')}
                    </table>
                    </div>
                </div>`;
        } catch (e) { area.innerHTML = '❌ 失败: ' + e.message; }
    },

    async loadGpuInfo() {
        const area = document.getElementById('sys-tool-content');
        if (!area) return;
        area.innerHTML = '<div class="tool-panel">' + this.tip('显卡信息：型号、显存大小、驱动版本、处理器、当前分辨率。使用 wmic 检测，如果系统中 wmic 不可用（如Windows 11），会显示提示。') + '<div class="tool-placeholder">🎮 加载显卡信息...</div></div>';
        try {
            const r = await window.toolbox.api('GET', '/api/tools/system/gpu');
            if (!r.success) { area.innerHTML = '❌ 失败'; return; }
            if (!r.cards || !r.cards.length || r.cards[0].caption === 'N/A (wmic 不可用)') {
                area.innerHTML = '<div class="tool-panel">' + this.tip('显卡信息：型号、显存大小、驱动版本、处理器、当前分辨率。') + '<div style="padding:20px;text-align:center;color:var(--text3)">系统未检测到独立显卡（或 wmic 已弃用）</div></div>';
                return;
            }
            area.innerHTML = `<div class="tool-panel">${this.tip('显卡信息：型号、显存大小、驱动版本、处理器、当前分辨率。')}${r.cards.map(c => {
                const ramGB = c.adapterRam > 0 ? (c.adapterRam / 1073741824).toFixed(1) + 'GB' : '未知';
                return `<div style="margin-bottom:12px;padding:10px;background:var(--bg3);border-radius:6px">
                    <div style="font-size:14px;font-weight:600;margin-bottom:6px">🎮 ${c.caption}</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px">
                        <div><span style="color:var(--text3)">显存:</span> ${ramGB}</div>
                        <div><span style="color:var(--text3)">分辨率:</span> ${c.hRes}x${c.vRes}</div>
                        <div><span style="color:var(--text3)">驱动版本:</span> ${c.driverVersion || '未知'}</div>
                    </div>
                </div>`;
            }).join('')}</div>`;
        } catch (e) { area.innerHTML = '❌ 失败: ' + e.message; }
    },

    // ═══════════ TEXT LAB ═══════════
    labPage() {
        return `
        <div style="padding:16px 24px;max-width:900px;margin:0 auto">
            <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
                <button class="tool-tab active" data-tool="diff">📋 Diff对比</button>
                <button class="tool-tab" data-tool="md">📝 Markdown</button>
                <button class="tool-tab" data-tool="snip">📦 代码片段</button>
                <button class="tool-tab" style="margin-left:auto" data-tool="back">← 返回分类</button>
            </div>
            <div style="font-size:12px;color:var(--text3);margin-bottom:10px;padding:8px 10px;background:var(--bg2);border-radius:6px;border-left:3px solid var(--accent)">
                🧪 文本对比、Markdown预览、代码片段管理 — 写作辅助工具集
            </div>
            <div id="lab-tool-content">
                <div class="tool-placeholder">选择上方工具开始</div>
            </div>
        </div>`;
    },

    bindLabEvents() {
        document.querySelectorAll('#main-content .tool-tab').forEach(t => {
            t.addEventListener('click', () => {
                if (t.dataset.tool === 'back') return this.renderCategories();
                document.querySelectorAll('#main-content .tool-tab').forEach(x => x.classList.remove('active'));
                t.classList.add('active');
                this.showLabTool(t.dataset.tool);
            });
        });
    },

    showLabTool(tool) {
        const area = document.getElementById('lab-tool-content');
        if (!area) return;
        if (tool === 'diff') {
            area.innerHTML = '<div class="tool-panel">' + this.tip('左右两栏粘贴文本，实时行级差异对比。红色=删除，绿色=新增，橙色=修改。500ms防抖自动检测差异。') + '<div class="diff-grid"><div><div style="font-size:11px;color:var(--text3);margin-bottom:4px">← 原文</div><textarea id="lab-diff1" class="tool-textarea" style="height:280px" placeholder="原始文本..."></textarea></div><div><div style="font-size:11px;color:var(--text3);margin-bottom:4px">→ 新文本</div><textarea id="lab-diff2" class="tool-textarea" style="height:280px" placeholder="新文本..."></textarea></div></div><div id="lab-diff-result" style="margin-top:8px;max-height:300px;overflow:auto"></div></div>';
            document.getElementById('lab-diff1').oninput = () => this.runLabDiff();
            document.getElementById('lab-diff2').oninput = () => this.runLabDiff();
        } else if (tool === 'md') {
            area.innerHTML = '<div class="tool-panel">' + this.tip('左侧写Markdown，右侧实时预览渲染效果。支持：标题H1-H3、粗体、斜体、行内代码、代码块、引用、列表。') + '<div class="md-grid"><div><textarea id="lab-md-in" class="tool-textarea" style="height:400px;font-family:monospace" placeholder="输入 Markdown..."># Markdown 预览\n\n这是一个 **Markdown** 测试。\n\n## 功能\n\n- **粗体** *斜体*\n- \`行内代码\`\n- 引用\n\n> 引用内容</textarea></div><div class="md-preview" id="lab-md-out"><div style="padding:20px;color:var(--text3)">实时预览...</div></div></div></div>';
            document.getElementById('lab-md-in').oninput = () => this.renderLabMarkdown();
            this.renderLabMarkdown();
        } else if (tool === 'snip') {
            area.innerHTML = '<div class="tool-panel">' + this.tip('保存常用代码片段。填写标题、选择语言、添加标签后保存。点击已保存的片段可以加载编辑，点✕删除。') + '<div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap"><input id="lab-snip-title" class="tool-input" placeholder="标题" style="flex:2;min-width:100px"><select id="lab-snip-lang" class="tool-input" style="width:90px"><option>plaintext</option><option>javascript</option><option>python</option><option>html</option><option>css</option><option>json</option><option>shell</option></select><input id="lab-snip-tags" class="tool-input" placeholder="标签,逗号分隔" style="flex:1"><button class="btn" id="lab-snip-save">💾 保存</button><button class="btn btn-ghost" id="lab-snip-ref">⟳</button></div><textarea id="lab-snip-code" class="tool-textarea" style="height:150px;font-family:monospace" placeholder="粘贴代码..."></textarea><div id="lab-snip-list" style="margin-top:8px"><div class="tool-placeholder">加载中...</div></div></div>';
            document.getElementById('lab-snip-save').onclick = () => this.saveLabSnippet();
            document.getElementById('lab-snip-ref').onclick = () => this.loadLabSnippets();
            this.loadLabSnippets();
        }
    },

    _labDiffTimer: null,
    async runLabDiff() {
        if (this._labDiffTimer) clearTimeout(this._labDiffTimer);
        this._labDiffTimer = setTimeout(async () => {
            const t1 = document.getElementById('lab-diff1')?.value || '';
            const t2 = document.getElementById('lab-diff2')?.value || '';
            const res = document.getElementById('lab-diff-result');
            if (!t1 && !t2) { res.innerHTML = ''; return; }
            try {
                const r = await window.toolbox.api('POST', '/api/tools/text/diff', { text1: t1, text2: t2 });
                if (r.success) {
                    res.innerHTML = '<div style="font-size:11px;color:var(--text3);margin-bottom:4px">差异: ' + r.changed + ' 处</div>' + r.diffs.map(d => {
                        const cls = d.type==='removed'?'diff-rm':d.type==='added'?'diff-add':'diff-chg';
                        return '<div class="diff-line ' + cls + '"><span class="diff-num">' + d.line + '</span><span class="diff-icon">' + (d.type==='removed'?'−':'+') + '</span><span>' + ((d.old||d.new||'').substring(0,200)) + '</span></div>';
                    }).join('');
                }
            } catch {}
        }, 500);
    },

    async renderLabMarkdown() {
        const text = document.getElementById('lab-md-in')?.value || '';
        try {
            const r = await window.toolbox.api('POST', '/api/tools/text/markdown', { text });
            const pv = document.getElementById('lab-md-out');
            if (pv && r.success) pv.innerHTML = r.html;
        } catch {}
    },

    async loadLabSnippets() {
        const el = document.getElementById('lab-snip-list');
        if (!el) return;
        try {
            const r = await window.toolbox.api('GET', '/api/tools/lab/snippets');
            if (!r.snippets?.length) { el.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text3);font-size:12px">暂无代码片段</div>'; return; }
            el.innerHTML = r.snippets.slice().reverse().map(s => '<div class="snip-item" style="cursor:pointer;font-size:12px" data-id="' + s.id + '"><div style="display:flex;justify-content:space-between"><span><strong>' + s.title + '</strong> <span style="color:var(--accent);font-size:11px">' + s.language + '</span></span><button class="snip-del" data-id="' + s.id + '" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px">✕</button></div><pre style="font-size:11px;margin-top:4px;background:var(--bg3);padding:4px 8px;border-radius:4px;max-height:40px;overflow:hidden">' + s.code.substring(0,150) + '</pre></div>').join('');
            el.querySelectorAll('.snip-item').forEach(item => item.addEventListener('click', (e) => {
                if (e.target.classList.contains('snip-del')) return;
                const id = item.dataset.id;
                const s = r.snippets.find(x => x.id === id);
                if (s) { document.getElementById('lab-snip-title').value = s.title; document.getElementById('lab-snip-code').value = s.code; document.getElementById('lab-snip-lang').value = s.language; document.getElementById('lab-snip-tags').value = (s.tags||[]).join(', '); document.getElementById('lab-snip-title').dataset.editId = id; }
            }));
            el.querySelectorAll('.snip-del').forEach(btn => btn.onclick = async (e) => { e.stopPropagation(); if (confirm('删除？')) { await window.toolbox.api('DELETE', '/api/tools/lab/snippet/' + btn.dataset.id); this.loadLabSnippets(); } });
        } catch { document.getElementById('lab-snip-list').innerHTML = '❌ 失败'; }
    },

    async saveLabSnippet() {
        const title = document.getElementById('lab-snip-title').value.trim();
        const code = document.getElementById('lab-snip-code').value;
        const language = document.getElementById('lab-snip-lang').value;
        const tags = (document.getElementById('lab-snip-tags').value||'').split(',').map(t=>t.trim()).filter(Boolean);
        const editId = document.getElementById('lab-snip-title').dataset.editId;
        if (!title || !code) { alert('标题和代码不能为空'); return; }
        await window.toolbox.api('POST', '/api/tools/lab/snippet', { id: editId, title, code, language, tags });
        document.getElementById('lab-snip-title').value = ''; document.getElementById('lab-snip-code').value = ''; document.getElementById('lab-snip-tags').value = ''; delete document.getElementById('lab-snip-title').dataset.editId;
        this.loadLabSnippets();
    },

    // ═══════════ DOWNLOAD TOOLS ═══════════
    downloadPage() {
        return `
        <div style="padding:16px 24px;max-width:900px;margin:0 auto">
            <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
                <button class="tool-tab active" data-tool="download">⬇️ 下载管理</button>
                <button class="tool-tab" style="margin-left:auto" data-tool="back">← 返回分类</button>
            </div>
            <div id="dl-tool-content">
                <div class="tool-placeholder">加载中...</div>
            </div>
        </div>`;
    },

    _dlPollTimer: null,

    bindDownloadEvents() {
        document.querySelectorAll('#main-content .tool-tab').forEach(t => {
            t.addEventListener('click', () => {
                if (t.dataset.tool === 'back') return this.renderCategories();
                document.querySelectorAll('#main-content .tool-tab').forEach(x => x.classList.remove('active'));
                t.classList.add('active');
                this.showDownloadTool();
            });
        });
    },

    showDownloadTool() {
        const area = document.getElementById('dl-tool-content');
        if (!area) return;
        
        area.innerHTML = `
            <div class="tool-panel">
                ${this.tip('输入 GitHub 仓库地址或文件直链，自动加速下载。同时最多跑 3 个任务。')}

                <!-- Proxy status bar -->
                <div id="dl-proxy-bar" style="font-size:11px;padding:5px 10px;border-radius:6px;margin-bottom:10px;display:flex;align-items:center;gap:6px;background:var(--bg2)">
                    <span id="dl-proxy-dot" style="width:8px;height:8px;border-radius:50%;background:#999;display:inline-block"></span>
                    <span id="dl-proxy-text" style="color:var(--text3)">检测代理中...</span>
                </div>

                <!-- URL input -->
                <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
                    <input id="dl-url" class="tool-input" placeholder="GitHub 仓库地址 / Release 文件直链 / raw 链接" style="flex:3;min-width:200px">
                    <button class="btn" id="dl-add-btn">➕ 添加下载</button>
                </div>
                <div style="font-size:10px;color:var(--text3);margin-bottom:8px">
                    支持: 仓库地址 → ZIP / Release 直链 / raw 文件链接
                </div>

                <!-- Task list header -->
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                    <span style="font-size:12px;font-weight:600;color:var(--text2)">📋 下载任务</span>
                    <span id="dl-task-count" style="font-size:10px;color:var(--text3)"></span>
                </div>

                <!-- Task list container -->
                <div id="dl-task-list" style="margin-bottom:12px">
                    <div style="text-align:center;color:var(--text3);padding:20px">暂无任务，粘贴链接添加</div>
                </div>

                <!-- Download history -->
                <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                        <span style="font-size:11px;font-weight:600;color:var(--text2)">📂 历史文件</span>
                        <div style="display:flex;gap:4px">
                            <span id="dl-history-count" style="font-size:10px;color:var(--text3)"></span>
                            <button class="btn btn-sm btn-ghost hidden" id="dl-clear-all" style="font-size:10px;color:var(--red)">清空</button>
                        </div>
                    </div>
                    <div id="dl-history-list" style="font-size:11px"></div>
                </div>
            </div>`;

        document.getElementById('dl-add-btn').onclick = () => this.addDownload();
        document.getElementById('dl-url').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.addDownload();
        });

        // Load data
        this.loadProxyStatus();
        this.loadDownloadHistory();
        this.refreshTaskList();

        // Start periodic refresh
        this._startTaskPolling();
    },

    _startTaskPolling() {
        if (this._dlPollTimer) clearInterval(this._dlPollTimer);
        this._dlPollTimer = setInterval(() => {
            this.refreshTaskList();
        }, 2000);
    },

    // ───────── Add New Download ─────────

    async addDownload() {
        const input = document.getElementById('dl-url');
        const url = input.value.trim();
        if (!url) return;
        input.value = '';
        
        try {
            await window.toolbox.api('POST', '/api/tools/download/github', { url });
            this.refreshTaskList();
        } catch (e) {
            // Error will be visible in task list
        }
    },

    // ───────── Cancel ─────────

    async cancelTask(taskId) {
        try {
            await window.toolbox.api('POST', '/api/tools/download/cancel/' + taskId);
            this.refreshTaskList();
        } catch {}
    },

    // ───────── Task List Rendering ─────────

    async refreshTaskList() {
        const list = document.getElementById('dl-task-list');
        const count = document.getElementById('dl-task-count');
        if (!list) return;
        
        try {
            const r = await window.toolbox.api('GET', '/api/tools/download/tasks');
            
            if (count) count.textContent = r.total > 0
                ? '共 ' + r.total + ' 个 | ' + r.activeCount + '/' + r.maxConcurrent + ' 运行中'
                : '';
            
            if (!r.tasks || r.tasks.length === 0) {
                list.innerHTML = '<div style="text-align:center;color:var(--text3);padding:20px">暂无任务，粘贴链接添加</div>';
                return;
            }
            
            list.innerHTML = r.tasks.map(t => this.renderTaskItem(t)).join('');
        } catch {
            // Silent
        }
    },

    renderTaskItem(t) {
        const isDone = t.status === 'done';
        const isFailed = t.status === 'failed' || t.status === 'cancelled';
        const isQueued = t.status === 'queued';
        const isDownloading = t.status === 'downloading';
        const isWaiting = t.status === 'waiting';
        
        const pct = t.done ? 100 : Math.min(t.progress || 0, 95);
        const barColor = isDone ? 'linear-gradient(90deg,#2196f3,#00bcd4)'
            : isFailed ? '#f44336'
            : isQueued ? '#ff9800'
            : 'linear-gradient(90deg,#4caf50,#8bc34a)';
        
        const statusIcon = isDone ? '✅'
            : isFailed ? '❌'
            : isQueued ? '⏳'
            : isDownloading ? '🔄'
            : '⏸';
        
        const statusText = isDone ? '完成'
            : isFailed ? (t.cancelled ? '已取消' : '失败')
            : isQueued ? ('排队中 (第 ' + t.queuePos + ' 位)')
            : isDownloading ? (t.stage || '下载中')
            : '等待中';
        
        const eta = isDownloading && !t.done && t.speed && t.speed !== '—' && t.size && t.size !== '0 B'
            ? this._calcETA(t.size, t.speed, t.progress)
            : '';
        
        return '<div style="background:var(--bg2);border-radius:6px;padding:10px;margin-bottom:6px">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;gap:8px">' +
            '<span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + t.filename + '">' + t.filename + '</span>' +
            (isDownloading || isQueued
                ? '<button class="btn btn-sm btn-ghost" onclick="window.toolManager.cancelTask(\'' + t.id + '\')" style="color:var(--red);font-size:10px;flex-shrink:0;padding:2px 6px">✕</button>'
                : '') +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-bottom:4px">' +
            '<span>' + statusIcon + ' ' + statusText + '</span>' +
            (t.speed && t.speed !== '—' ? '<span>🚀 ' + t.speed + '</span>' : '') +
            (t.size && t.size !== '0 B' && t.size !== '' ? '<span>📦 ' + t.size + '</span>' : '') +
            (eta ? '<span>⏱ ' + eta + '</span>' : '') +
            '</div>' +
            (!isDone && !isFailed ?
                '<div style="height:4px;background:var(--bg3);border-radius:2px;overflow:hidden">' +
                '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:2px;transition:width 1s"></div>' +
                '</div>'
                : '') +
            (t.error && t.error !== 'null'
                ? '<div style="font-size:10px;color:#f44336;margin-top:3px">' + t.error + '</div>'
                : '') +
            (isDone ?
                '<div style="margin-top:4px;display:flex;gap:4px">' +
                '<button class="btn btn-sm btn-ghost" onclick="window.toolManager.copyProxyLink(this)" style="font-size:9px;padding:2px 6px" data-url="' + t.url + '">📋 复制加速链接</button>' +
                '</div>'
                : '') +
            '</div>';
    },

    _calcETA(size, speed, progress) {
        const speedMatch = speed.match(/^([\d.]+)\s*(KB|MB|B)\/s$/);
        const sizeMatch = size.match(/^([\d.]+)\s*(KB|MB|B)$/);
        if (!speedMatch || !sizeMatch) return '';
        const speedVal = parseFloat(speedMatch[1]);
        const speedUnit = speedMatch[2];
        const sizeVal = parseFloat(sizeMatch[1]);
        const sizeUnit = sizeMatch[2];
        const speedKB = speedUnit === 'MB/s' ? speedVal * 1024 : speedUnit === 'B/s' ? speedVal / 1024 : speedVal;
        const sizeKB = sizeUnit === 'MB' ? sizeVal * 1024 : sizeUnit === 'B' ? sizeVal / 1024 : sizeVal;
        if (speedKB <= 0) return '';
        const remainingSec = sizeKB / speedKB;
        if (remainingSec < 60) return Math.round(remainingSec) + 's';
        return Math.round(remainingSec / 60) + 'm ' + Math.round(remainingSec % 60) + 's';
    },

    async copyProxyLink(btn) {
        const url = btn.dataset.url;
        if (!url) return;
        try {
            const proxied = 'https://ghproxy.com/' + url;
            await navigator.clipboard.writeText(proxied);
            btn.textContent = '✅ 已复制';
            setTimeout(() => { btn.textContent = '📋 复制加速链接'; }, 2000);
        } catch {}
    },

    // ───────── Proxy Status ─────────

    async loadProxyStatus() {
        const bar = document.getElementById('dl-proxy-bar');
        const dot = document.getElementById('dl-proxy-dot');
        const text = document.getElementById('dl-proxy-text');
        if (!bar) return;
        try {
            const r = await window.toolbox.api('GET', '/api/tools/download/proxy');
            if (r.proxies && r.proxies.length > 0) {
                const info = r.proxies.map(p => p.type + ':' + p.host + ':' + p.port).join(', ');
                bar.style.borderLeft = '3px solid #4caf50';
                dot.style.background = '#4caf50';
                text.textContent = '✅ 代理已就绪: ' + info;
            } else if (r.systemProxy) {
                bar.style.borderLeft = '3px solid #ff9800';
                dot.style.background = '#ff9800';
                text.textContent = '⚠️ 系统代理已启用（端口未知）';
            } else {
                bar.style.borderLeft = '3px solid #999';
                dot.style.background = '#999';
                text.textContent = '🔌 未检测到本地代理，下载将使用镜像加速';
            }
        } catch {
            text.textContent = '❌ 检测失败';
        }
    },

    // ───────── Download History ─────────

    async loadDownloadHistory() {
        const list = document.getElementById('dl-history-list');
        const count = document.getElementById('dl-history-count');
        const clearBtn = document.getElementById('dl-clear-all');
        if (!list) return;
        try {
            const r = await window.toolbox.api('GET', '/api/tools/download/history');
            if (!r.files || r.files.length === 0) {
                list.innerHTML = '<div style="text-align:center;color:var(--text3);padding:8px">暂无历史文件</div>';
                if (count) count.textContent = '';
                if (clearBtn) clearBtn.classList.add('hidden');
                return;
            }
            if (count) count.textContent = '共 ' + r.total + ' 个文件';
            if (clearBtn) {
                clearBtn.classList.remove('hidden');
                clearBtn.onclick = async () => {
                    if (confirm('确定清空所有下载记录？')) {
                        await window.toolbox.api('DELETE', '/api/tools/download/history');
                        this.loadDownloadHistory();
                    }
                };
            }
            list.innerHTML = r.files.map(f =>
                '<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:4px;background:var(--bg2);margin-bottom:3px;font-size:11px">' +
                '<span style="opacity:.5">📄</span>' +
                '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px" title="' + f.filename + '">' + f.filename + '</span>' +
                '<span style="color:var(--text3);flex-shrink:0;font-size:10px">' + f.size + '</span>' +
                '</div>'
            ).join('');
        } catch {
            list.innerHTML = '<div style="text-align:center;color:var(--red);padding:8px">加载失败</div>';
        }
    },

    bindGlobalKeys() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.currentCategory) {
                this.renderCategories();
            }
        });
    }
};

window.toolManager = toolManager;
