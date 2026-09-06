// Category Editor UI
const CategoryEditor = {
  overlay: null,
  category: null,
  onSave: null,

  show(category, onSave) {
    this.category = category ? { ...category } : this.getDefault();
    this.onSave = onSave;

    this.overlay = document.createElement('div');
    this.overlay.className = 'rr-download-overlay';
    this.overlay.innerHTML = `
      <div class="rr-download-box" style="width:560px;max-height:80vh;overflow-y:auto">
        <h3>${category ? '✏️ 编辑分类' : '➕ 添加分类'}</h3>
        <div class="rr-editor-form" id="rr-editor-form">
          <div style="display:flex;gap:12px">
            <div style="flex:1">
              <label>分类名称</label>
              <input id="rr-ec-name" value="${this.category.name}" placeholder="如: 大A">
            </div>
            <div style="width:80px">
              <label>图标</label>
              <input id="rr-ec-icon" value="${this.category.icon}" placeholder="📖" style="font-size:20px;text-align:center">
            </div>
          </div>

          <div>
            <label>文件类型</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${['.txt', '.md', '.pdf', '.docx', '.html'].map(ext =>
                `<label style="display:flex;align-items:center;gap:3px;font-size:12px;font-weight:400">
                  <input type="checkbox" value="${ext}" ${this.category.fileTypes.includes(ext) ? 'checked' : ''}>
                  ${ext}
                </label>`
              ).join('')}
            </div>
          </div>

          <div>
            <label>绑定路径</label>
            <div id="rr-ec-paths">
              ${this.category.paths.map((p, i) =>
                `<div class="rr-path-row">
                  <input class="rr-ec-path-input" value="${p}" placeholder="C:\\path\\to\\folder">
                  <button onclick="CategoryEditor.removePath(${i})" title="删除">✕</button>
                </div>`
              ).join('')}
            </div>
            <button class="rr-rt-btn" style="margin-top:4px;font-size:11px" onclick="CategoryEditor.addPath()">+ 添加路径</button>
          </div>

          <div>
            <label>阅读方式</label>
            <select id="rr-ec-reader">
              <option value="text" ${this.category.readerType === 'text' ? 'selected' : ''}>TextReader（txt/md）</option>
              <option value="pdf" ${this.category.readerType === 'pdf' ? 'selected' : ''}>PDFReader（pdf）</option>
              <option value="word" ${this.category.readerType === 'word' ? 'selected' : ''}>WordReader（docx）</option>
            </select>
          </div>

          <div>
            <label>资源链接（用户可查看和下载）</label>
            <div id="rr-ec-links">
              ${this.category.links.map((link, i) =>
                `<div class="rr-link-row">
                  <input class="rr-ec-link-name" value="${link.name}" placeholder="名称" style="width:120px">
                  <input class="rr-ec-link-url" value="${link.url}" placeholder="https://..." style="flex:1">
                  <input class="rr-ec-link-desc" value="${link.desc || ''}" placeholder="说明" style="width:150px">
                  <button onclick="CategoryEditor.removeLink(${i})" title="删除">✕</button>
                </div>`
              ).join('')}
            </div>
            <button class="rr-rt-btn" style="margin-top:4px;font-size:11px" onclick="CategoryEditor.addLink()">+ 添加链接</button>
          </div>

          <div>
            <label>
              <input type="checkbox" id="rr-ec-scan" ${this.category.dailyScan !== false ? 'checked' : ''}>
              每日自动扫描
            </label>
          </div>

          <div class="rr-dl-actions">
            <button class="btn btn-sm btn-ghost" onclick="CategoryEditor.hide()">取消</button>
            <button class="btn btn-sm" onclick="CategoryEditor.save()">💾 保存</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
  },

  getDefault() {
    return {
      id: 'cat-' + Date.now(),
      name: '',
      icon: '📁',
      paths: [],
      fileTypes: ['.txt', '.md'],
      readerType: 'text',
      links: [],
      dailyScan: true,
    };
  },

  addPath() {
    const container = document.getElementById('rr-ec-paths');
    const div = document.createElement('div');
    div.className = 'rr-path-row';
    div.innerHTML = `<input class="rr-ec-path-input" value="" placeholder="C:\\path\\to\\folder">
      <button onclick="this.parentElement.remove()" title="删除">✕</button>`;
    container.appendChild(div);
  },

  removePath(index) {
    const inputs = document.querySelectorAll('.rr-ec-path-input');
    if (inputs[index]) inputs[index].parentElement.remove();
  },

  addLink() {
    const container = document.getElementById('rr-ec-links');
    const div = document.createElement('div');
    div.className = 'rr-link-row';
    div.innerHTML = `
      <input class="rr-ec-link-name" value="" placeholder="名称" style="width:120px">
      <input class="rr-ec-link-url" value="" placeholder="https://..." style="flex:1">
      <input class="rr-ec-link-desc" value="" placeholder="说明" style="width:150px">
      <button onclick="this.parentElement.remove()" title="删除">✕</button>`;
    container.appendChild(div);
  },

  removeLink(index) {
    const container = document.getElementById('rr-ec-links');
    const rows = container.querySelectorAll('.rr-link-row');
    if (rows[index]) rows[index].remove();
  },

  save() {
    const name = document.getElementById('rr-ec-name').value.trim();
    if (!name) { alert('请输入分类名称'); return; }

    const cat = {
      id: this.category.id || 'cat-' + Date.now(),
      name,
      icon: document.getElementById('rr-ec-icon').value || '📁',
      paths: Array.from(document.querySelectorAll('.rr-ec-path-input')).map(i => i.value.trim()).filter(Boolean),
      fileTypes: Array.from(document.querySelectorAll('#rr-editor-form input[type="checkbox"]:checked')).map(c => c.value),
      readerType: document.getElementById('rr-ec-reader').value,
      links: [],
      dailyScan: document.getElementById('rr-ec-scan').checked,
    };

    document.querySelectorAll('.rr-link-row').forEach(row => {
      const nameInput = row.querySelector('.rr-ec-link-name');
      const urlInput = row.querySelector('.rr-ec-link-url');
      const descInput = row.querySelector('.rr-ec-link-desc');
      if (nameInput && urlInput && urlInput.value.trim()) {
        cat.links.push({
          name: nameInput.value.trim() || urlInput.value.trim(),
          url: urlInput.value.trim(),
          desc: descInput ? descInput.value.trim() : '',
        });
      }
    });

    fetch('/api/reading-room/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cat),
    })
    .then(r => r.json())
    .then(data => {
      if (data.ok) {
        this.hide();
        if (this.onSave) this.onSave();
      } else {
        alert('保存失败: ' + (data.error || '未知错误'));
      }
    })
    .catch(e => alert('网络错误: ' + e.message));
  },

  hide() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  },
};
