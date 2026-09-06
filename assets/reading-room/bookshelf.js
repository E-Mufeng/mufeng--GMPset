// Bookshelf - manage reading list with status tracking, bookmarks, and import
const Bookshelf = {
  books: [],
  filter: 'reading', // reading | want_to_read | completed | all
  searchQuery: '',
  importView: null, // url/paste/search

  async show() {
    const container = document.getElementById('rr-category-content');
    if (!container) return;
    container.innerHTML = '<div class="loading" style="padding:40px;text-align:center">加载书架...</div>';

    await this.load();
    this.render(container);
  },

  async load() {
    try {
      const res = await fetch('/api/reading-room/bookshelf');
      const data = await res.json();
      this.books = data.ok ? (data.books || []) : [];
    } catch (e) {
      this.books = [];
    }
  },

  render(container) {
    if (!container) container = document.getElementById('rr-category-content');
    if (!container) return;

    const filtered = this.getFilteredBooks();

    container.innerHTML = `
      <div class="rr-section-header">
        <h3>📚 书架</h3>
        <div class="rr-btn-group">
          <button class="btn btn-sm" onclick="Bookshelf.showImport()">📥 导入</button>
          <button class="btn btn-sm" onclick="Bookshelf.load();Bookshelf.show()">🔄 刷新</button>
        </div>
      </div>

      <!-- Filter tabs -->
      <div class="bs-tabs">
        <span class="bs-tab ${this.filter === 'reading' ? 'active' : ''}" data-filter="reading">在读</span>
        <span class="bs-tab ${this.filter === 'want_to_read' ? 'active' : ''}" data-filter="want_to_read">想读</span>
        <span class="bs-tab ${this.filter === 'completed' ? 'active' : ''}" data-filter="completed">已读完</span>
        <span class="bs-tab ${this.filter === 'all' ? 'active' : ''}" data-filter="all">全部</span>
      </div>

      <!-- Filter/search -->
      <div style="margin:12px 0">
        <input type="text" class="bs-search-input" id="bs-search-input" placeholder="搜索书架上的书籍..." value="${this.searchQuery}">
      </div>

      <!-- Books grid -->
      <div class="bs-grid" id="bs-grid">
        ${filtered.length === 0
          ? `<div class="rr-empty"><div class="rr-empty-icon">📚</div><div>书架空空</div>
             <div style="font-size:12px;color:var(--text3);margin-top:6px">
               ${this.searchQuery ? '没有匹配的书籍' : '点击"导入"添加小说'}
             </div></div>`
          : filtered.map(book => this.renderBookCard(book)).join('')
        }
      </div>
    `;

    // Bind events
    container.querySelectorAll('.bs-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.filter = tab.dataset.filter;
        this.searchQuery = '';
        this.render(container);
      });
    });

    const searchInput = document.getElementById('bs-search-input');
    if (searchInput) {
      let searchTimer;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          this.searchQuery = searchInput.value.trim().toLowerCase();
          this.render(container);
        }, 300);
      });
    }

    // Card events
    container.querySelectorAll('.bs-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.bs-card-actions') || e.target.closest('.bs-context-menu')) return;
        const path = card.dataset.path;
        if (path) this.openBook(path, card.dataset.name, card);
      });

      // Right click context menu
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showContextMenu(e, card.dataset.id);
      });
    });
  },

  renderBookCard(book) {
    const statusMap = {
      reading: { label: '在读', cls: 'bs-badge-reading', icon: '📖' },
      want_to_read: { label: '想读', cls: 'bs-badge-want', icon: '📌' },
      completed: { label: '已读完', cls: 'bs-badge-completed', icon: '✅' },
    };
    const st = statusMap[book.status] || statusMap.reading;
    const lastRead = book.lastReadAt ? new Date(book.lastReadAt).toLocaleDateString('zh-CN') : '未读';
    const progress = book.progress || 0;

    return `
      <div class="bs-card" data-id="${book.id}" data-path="${book.path}" data-name="${book.name}">
        <div class="bs-card-cover">
          <span class="bs-card-cover-icon">${st.icon}</span>
          <span class="bs-card-type">TXT</span>
        </div>
        <div class="bs-card-body">
          <div class="bs-card-title">${this.escapeHtml(book.name)}</div>
          ${book.author ? `<div class="bs-card-author">${this.escapeHtml(book.author)}</div>` : ''}
          <span class="bs-card-badge ${st.cls}">${st.label}</span>
          <div class="bs-card-progress">
            <div class="bs-progress-bar">
              <div class="bs-progress-fill" style="width:${Math.min(progress, 100)}%"></div>
            </div>
            <span class="bs-progress-text">${Math.round(progress)}%</span>
          </div>
          <div class="bs-card-meta">最近阅读: ${lastRead}</div>
        </div>
        <div class="bs-card-actions" data-id="${book.id}">
          <button class="bs-act-btn" data-action="edit-status" title="标记状态">📋</button>
          <button class="bs-act-btn bs-act-btn-del" data-action="delete" title="移除">🗑️</button>
        </div>
      </div>
    `;
  },

  getFilteredBooks() {
    let list = [...this.books];
    if (this.filter !== 'all') {
      list = list.filter(b => b.status === this.filter);
    }
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(b =>
        b.name.toLowerCase().includes(q) ||
        (b.author && b.author.toLowerCase().includes(q))
      );
    }
    // Sort: recently read first
    list.sort((a, b) => {
      const aTime = a.lastReadAt ? new Date(a.lastReadAt).getTime() : 0;
      const bTime = b.lastReadAt ? new Date(b.lastReadAt).getTime() : 0;
      return bTime - aTime;
    });
    return list;
  },

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  showContextMenu(event, bookId) {
    // Remove existing menus
    document.querySelectorAll('.bs-context-menu').forEach(m => m.remove());

    const book = this.books.find(b => b.id === bookId);
    if (!book) return;

    const menu = document.createElement('div');
    menu.className = 'bs-context-menu';
    menu.style.cssText = `left:${event.clientX}px;top:${event.clientY}px`;

    const items = [
      { label: book.status === 'reading' ? '✓ 已在在读' : '📖 标记为在读', action: 'reading' },
      { label: book.status === 'want_to_read' ? '✓ 已在想读' : '📌 标记为想读', action: 'want_to_read' },
      { label: book.status === 'completed' ? '✓ 已读完' : '✅ 标记为已读完', action: 'completed' },
      { label: '🗑️ 移出书架', action: 'delete', cls: 'bs-cm-danger' },
    ];

    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'bs-cm-item' + (item.cls ? ' ' + item.cls : '');
      el.textContent = item.label;
      el.addEventListener('click', () => {
        menu.remove();
        if (item.action === 'delete') {
          this.deleteBook(bookId);
        } else {
          this.updateBookStatus(bookId, item.action);
        }
      });
      menu.appendChild(el);
    });

    document.body.appendChild(menu);

    // Close on click outside
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  },

  async updateBookStatus(bookId, status) {
    try {
      const res = await fetch(`/api/reading-room/bookshelf/${bookId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.ok) {
        const idx = this.books.findIndex(b => b.id === bookId);
        if (idx >= 0) this.books[idx].status = status;
        this.show();
      }
    } catch (e) {
      alert('操作失败: ' + e.message);
    }
  },

  async deleteBook(bookId) {
    if (!confirm('确定要移出书架吗？')) return;
    try {
      const res = await fetch(`/api/reading-room/bookshelf/${bookId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.ok) {
        this.books = this.books.filter(b => b.id !== bookId);
        this.show();
      }
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  },

  async openBook(filePath, fileName, cardEl) {
    try {
      const res = await fetch(`/api/reading-room/content?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (!data.ok) { alert('打开失败: ' + data.error); return; }

      // Auto-add to bookshelf if not already there
      const existing = this.books.find(b => b.path === filePath);
      if (!existing) {
        await fetch('/api/reading-room/bookshelf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: fileName, path: filePath }),
        });
      }

      // Update last read time
      if (existing) {
        await fetch(`/api/reading-room/bookshelf/${existing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastReadAt: new Date().toISOString() }),
        });
      }

      if (data.type === 'text') {
        TextReader.open(filePath, data.name, data.content, () => {
          this.load();
          this.show();
        });
      } else if (data.type === 'pdf') {
        PDFReader.open(data.url, data.name, () => {
          this.load();
          this.show();
        });
      } else if (data.type === 'docx') {
        WordReader.open(data.url, data.name, () => {
          this.load();
          this.show();
        });
      }
    } catch (e) {
      alert('打开失败: ' + e.message);
    }
  },

  // ============ Import ============

  showImport() {
    const container = document.getElementById('rr-category-content');

    container.innerHTML = `
      <div class="rr-section-header">
        <h3>📥 导入小说</h3>
        <button class="btn btn-sm" onclick="Bookshelf.show()">← 返回书架</button>
      </div>
      <div class="bs-import-tabs">
        <span class="bs-import-tab active" data-import="url">从URL导入</span>
        <span class="bs-import-tab" data-import="paste">粘贴内容</span>
        <span class="bs-import-tab" data-import="search">搜索在线资源</span>
      </div>
      <div id="bs-import-body">
        ${this.renderImportUrl()}
      </div>
    `;

    container.querySelectorAll('.bs-import-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.bs-import-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const body = document.getElementById('bs-import-body');
        const type = tab.dataset.import;
        if (type === 'url') body.innerHTML = this.renderImportUrl();
        else if (type === 'paste') body.innerHTML = this.renderImportPaste();
        else if (type === 'search') body.innerHTML = this.renderImportSearch();
        this.bindImportEvents(type);
      });
    });

    this.bindImportEvents('url');
  },

  renderImportUrl() {
    return `
      <div class="bs-import-box">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px">📤 从网址导入</div>
        <p style="font-size:12px;color:var(--text3);margin-bottom:12px">输入小说的直接下载链接（支持 .txt 格式文件）</p>
        <input type="url" id="bs-import-url-input" class="bs-import-input" placeholder="https://example.com/novel.txt" autofocus>
        <div style="margin-top:4px">
          <label style="font-size:11px;color:var(--text3)">自定义文件名（可选）</label>
          <input type="text" id="bs-import-url-name" class="bs-import-input" placeholder="小说名称" style="margin-top:4px">
        </div>
        <div id="bs-import-url-status" class="bs-import-status"></div>
        <button class="btn" id="bs-import-url-btn">⬇️ 下载</button>
      </div>
    `;
  },

  renderImportPaste() {
    return `
      <div class="bs-import-box">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px">📋 粘贴文本</div>
        <p style="font-size:12px;color:var(--text3);margin-bottom:12px">将小说文本直接粘贴到下方</p>
        <div style="margin-bottom:8px">
          <label style="font-size:11px;color:var(--text3)">小说名称 *</label>
          <input type="text" id="bs-import-paste-name" class="bs-import-input" placeholder="输入小说名称" required>
        </div>
        <textarea id="bs-import-paste-text" class="bs-import-textarea" placeholder="在此粘贴小说内容..." rows="15"></textarea>
        <div id="bs-import-paste-status" class="bs-import-status"></div>
        <button class="btn" id="bs-import-paste-btn">💾 保存</button>
      </div>
    `;
  },

  renderImportSearch() {
    return `
      <div class="bs-import-box">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px">🔍 在线搜索</div>
        <p style="font-size:12px;color:var(--text3);margin-bottom:12px">搜索笔趣阁等在线小说资源</p>
        <div style="display:flex;gap:8px">
          <input type="text" id="bs-import-search-input" class="bs-import-input" placeholder="输入小说名称搜索..." style="flex:1" autofocus>
          <button class="btn" id="bs-import-search-btn">🔍 搜索</button>
        </div>
        <div id="bs-import-search-status" class="bs-import-status"></div>
        <div id="bs-import-search-results"></div>
      </div>
    `;
  },

  bindImportEvents(type) {
    if (type === 'url') {
      const urlInput = document.getElementById('bs-import-url-input');
      const nameInput = document.getElementById('bs-import-url-name');
      const btn = document.getElementById('bs-import-url-btn');

      if (urlInput) urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn?.click(); });
      if (btn) btn.addEventListener('click', () => this.importFromUrl());
    } else if (type === 'paste') {
      document.getElementById('bs-import-paste-btn')?.addEventListener('click', () => this.importFromPaste());
    } else if (type === 'search') {
      const searchInput = document.getElementById('bs-import-search-input');
      const btn = document.getElementById('bs-import-search-btn');
      if (searchInput) searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn?.click(); });
      if (btn) btn.addEventListener('click', () => this.doSearch());
    }
  },

  async importFromUrl() {
    const url = document.getElementById('bs-import-url-input')?.value?.trim();
    const name = document.getElementById('bs-import-url-name')?.value?.trim();
    const statusEl = document.getElementById('bs-import-url-status');
    const btn = document.getElementById('bs-import-url-btn');

    if (!url) { statusEl.innerHTML = '<span style="color:#e67e22">⚠️ 请输入下载链接</span>'; return; }

    btn.disabled = true;
    btn.textContent = '⏳ 下载中...';
    statusEl.innerHTML = '<span style="color:#3498db">⏳ 正在下载...</span>';

    try {
      const res = await fetch('/api/reading-room/import/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, name }),
      });
      const data = await res.json();

      if (data.ok) {
        statusEl.innerHTML = `<span style="color:#27ae60">✅ 下载完成: ${data.file.name} (${(data.file.size / 1024).toFixed(1)} KB)</span>`;
        btn.textContent = '✅ 完成';
        // Auto-add to bookshelf
        await fetch('/api/reading-room/bookshelf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name || data.file.name, path: data.file.path }),
        });
        setTimeout(() => { this.load(); this.show(); }, 1200);
      } else if (data.error === 'redirect') {
        statusEl.innerHTML = `<span style="color:#e67e22">🔄 链接跳转，请尝试直接下载链接</span>`;
        if (data.redirectUrl) statusEl.innerHTML += `<br><span style="font-size:11px">跳转至: ${data.redirectUrl}</span>`;
        btn.disabled = false;
        btn.textContent = '⬇️ 下载';
      } else {
        statusEl.innerHTML = `<span style="color:#e74c3c">❌ 下载失败: ${data.error}</span>`;
        btn.disabled = false;
        btn.textContent = '⬇️ 下载';
      }
    } catch (e) {
      statusEl.innerHTML = `<span style="color:#e74c3c">❌ 网络错误: ${e.message}</span>`;
      btn.disabled = false;
      btn.textContent = '⬇️ 下载';
    }
  },

  async importFromPaste() {
    const name = document.getElementById('bs-import-paste-name')?.value?.trim();
    const text = document.getElementById('bs-import-paste-text')?.value;
    const statusEl = document.getElementById('bs-import-paste-status');
    const btn = document.getElementById('bs-import-paste-btn');

    if (!name) { statusEl.innerHTML = '<span style="color:#e67e22">⚠️ 请输入小说名称</span>'; return; }
    if (!text || text.length < 50) { statusEl.innerHTML = '<span style="color:#e67e22">⚠️ 内容太少（至少50个字符）</span>'; return; }

    btn.disabled = true;
    btn.textContent = '⏳ 保存中...';
    statusEl.innerHTML = '<span style="color:#3498db">⏳ 正在保存...</span>';

    try {
      const res = await fetch('/api/reading-room/import/paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content: text }),
      });
      const data = await res.json();

      if (data.ok) {
        statusEl.innerHTML = `<span style="color:#27ae60">✅ 保存成功 (${(data.file.size / 1024).toFixed(1)} KB)</span>`;
        btn.textContent = '✅ 完成';
        // Auto-add to bookshelf
        await fetch('/api/reading-room/bookshelf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, path: data.file.path }),
        });
        setTimeout(() => { this.load(); this.show(); }, 1200);
      } else {
        statusEl.innerHTML = `<span style="color:#e74c3c">❌ 保存失败: ${data.error}</span>`;
        btn.disabled = false;
        btn.textContent = '💾 保存';
      }
    } catch (e) {
      statusEl.innerHTML = `<span style="color:#e74c3c">❌ 网络错误: ${e.message}</span>`;
      btn.disabled = false;
      btn.textContent = '💾 保存';
    }
  },

  async doSearch() {
    const keyword = document.getElementById('bs-import-search-input')?.value?.trim();
    const statusEl = document.getElementById('bs-import-search-status');
    const resultsEl = document.getElementById('bs-import-search-results');

    if (!keyword) { statusEl.innerHTML = '<span style="color:#e67e22">⚠️ 请输入关键词</span>'; return; }

    statusEl.innerHTML = '<span style="color:#3498db">⏳ 搜索中...</span>';
    resultsEl.innerHTML = '';

    try {
      const res = await fetch('/api/reading-room/import/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword }),
      });
      const data = await res.json();

      if (!data.ok) {
        statusEl.innerHTML = `<span style="color:#e74c3c">❌ 搜索失败: ${data.error}</span>`;
        return;
      }

      if (!data.results || data.results.length === 0) {
        statusEl.innerHTML = '<span style="color:#e67e22">⚠️ 未找到结果，请尝试其他关键词</span>';
        resultsEl.innerHTML = `
          <div class="rr-empty">
            <div class="rr-empty-icon">🔍</div>
            <div>未找到相关结果</div>
            <div style="font-size:11px;color:var(--text3);margin-top:4px">
              建议去 <a href="https://www.biquge.com/" target="_blank" style="color:var(--accent)">笔趣阁</a>、
              <a href="https://www.qidian.com/" target="_blank" style="color:var(--accent)">起点中文网</a> 直接搜索
            </div>
          </div>
        `;
        return;
      }

      statusEl.innerHTML = `<span style="color:#27ae60">✅ 找到 ${data.results.length} 个结果</span>`;

      resultsEl.innerHTML = data.results.map((r, i) => `
        <div class="bs-search-result" onclick="Bookshelf.importSearchResult(${i})" data-index="${i}">
          <span class="bs-sr-icon">📖</span>
          <div class="bs-sr-info">
            <div class="bs-sr-title">${this.escapeHtml(r.title)}</div>
            <div class="bs-sr-url">${this.escapeHtml(r.url)}</div>
          </div>
          <button class="bs-sr-btn">下载</button>
        </div>
      `).join('');

      // Store results for later use
      this._searchResults = data.results;

    } catch (e) {
      statusEl.innerHTML = `<span style="color:#e74c3c">❌ 搜索出错: ${e.message}</span>`;
    }
  },

  async importSearchResult(index) {
    if (!this._searchResults || !this._searchResults[index]) return;
    const result = this._searchResults[index];

    // Open in link viewer or try to download
    const statusEl = document.getElementById('bs-import-search-status');
    statusEl.innerHTML = `<span style="color:#3498db">⏳ 正在获取 ${this.escapeHtml(result.title)}...</span>`;

    try {
      // Use URL import to download
      const res = await fetch('/api/reading-room/import/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: result.url, name: result.title }),
      });
      const data = await res.json();
      if (data.ok) {
        statusEl.innerHTML = `<span style="color:#27ae60">✅ 下载完成</span>`;
        await fetch('/api/reading-room/bookshelf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: result.title, path: data.file.path }),
        });
        setTimeout(() => { this.load(); this.show(); }, 1200);
      } else {
        statusEl.innerHTML = `<span style="color:#e67e22">⚠️ 无法直接下载，请在浏览器中打开查看: ${this.escapeHtml(result.url)}</span>`;
        window.open(result.url, '_blank');
      }
    } catch (e) {
      statusEl.innerHTML = `<span style="color:#e74c3c">❌ 错误: ${e.message}</span>`;
    }
  },
};

// Expose globally
window.Bookshelf = Bookshelf;
