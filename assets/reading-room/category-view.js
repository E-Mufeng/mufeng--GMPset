// Category View - displays files and resource links for a category
const CategoryView = {
  container: null,
  currentCategory: null,
  categories: [],

  async render(categoryId) {
    this.currentCategory = categoryId;

    const container = document.getElementById('rr-category-content');
    if (!container) return;
    container.innerHTML = '<div class="loading" style="padding:40px;text-align:center">加载中...</div>';

    try {
      // Fetch categories and files
      const [catRes, fileRes] = await Promise.all([
        fetch('/api/reading-room/categories').then(r => r.json()),
        fetch(`/api/reading-room/files?category=${categoryId}`).then(r => r.json()),
      ]);

      if (!catRes.ok) throw new Error('Failed to load categories');
      this.categories = catRes.categories;

      const cat = catRes.categories.find(c => c.id === categoryId);
      if (!cat) {
        container.innerHTML = '<div class="rr-empty"><div class="rr-empty-icon">❓</div>分类未找到</div>';
        return;
      }

      const files = fileRes.ok ? fileRes.files : [];

      // Render
      container.innerHTML = `
        <div class="rr-section-header">
          <h3><span style="margin-right:6px">${cat.icon}</span>${cat.name}</h3>
          <div class="rr-btn-group">
            <button class="btn btn-sm" onclick="DownloadManager.show('${categoryId}')">📥 下载</button>
            <button class="btn btn-sm" onclick="CategoryView.scanDisk('${categoryId}')">🔍 扫描</button>
            <button class="btn btn-sm" onclick="CategoryView.refresh()">🔄 刷新</button>
            <button class="btn btn-sm btn-ghost" onclick="CategoryEditor.show(
              ${JSON.stringify(cat).replace(/"/g, '&quot;')},
              () => CategoryView.render('${categoryId}')
            )">✏️ 编辑</button>
          </div>
        </div>

        <!-- File list -->
        <div style="margin-bottom:20px">
          <div style="font-size:12px;color:var(--text3);margin-bottom:8px;display:flex;justify-content:space-between">
            <span>📂 本地文件 (${files.length})</span>
            <span>绑定路径: ${cat.paths.join('; ')}</span>
          </div>
          <div class="rr-file-list" id="rr-file-list">
            ${files.length === 0
              ? '<div class="rr-empty"><div class="rr-empty-icon">📂</div>暂无文件<br><span style="font-size:11px">点击"下载"从网络获取文件，或点击"扫描"发现全盘文件</span></div>'
              : files.map(f => `
                <div class="rr-file-item" data-path="${f.path}" data-ext="${f.ext}" data-cat="${categoryId}">
                  <span class="rr-fi-icon">${f.ext === '.pdf' ? '📄' : f.ext === '.docx' ? '📝' : '📃'}</span>
                  <span class="rr-type-badge ${f.ext.slice(1)}">${f.ext}</span>
                  <span class="rr-fi-name">${f.name}</span>
                  <span class="rr-fi-meta">${new Date(f.modified).toLocaleDateString()}</span>
                  <span class="rr-fi-size">${(f.size / 1024).toFixed(1)} KB</span>
                  <span class="rr-fi-source">绑定目录</span>
                </div>
              `).join('')
            }
          </div>
        </div>

        <!-- Discovered files (hidden until scan runs) -->
        <div id="rr-discovered-section" style="display:none;margin-bottom:20px">
          <div style="font-size:12px;color:var(--text3);margin-bottom:8px;display:flex;justify-content:space-between">
            <span>🔍 全盘发现 <span id="rr-discovered-count">0</span> 个文件</span>
            <span id="rr-discovered-sources" style="font-size:11px"></span>
          </div>
          <div class="rr-file-list" id="rr-discovered-list"></div>
        </div>

        <!-- Resource links -->
        <div>
          <div style="font-size:12px;color:var(--text3);margin-bottom:8px">🔗 资源链接</div>
          <div class="rr-links-grid" id="rr-links-grid">
            ${cat.links.map(link => `
              <div class="rr-link-card" data-url="${link.url}">
                <div class="rr-lc-title">🔗 ${link.name}</div>
                <div class="rr-lc-desc">${link.desc || ''}</div>
                <div class="rr-lc-actions">
                  <button class="rr-lc-btn" onclick="LinkViewer.open('${link.url}', '${link.name}')">👁 在线看</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      // Bind file click events
      container.querySelectorAll('.rr-file-item').forEach(el => {
        el.addEventListener('click', () => {
          const path = el.dataset.path;
          const ext = el.dataset.ext;
          this.openFile(path, ext);
        });
      });
    } catch (e) {
      container.innerHTML = `<div class="rr-empty"><div class="rr-empty-icon">❌</div>加载失败: ${e.message}</div>`;
    }
  },

  refresh() {
    if (this.currentCategory) this.render(this.currentCategory);
  },

  async scanDisk(categoryId) {
    // Let user configure scan roots
    const saved = await fetch('/api/reading-room/scan-roots').then(r => r.json());
    let roots = (saved.ok ? saved.scanRoots : null) || [];

    if (roots.length === 0) {
      // Default scan directories
      roots = [];  // 未配置扫描目录时留空，由用户自行输入（不硬编码任何个人路径）
    }

    const input = prompt(
      '输入要扫描的目录（每行一个，支持子目录递归）',
      roots.join('\\n')
    );
    if (!input) return;

    roots = input.split('\\n').map(s => s.trim()).filter(Boolean);

    // Save
    await fetch('/api/reading-room/scan-roots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roots }),
    });

    // Determine file types from current category
    const catId = categoryId || this.currentCategory;
    const catRes = await fetch('/api/reading-room/categories').then(r => r.json());
    if (!catRes.ok) return;
    const cat = catRes.categories.find(c => c.id === catId);
    const fileTypes = cat ? cat.fileTypes : ['.txt', '.md', '.pdf', '.docx'];

    // Show scanning status
    const section = document.getElementById('rr-discovered-section');
    const list = document.getElementById('rr-discovered-list');
    const count = document.getElementById('rr-discovered-count');
    const sources = document.getElementById('rr-discovered-sources');
    if (section) section.style.display = 'block';
    if (list) list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">⏳ 扫描中...</div>';
    if (count) count.textContent = '...';
    if (sources) sources.textContent = roots.join('; ');

    // Run scan
    try {
      const res = await fetch('/api/reading-room/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roots, fileTypes }),
      });
      const data = await res.json();
      if (!data.ok) { alert('扫描失败: ' + data.error); return; }

      if (count) count.textContent = data.count;

      if (!data.files || data.files.length === 0) {
        if (list) list.innerHTML = '<div class="rr-empty"><div class="rr-empty-icon">🔍</div>未找到匹配文件</div>';
        return;
      }

      if (list) {
        list.innerHTML = data.files.map(f => `
          <div class="rr-file-item" data-path="${f.path}" data-ext="${f.ext}" data-cat="${catId}">
            <span class="rr-fi-icon">${f.ext === '.pdf' ? '📄' : f.ext === '.docx' ? '📝' : '📃'}</span>
            <span class="rr-type-badge ${f.ext.slice(1)}">${f.ext}</span>
            <span class="rr-fi-name">${f.name}</span>
            <span class="rr-fi-meta">${new Date(f.modified).toLocaleDateString()}</span>
            <span class="rr-fi-size">${(f.size / 1024).toFixed(1)} KB</span>
            <span class="rr-fi-source rr-source-discovery">全盘发现</span>
          </div>
        `).join('');

        // Bind click
        list.querySelectorAll('.rr-file-item').forEach(el => {
          el.addEventListener('click', () => {
            this.openFile(el.dataset.path, el.dataset.ext);
          });
        });
      }
    } catch (e) {
      if (list) list.innerHTML = '<div class="rr-empty">❌ 扫描出错: ' + e.message + '</div>';
    }
  },

  async openFile(filePath, ext) {
    try {
      const res = await fetch(`/api/reading-room/content?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (!data.ok) { alert('打开失败: ' + data.error); return; }

      if (data.type === 'text') {
        TextReader.open(filePath, data.name, data.content, () => {
          this.refresh();
        });
      } else if (data.type === 'pdf') {
        PDFReader.open(data.url, data.name, () => {
          this.refresh();
        });
      } else if (data.type === 'docx') {
        WordReader.open(data.url, data.name, () => {
          this.refresh();
        });
      }
    } catch (e) {
      alert('打开失败: ' + e.message);
    }
  },
};
