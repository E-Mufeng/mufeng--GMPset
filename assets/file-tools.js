const fileTools = {
    currentFiles: [],

    init() {
        // Tool card clicks
        document.querySelectorAll('.tool-card').forEach(card => {
            card.addEventListener('click', () => {
                const tool = card.dataset.tool;
                this.openTool(tool);
            });
        });

        // Back button
        document.getElementById('wb').addEventListener('click', () => {
            this.backToGrid();
        });

        // Modal close
        document.getElementById('mc').addEventListener('click', () => {
            document.getElementById('modal').classList.add('hidden');
        });
        document.getElementById('modal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                document.getElementById('modal').classList.add('hidden');
            }
        });
    },

    openTool(toolId) {
        const ws = document.getElementById('workspace');
        const title = document.getElementById('wt');
        const content = document.getElementById('wc');
        const grid = document.querySelector('.tool-grid');
        
        grid.style.display = 'none';

        const toolNames = {
            'pdf-merge': 'PDF 合并',
            'pdf-split': 'PDF 拆分',
            'pdf-compress': 'PDF 压缩',
            'image-convert': '图片格式转换',
            'image-compress': '图片压缩',
            'image-resize': '图片缩放',
            'batch-rename': '批量重命名',
            'text-replace': '文本替换'
        };

        title.textContent = toolNames[toolId] || toolId;
        ws.classList.add('show');

        // Clear and populate workspace
        content.innerHTML = '';
        if (this[`render${toolId.replace(/-/g, '_')}`]) {
            this[`render${toolId.replace(/-/g, '_')}`](content);
        }
    },

    backToGrid() {
        document.getElementById('workspace').classList.remove('show');
        document.querySelector('.tool-grid').style.display = 'grid';
    },

    // ==================== Modal Helper ====================
    showModal(title, bodyHtml) {
        document.getElementById('mt').textContent = title;
        document.getElementById('mb').innerHTML = bodyHtml;
        document.getElementById('modal').classList.remove('hidden');
    },

    showResult(result, success = true) {
        const cls = success ? 'success' : 'error';
        if (typeof result === 'string') {
            return `<div class="result-box ${cls}">${result}</div>`;
        }
        // Build key-value display
        let html = `<div class="result-box ${cls}">`;
        for (const [key, val] of Object.entries(result)) {
            if (key === 'error') {
                html += `<div class="result-row"><span class="result-label">错误</span><span class="result-value" style="color:var(--danger)">${val}</span></div>`;
            } else {
                const label = {
                    success: '状态',
                    file: '输出文件',
                    pages: '页数',
                    originalSize: '原始大小',
                    compressedSize: '压缩后大小',
                    ratio: '压缩率',
                    format: '格式',
                    size: '大小',
                    count: '替换次数',
                    renamed: '重命名数量'
                }[key] || key;
                html += `<div class="result-row"><span class="result-label">${label}</span><span class="result-value">${val}</span></div>`;
            }
        }
        html += '</div>';
        return html;
    },

    // ==================== Tool Renders ====================

    renderpdf_merge(content) {
        content.innerHTML = `
            <div class="form-group">
                <label>选择 PDF 文件（拖拽或点击上传，至少2个）</label>
                <input type="file" multiple accept=".pdf" id="pdf-merge-input">
                <div class="progress-bar hidden" id="pdf-merge-progress"><div class="progress-fill" style="width:0%"></div></div>
            </div>
            <div id="pdf-merge-result"></div>
            <button class="btn" id="pdf-merge-btn">合并</button>
        `;
        document.getElementById('pdf-merge-btn').addEventListener('click', async () => {
            const input = document.getElementById('pdf-merge-input');
            if (!input.files || input.files.length < 2) {
                document.getElementById('pdf-merge-result').innerHTML = this.showResult('请至少选择2个PDF文件', false);
                return;
            }
            const pb = document.getElementById('pdf-merge-progress');
            pb.classList.remove('hidden');
            const fd = new FormData();
            for (const f of input.files) fd.append('files', f);
            const result = await window.toolbox.upload('/api/files/pdf/merge', fd);
            pb.classList.add('hidden');
            const container = document.getElementById('pdf-merge-result');
            if (result.error) {
                container.innerHTML = this.showResult(result.error, false);
            } else {
                container.innerHTML = this.showResult({
                    success: '✅ 合并成功',
                    file: result.file,
                    pages: result.pages + ' 页',
                    path: result.path
                });
                container.innerHTML += `<button class="btn btn-sm btn-outline mt-2" onclick="window.toolbox.openFile('${result.path.replace(/\\/g, '\\\\')}')">📂 打开文件</button>`;
            }
        });
    },

    renderpdf_split(content) {
        content.innerHTML = `
            <div class="form-group">
                <label>选择 PDF 文件</label>
                <input type="file" accept=".pdf" id="pdf-split-input">
            </div>
            <div class="form-group">
                <label>页码范围</label>
                <input type="text" id="pdf-split-ranges" value="1" placeholder="示例: 1-3,5,7-9">
                <div class="form-hint">数字或范围，用逗号分隔</div>
            </div>
            <div id="pdf-split-result"></div>
            <button class="btn" id="pdf-split-btn">拆分</button>
        `;
        document.getElementById('pdf-split-btn').addEventListener('click', async () => {
            const input = document.getElementById('pdf-split-input');
            if (!input.files || !input.files[0]) {
                document.getElementById('pdf-split-result').innerHTML = this.showResult('请选择PDF文件', false);
                return;
            }
            const fd = new FormData();
            fd.append('file', input.files[0]);
            fd.append('ranges', document.getElementById('pdf-split-ranges').value);
            const result = await window.toolbox.upload('/api/files/pdf/split', fd);
            const container = document.getElementById('pdf-split-result');
            if (result.error) {
                container.innerHTML = this.showResult(result.error, false);
            } else {
                container.innerHTML = this.showResult({
                    success: '✅ 拆分成功',
                    file: result.file,
                    pages: result.pages + ' 页'
                });
                container.innerHTML += `<button class="btn btn-sm btn-outline mt-2" onclick="window.toolbox.openFile('${result.path.replace(/\\/g, '\\\\')}')">📂 打开文件</button>`;
            }
        });
    },

    renderpdf_compress(content) {
        content.innerHTML = `
            <div class="form-group">
                <label>选择 PDF 文件</label>
                <input type="file" accept=".pdf" id="pdf-compress-input">
            </div>
            <div id="pdf-compress-result"></div>
            <button class="btn" id="pdf-compress-btn">压缩</button>
        `;
        document.getElementById('pdf-compress-btn').addEventListener('click', async () => {
            const input = document.getElementById('pdf-compress-input');
            if (!input.files || !input.files[0]) {
                document.getElementById('pdf-compress-result').innerHTML = this.showResult('请选择PDF文件', false);
                return;
            }
            const fd = new FormData();
            fd.append('file', input.files[0]);
            const result = await window.toolbox.upload('/api/files/pdf/compress', fd);
            const container = document.getElementById('pdf-compress-result');
            if (result.error) {
                container.innerHTML = this.showResult(result.error, false);
            } else {
                container.innerHTML = this.showResult({
                    success: '✅ 压缩完成',
                    ratio: result.ratio + '%',
                    originalSize: fmtSize(result.originalSize),
                    compressedSize: fmtSize(result.compressedSize),
                    file: result.file
                });
                container.innerHTML += `<button class="btn btn-sm btn-outline mt-2" onclick="window.toolbox.openFile('${result.path.replace(/\\/g, '\\\\')}')">📂 打开文件</button>`;
            }
        });
    },

    renderimage_convert(content) {
        content.innerHTML = `
            <div class="form-group">
                <label>选择图片文件</label>
                <input type="file" accept="image/*" id="img-convert-input">
            </div>
            <div class="form-group">
                <label>目标格式</label>
                <select id="img-convert-format">
                    <option value="png">PNG</option>
                    <option value="jpeg">JPEG</option>
                    <option value="webp">WebP</option>
                </select>
            </div>
            <div id="img-convert-result"></div>
            <button class="btn" id="img-convert-btn">转换</button>
        `;
        document.getElementById('img-convert-btn').addEventListener('click', async () => {
            const input = document.getElementById('img-convert-input');
            if (!input.files || !input.files[0]) {
                document.getElementById('img-convert-result').innerHTML = this.showResult('请选择图片文件', false);
                return;
            }
            const fd = new FormData();
            fd.append('file', input.files[0]);
            fd.append('format', document.getElementById('img-convert-format').value);
            const result = await window.toolbox.upload('/api/files/image/convert', fd);
            const container = document.getElementById('img-convert-result');
            if (result.error) {
                container.innerHTML = this.showResult(result.error, false);
            } else {
                container.innerHTML = this.showResult({
                    success: '✅ 转换成功',
                    format: result.format,
                    size: fmtSize(result.size)
                });
                container.innerHTML += `<button class="btn btn-sm btn-outline mt-2" onclick="window.toolbox.openFile('${result.path.replace(/\\/g, '\\\\')}')">📂 打开文件</button>`;
            }
        });
    },

    renderimage_compress(content) {
        content.innerHTML = `
            <div class="form-group">
                <label>选择图片文件</label>
                <input type="file" accept="image/*" id="img-compress-input">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>质量 (1-100)</label>
                    <input type="number" id="img-compress-quality" value="80" min="1" max="100">
                </div>
                <div class="form-group">
                    <label>输出格式</label>
                    <select id="img-compress-format">
                        <option value="jpeg">JPEG</option>
                        <option value="webp">WebP</option>
                        <option value="png">PNG</option>
                    </select>
                </div>
            </div>
            <div id="img-compress-result"></div>
            <button class="btn" id="img-compress-btn">压缩</button>
        `;
        document.getElementById('img-compress-btn').addEventListener('click', async () => {
            const input = document.getElementById('img-compress-input');
            if (!input.files || !input.files[0]) {
                document.getElementById('img-compress-result').innerHTML = this.showResult('请选择图片文件', false);
                return;
            }
            const fd = new FormData();
            fd.append('file', input.files[0]);
            fd.append('quality', document.getElementById('img-compress-quality').value);
            fd.append('format', document.getElementById('img-compress-format').value);
            const result = await window.toolbox.upload('/api/files/image/compress', fd);
            const container = document.getElementById('img-compress-result');
            if (result.error) {
                container.innerHTML = this.showResult(result.error, false);
            } else {
                container.innerHTML = this.showResult({
                    success: '✅ 压缩完成',
                    ratio: result.ratio + '%',
                    originalSize: fmtSize(result.originalSize),
                    compressedSize: fmtSize(result.compressedSize),
                    format: result.format
                });
                container.innerHTML += `<button class="btn btn-sm btn-outline mt-2" onclick="window.toolbox.openFile('${result.path.replace(/\\/g, '\\\\')}')">📂 打开文件</button>`;
            }
        });
    },

    renderimage_resize(content) {
        content.innerHTML = `
            <div class="form-group">
                <label>选择图片文件</label>
                <input type="file" accept="image/*" id="img-resize-input">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>宽度 (px，留空自动)</label>
                    <input type="number" id="img-resize-width" placeholder="留空按比例">
                </div>
                <div class="form-group">
                    <label>高度 (px，留空自动)</label>
                    <input type="number" id="img-resize-height" placeholder="留空按比例">
                </div>
            </div>
            <div id="img-resize-result"></div>
            <button class="btn" id="img-resize-btn">缩放</button>
        `;
        document.getElementById('img-resize-btn').addEventListener('click', async () => {
            const input = document.getElementById('img-resize-input');
            if (!input.files || !input.files[0]) {
                document.getElementById('img-resize-result').innerHTML = this.showResult('请选择图片文件', false);
                return;
            }
            const fd = new FormData();
            fd.append('file', input.files[0]);
            fd.append('width', document.getElementById('img-resize-width').value || '');
            fd.append('height', document.getElementById('img-resize-height').value || '');
            const result = await window.toolbox.upload('/api/files/image/resize', fd);
            const container = document.getElementById('img-resize-result');
            if (result.error) {
                container.innerHTML = this.showResult(result.error, false);
            } else {
                container.innerHTML = this.showResult({
                    success: '✅ 缩放完成',
                    size: fmtSize(result.size),
                    file: result.file
                });
                container.innerHTML += `<button class="btn btn-sm btn-outline mt-2" onclick="window.toolbox.openFile('${result.path.replace(/\\/g, '\\\\')}')">📂 打开文件</button>`;
            }
        });
    },

    renderbatch_rename(content) {
        content.innerHTML = `
            <div class="form-group">
                <label>目标目录</label>
                <input type="text" id="rename-dir" placeholder="如 D:\\novel-engine\\data\\files">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>查找文本</label>
                    <input type="text" id="rename-find" placeholder="要替换的文本">
                </div>
                <div class="form-group">
                    <label>替换为</label>
                    <input type="text" id="rename-replace" placeholder="替换后的文本">
                </div>
            </div>
            <div class="form-hint">或者选择其他模式</div>
            <div class="form-row mt-2">
                <div class="form-group">
                    <label>前缀</label>
                    <input type="text" id="rename-prefix" placeholder="在文件名前添加">
                </div>
                <div class="form-group">
                    <label>后缀</label>
                    <input type="text" id="rename-suffix" placeholder="在文件名后添加">
                </div>
            </div>
            <div id="rename-result"></div>
            <button class="btn" id="rename-btn">执行重命名</button>
        `;
        document.getElementById('rename-btn').addEventListener('click', async () => {
            const dir = document.getElementById('rename-dir').value.trim();
            if (!dir) {
                document.getElementById('rename-result').innerHTML = this.showResult('请输入目标目录', false);
                return;
            }
            const body = { directory: dir };
            const find = document.getElementById('rename-find').value.trim();
            const replace = document.getElementById('rename-replace').value.trim();
            const prefix = document.getElementById('rename-prefix').value.trim();
            const suffix = document.getElementById('rename-suffix').value.trim();
            if (find) { body.pattern = find; body.replacement = replace; }
            else if (prefix) body.prefix = prefix;
            else if (suffix) body.suffix = suffix;
            else { document.getElementById('rename-result').innerHTML = this.showResult('请填写至少一个规则', false); return; }
            const result = await window.toolbox.api('POST', '/api/files/batch/rename', body);
            const container = document.getElementById('rename-result');
            if (result.error) {
                container.innerHTML = this.showResult(result.error, false);
            } else {
                container.innerHTML = this.showResult({
                    success: '✅ 重命名完成',
                    renamed: result.renamed + ' 个文件'
                });
            }
        });
    },

    rendertext_replace(content) {
        content.innerHTML = `
            <div class="form-group">
                <label>选择文本文件</label>
                <input type="file" accept=".txt,.md,.html,.css,.js,.json,.xml,.csv,.log,.ini,.cfg" id="text-replace-input" multiple>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>查找</label>
                    <input type="text" id="text-find" placeholder="要查找的文本">
                </div>
                <div class="form-group">
                    <label>替换为</label>
                    <input type="text" id="text-replace" placeholder="替换后的文本">
                </div>
            </div>
            <div id="text-replace-result"></div>
            <button class="btn" id="text-replace-btn">替换</button>
        `;
        document.getElementById('text-replace-btn').addEventListener('click', async () => {
            const input = document.getElementById('text-replace-input');
            if (!input.files || !input.files[0]) {
                document.getElementById('text-replace-result').innerHTML = this.showResult('请选择文件', false);
                return;
            }
            const find = document.getElementById('text-find').value;
            if (!find) {
                document.getElementById('text-replace-result').innerHTML = this.showResult('请输入查找文本', false);
                return;
            }
            const fd = new FormData();
            fd.append('file', input.files[0]);
            fd.append('find', find);
            fd.append('replace', document.getElementById('text-replace').value);
            const result = await window.toolbox.upload('/api/files/text/replace', fd);
            const container = document.getElementById('text-replace-result');
            if (result.error) {
                container.innerHTML = this.showResult(result.error, false);
            } else {
                container.innerHTML = this.showResult({
                    success: '✅ 替换完成',
                    count: result.count + ' 处替换',
                    file: result.file
                });
                container.innerHTML += `<button class="btn btn-sm btn-outline mt-2" onclick="window.toolbox.openFile('${result.path.replace(/\\/g, '\\\\')}')">📂 打开文件</button>`;
            }
        });
    }
};

function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
window.fileTools = fileTools;
