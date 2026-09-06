// Text Reader - Supports .txt and .md files with full reading customization
const TextReader = {
  container: null,
  filePath: null,
  fileName: null,
  content: '',
  chapters: [],
  currentChapter: 0,
  currentPos: 0,
  fontSize: 16,
  fontFamily: 'system-ui',
  lineHeight: 1.8,
  theme: 'sepia',
  isTtsPlaying: false,
  ttsUtterance: null,
  ttsRate: 1.0,
  ttsVoice: null,
  onClose: null,

  themes: {
    white: { bg: '#ffffff', color: '#333333', name: '白底' },
    sepia: { bg: '#f5f0e8', color: '#5a4632', name: '米黄护眼' },
    dark: { bg: '#1a1a1a', color: '#cccccc', name: '深色夜间' },
  },

  fonts: [
    { value: 'system-ui', label: '系统默认' },
    { value: '"Noto Serif SC", "Source Han Serif", serif', label: '宋体' },
    { value: '"STKaiti", "KaiTi", serif', label: '楷体' },
    { value: '"Microsoft YaHei", "PingFang SC", sans-serif', label: '黑体' },
    { value: '"Consolas", "Source Code Pro", monospace', label: '等宽' },
  ],

  open(filePath, fileName, content, onClose) {
    this.filePath = filePath;
    this.fileName = fileName;
    this.content = content;
    this.onClose = onClose;

    // Load saved progress
    this.loadProgress();

    // Parse chapters
    this.parseChapters();

    this.render();
    this.applyTheme();
  },

  parseChapters() {
    const lines = this.content.split('\n');
    this.chapters = [];
    let currentChapter = -1;

    // Chapter markers: 第X章, 第X节, ===XXX===, ## XXX (for md), ---
    const chapterPattern = /^(第[一二三四五六七八九十百千万\d]+[章节篇回]|[一二三四五六七八九十百千万\d]+[、\.\s].*[章节篇]|===\s*.+\s*===|^#{1,3}\s+.+$)/;

    lines.forEach((line, idx) => {
      if (chapterPattern.test(line.trim()) || line.trim().match(/^第\d+[章节]/)) {
        this.chapters.push({ title: line.trim(), startLine: idx });
        currentChapter++;
      }
    });

    // If no chapters found, treat entire file as one chapter
    if (this.chapters.length === 0) {
      this.chapters.push({ title: this.fileName || '全文', startLine: 0 });
    }

    // Set initial chapter
    this.currentChapter = 0;
  },

  render() {
    // Remove existing reader if any
    const existing = document.querySelector('.rr-reader-container');
    if (existing) existing.remove();

    this.container = document.createElement('div');
    this.container.className = 'rr-reader-container';
    this.container.style.setProperty('--reader-bg', this.themes[this.theme].bg);

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'rr-reader-toolbar';
    toolbar.innerHTML = `
      <button class="rr-rt-btn" id="rr-back-btn">← 返回</button>
      <span style="font-weight:600;font-size:13px;color:var(--text)">${this.fileName}</span>
      <span style="flex:1"></span>
      <span style="font-size:11px;color:var(--text3)">字号</span>
      <button class="rr-rt-btn" id="rr-font-down">A-</button>
      <button class="rr-rt-btn" id="rr-font-up">A+</button>
      <select id="rr-font-select">
        ${this.fonts.map(f => `<option value="${f.value}" ${f.value === this.fontFamily ? 'selected' : ''}>${f.label}</option>`).join('')}
      </select>
      <span style="font-size:11px;color:var(--text3)">主题</span>
      <button class="rr-rt-btn ${this.theme === 'white' ? 'active' : ''}" data-theme="white">白底</button>
      <button class="rr-rt-btn ${this.theme === 'sepia' ? 'active' : ''}" data-theme="sepia">护眼</button>
      <button class="rr-rt-btn ${this.theme === 'dark' ? 'active' : ''}" data-theme="dark">夜间</button>
      <button class="rr-rt-btn" id="rr-toc-toggle">📑 目录</button>
      <button class="rr-rt-btn" id="rr-bookmark-btn">🔖 书签</button>
      <button class="rr-rt-btn" id="rr-search-btn">🔍 搜索</button>
      <button class="rr-rt-btn ${this.isTtsPlaying ? 'rr-tts-playing' : ''}" id="rr-tts-btn">🔊 听书</button>
      <select id="rr-tts-speed">
        <option value="0.5">0.5x</option>
        <option value="0.75">0.75x</option>
        <option value="1" selected>1x</option>
        <option value="1.25">1.25x</option>
        <option value="1.5">1.5x</option>
        <option value="2">2x</option>
      </select>
      <span style="font-size:11px;color:var(--text3)">行距</span>
      <select id="rr-line-height">
        <option value="1.4">1.4</option>
        <option value="1.6">1.6</option>
        <option value="1.8" ${this.lineHeight === 1.8 ? 'selected' : ''}>1.8</option>
        <option value="2.0">2.0</option>
        <option value="2.4">2.4</option>
      </select>
    `;
    this.container.appendChild(toolbar);

    // Reading body
    const body = document.createElement('div');
    body.className = 'rr-reader-body';
    body.id = 'rr-reader-body';

    // TOC panel
    const tocPanel = document.createElement('div');
    tocPanel.className = 'rr-toc-panel';
    tocPanel.id = 'rr-toc-panel';
    this.chapters.forEach((ch, i) => {
      const item = document.createElement('div');
      item.className = 'rr-toc-item' + (i === this.currentChapter ? ' active' : '');
      item.textContent = ch.title;
      item.dataset.index = i;
      item.addEventListener('click', () => this.goToChapter(i));
      tocPanel.appendChild(item);
    });
    body.appendChild(tocPanel);

    // Content area
    const contentArea = document.createElement('div');
    contentArea.id = 'rr-content-area';
    contentArea.style.cssText = `
      font-size: ${this.fontSize}px;
      font-family: ${this.fontFamily};
      line-height: ${this.lineHeight};
      max-width: 800px;
      margin: 0 auto;
      white-space: pre-wrap;
      word-wrap: break-word;
    `;

    if (this.fileName.endsWith('.md')) {
      // Simple markdown rendering
      contentArea.innerHTML = this.renderMarkdown(this.getCurrentChapterContent());
    } else {
      contentArea.textContent = this.getCurrentChapterContent();
    }

    body.appendChild(contentArea);

    // Progress bar
    const progressBar = document.createElement('div');
    progressBar.className = 'rr-reading-progress';
    progressBar.innerHTML = '<div class="rr-progress-fill" id="rr-progress-fill" style="width:0%"></div>';
    body.appendChild(progressBar);

    this.container.appendChild(body);

    // Chapter navigation
    const chapterNav = document.createElement('div');
    chapterNav.className = 'rr-chapter-nav';
    chapterNav.innerHTML = `
      <button id="rr-prev-chapter">← 上一章</button>
      <span style="font-size:12px;color:var(--text3)" id="rr-chapter-info">${this.currentChapter + 1}/${this.chapters.length} · ${this.chapters[this.currentChapter].title}</span>
      <button id="rr-next-chapter">下一章 →</button>
    `;
    this.container.appendChild(chapterNav);

    document.body.appendChild(this.container);

    // Event listeners
    this.bindEvents();

    // Restore scroll position
    this.restorePosition();
  },

  renderMarkdown(text) {
    // Simple markdown to HTML
    let html = text;
    // Headings
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // Bold/italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    html = html.replace(/\*(.+?)\*/g, '<i>$1</i>');
    html = html.replace(/__(.+?)__/g, '<u>$1</u>');
    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    // Images
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">');
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    // Horizontal rules
    html = html.replace(/^---+$/gm, '<hr>');
    return html;
  },

  getCurrentChapterContent() {
    const ch = this.chapters[this.currentChapter];
    if (!ch) return '';
    const startLine = ch.startLine;
    const endLine = this.currentChapter + 1 < this.chapters.length
      ? this.chapters[this.currentChapter + 1].startLine
      : -1;

    const lines = this.content.split('\n');
    if (endLine === -1) {
      return lines.slice(startLine).join('\n');
    }
    return lines.slice(startLine, endLine).join('\n');
  },

  bindEvents() {
    // Back button
    document.getElementById('rr-back-btn').addEventListener('click', () => {
      this.saveProgress();
      if (this.isTtsPlaying) this.stopTts();
      this.container.remove();
      if (this.onClose) this.onClose();
    });

    // Font size
    document.getElementById('rr-font-down').addEventListener('click', () => {
      if (this.fontSize > 12) {
        this.fontSize -= 2;
        document.getElementById('rr-content-area').style.fontSize = this.fontSize + 'px';
      }
    });
    document.getElementById('rr-font-up').addEventListener('click', () => {
      if (this.fontSize < 32) {
        this.fontSize += 2;
        document.getElementById('rr-content-area').style.fontSize = this.fontSize + 'px';
      }
    });

    // Font family
    document.getElementById('rr-font-select').addEventListener('change', (e) => {
      this.fontFamily = e.target.value;
      document.getElementById('rr-content-area').style.fontFamily = this.fontFamily;
    });

    // Theme buttons
    document.querySelectorAll('[data-theme]').forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        this.theme = theme;
        this.applyTheme();
        document.querySelectorAll('[data-theme]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // TOC toggle
    document.getElementById('rr-toc-toggle').addEventListener('click', () => {
      document.getElementById('rr-toc-panel').classList.toggle('open');
    });

    // TTS
    document.getElementById('rr-tts-btn').addEventListener('click', () => this.toggleTts());
    document.getElementById('rr-tts-speed').addEventListener('change', (e) => {
      this.ttsRate = parseFloat(e.target.value);
    });

    // Line height
    document.getElementById('rr-line-height').addEventListener('change', (e) => {
      this.lineHeight = parseFloat(e.target.value);
      document.getElementById('rr-content-area').style.lineHeight = this.lineHeight;
    });

    // Chapter nav
    document.getElementById('rr-prev-chapter').addEventListener('click', () => {
      if (this.currentChapter > 0) this.goToChapter(this.currentChapter - 1);
    });
    document.getElementById('rr-next-chapter').addEventListener('click', () => {
      if (this.currentChapter + 1 < this.chapters.length) this.goToChapter(this.currentChapter + 1);
    });

    // Bookmark button
    document.getElementById('rr-bookmark-btn').addEventListener('click', () => this.toggleBookmark());

    // Search button
    document.getElementById('rr-search-btn').addEventListener('click', () => this.showSearch());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!this.container || !this.container.isConnected) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      switch (e.key) {
        case 'ArrowDown':
        case ' ':
          e.preventDefault();
          const body = document.getElementById('rr-reader-body');
          if (body) body.scrollTop += body.clientHeight * 0.9;
          break;
        case 'ArrowUp':
          e.preventDefault();
          const body2 = document.getElementById('rr-reader-body');
          if (body2) body2.scrollTop -= body2.clientHeight * 0.9;
          break;
        case 'ArrowLeft':
          if (this.currentChapter > 0) this.goToChapter(this.currentChapter - 1);
          break;
        case 'ArrowRight':
          if (this.currentChapter + 1 < this.chapters.length) this.goToChapter(this.currentChapter + 1);
          break;
        case 'b':
        case 'B':
          this.toggleBookmark();
          break;
        case 'f':
        case 'F':
          this.showSearch();
          break;
        case 'Escape':
          if (document.getElementById('rr-toc-panel')?.classList.contains('open')) {
            document.getElementById('rr-toc-panel').classList.remove('open');
          }
          // Close search overlay
          const searchOverlay = document.getElementById('rr-search-overlay');
          if (searchOverlay) searchOverlay.remove();
          break;
      }
    });

    // Auto-save scroll position
    const body = document.getElementById('rr-reader-body');
    let saveTimer = null;
    body.addEventListener('scroll', () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => this.autoSave(), 3000);
    });
  },

  applyTheme() {
    const theme = this.themes[this.theme];
    if (!theme) return;
    this.container.style.setProperty('--reader-bg', theme.bg);
    const body = document.getElementById('rr-reader-body');
    if (body) {
      body.style.background = theme.bg;
      body.style.color = theme.color;
    }
    const contentArea = document.getElementById('rr-content-area');
    if (contentArea) contentArea.style.color = theme.color;
  },

  goToChapter(index) {
    if (index < 0 || index >= this.chapters.length) return;
    this.currentChapter = index;
    const contentArea = document.getElementById('rr-content-area');
    if (this.fileName.endsWith('.md')) {
      contentArea.innerHTML = this.renderMarkdown(this.getCurrentChapterContent());
    } else {
      contentArea.textContent = this.getCurrentChapterContent();
    }
    document.getElementById('rr-reader-body').scrollTop = 0;

    // Update chapter info
    document.getElementById('rr-chapter-info').textContent =
      `${this.currentChapter + 1}/${this.chapters.length} · ${this.chapters[index].title}`;

    // TOC active
    document.querySelectorAll('.rr-toc-item').forEach((item, i) => {
      item.classList.toggle('active', i === index);
    });

    this.updateProgress();
  },

  updateProgress() {
    const fill = document.getElementById('rr-progress-fill');
    if (fill) {
      const pct = ((this.currentChapter + 1) / this.chapters.length) * 100;
      fill.style.width = Math.min(pct, 100) + '%';
    }
  },

  toggleTts() {
    if (this.isTtsPlaying) {
      this.stopTts();
    } else {
      this.startTts();
    }
  },

  startTts() {
    if (!window.speechSynthesis) {
      alert('您的浏览器不支持语音合成功能');
      return;
    }

    this.isTtsPlaying = true;
    document.getElementById('rr-tts-btn').classList.add('rr-tts-playing');
    document.getElementById('rr-tts-btn').textContent = '⏸ 暂停';

    const text = this.getCurrentChapterContent().replace(/[#*_\[\]()>|`-]/g, '').substring(0, 5000);
    this.ttsUtterance = new SpeechSynthesisUtterance(text);
    this.ttsUtterance.rate = this.ttsRate;
    this.ttsUtterance.lang = 'zh-CN';

    this.ttsUtterance.onend = () => {
      // Auto advance to next chapter
      if (this.currentChapter + 1 < this.chapters.length) {
        this.goToChapter(this.currentChapter + 1);
        this.startTts();
      } else {
        this.stopTts();
      }
    };

    this.ttsUtterance.onerror = () => {
      this.stopTts();
    };

    window.speechSynthesis.speak(this.ttsUtterance);
  },

  stopTts() {
    this.isTtsPlaying = false;
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    const btn = document.getElementById('rr-tts-btn');
    if (btn) {
      btn.classList.remove('rr-tts-playing');
      btn.textContent = '🔊 听书';
    }
  },

  saveProgress() {
    const body = document.getElementById('rr-reader-body');
    const scrollPct = body ? body.scrollTop / (body.scrollHeight - body.clientHeight) : 0;
    const progress = {
      [this.filePath]: {
        chapter: this.currentChapter,
        scrollPct: isNaN(scrollPct) ? 0 : scrollPct,
        lastRead: new Date().toISOString(),
      }
    };

    fetch('/api/reading-room/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(progress),
    }).catch(() => {});
  },

  loadProgress() {
    fetch(`/api/reading-room/progress?t=${Date.now()}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.progress && data.progress[this.filePath]) {
          const p = data.progress[this.filePath];
          this.currentChapter = p.chapter || 0;
          this.savedScrollPct = p.scrollPct || 0;
        }
      })
      .catch(() => {});
  },

  restorePosition() {
    if (this.savedScrollPct && this.savedScrollPct > 0) {
      setTimeout(() => {
        const body = document.getElementById('rr-reader-body');
        if (body) {
          body.scrollTop = this.savedScrollPct * (body.scrollHeight - body.clientHeight);
        }
      }, 100);
    }

    // Load bookmark state after a short delay
    setTimeout(() => this.loadBookmarkState(), 300);

    // Auto-add to bookshelf if opened from outside
    setTimeout(() => {
      if (this.filePath && this.fileName) {
        fetch('/api/reading-room/bookshelf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: this.fileName, path: this.filePath }),
        }).catch(() => {});
      }
    }, 500);
  },

  // ========== Bookmark support ==========

  async toggleBookmark() {
    const body = document.getElementById('rr-reader-body');
    if (!body || !this.filePath) return;

    const scrollPct = body.scrollTop / (body.scrollHeight - body.clientHeight) || 0;
    const ch = this.chapters[this.currentChapter];

    // Get current text snippet
    const content = this.getCurrentChapterContent();
    const lines = content.split('\n');
    const visibleLines = Math.ceil(body.clientHeight / 24); // approximate
    const currentLineIdx = Math.floor((scrollPct * lines.length));
    const snippet = lines.slice(currentLineIdx, currentLineIdx + 3).join(' ').substring(0, 100).trim();

    const btn = document.getElementById('rr-bookmark-btn');

    try {
      // Check if bookmark already exists at this position
      const res = await fetch(`/api/reading-room/bookmarks/${encodeURIComponent(this.filePath)}`);
      const data = await res.json();
      if (!data.ok) return;

      const existing = data.bookmarks.find(b =>
        b.chapter === (ch ? ch.title : '') &&
        Math.abs((b.position || 0) - scrollPct) < 0.05
      );

      if (existing) {
        // Remove bookmark
        const delRes = await fetch(`/api/reading-room/bookmark/${existing.id}`, {
          method: 'DELETE'
        });
        const delData = await delRes.json();
        if (delData.ok) {
          btn.textContent = '🔖 书签';
          btn.classList.remove('active');
          this.showToast('已移除书签');
        }
      } else {
        // Add bookmark
        const addRes = await fetch('/api/reading-room/bookmark', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filePath: this.filePath,
            fileName: this.fileName,
            chapter: ch ? ch.title : '',
            position: scrollPct,
            textSnippet: snippet || '（无内容）',
          })
        });
        const addData = await addRes.json();
        if (addData.ok) {
          btn.textContent = '🔖 ✓';
          btn.classList.add('active');
          this.showToast('已添加书签 ✓');
        }
      }
    } catch (e) {
      console.error('Bookmark error:', e);
    }
  },

  async loadBookmarkState() {
    if (!this.filePath) return;
    try {
      const res = await fetch(`/api/reading-room/bookmarks/${encodeURIComponent(this.filePath)}`);
      const data = await res.json();
      if (data.ok && data.bookmarks.length > 0) {
        const btn = document.getElementById('rr-bookmark-btn');
        if (btn) {
          btn.textContent = '🔖 ✓';
          btn.classList.add('active');
        }
      }
    } catch {}
  },

  // ========== Search overlay ==========

  showSearch() {
    // Remove existing overlay
    const existing = document.getElementById('rr-search-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'rr-search-overlay';
    overlay.className = 'rr-search-overlay';
    overlay.innerHTML = `
      <div class="rr-search-box">
        <div style="display:flex;gap:8px;align-items:center">
          <input type="text" id="rr-search-input" class="rr-search-input" placeholder="搜索当前文件..." autofocus>
          <button class="btn btn-sm" id="rr-search-do-btn">🔍</button>
          <button class="btn btn-sm btn-ghost" id="rr-search-close-btn">✕</button>
        </div>
        <div class="rr-search-scope" style="margin:8px 0 4px;display:flex;gap:12px;font-size:11px">
          <label><input type="radio" name="rr-search-scope" value="chapter" checked> 当前章节</label>
          <label><input type="radio" name="rr-search-scope" value="full"> 全书搜索</label>
        </div>
        <div id="rr-search-status" style="font-size:11px;color:var(--text3);margin-bottom:4px"></div>
        <div id="rr-search-results" class="rr-search-results">
          <div style="text-align:center;color:var(--text3);padding:20px;font-size:12px">
            输入关键词搜索，按 Enter 搜索<br>
            <span style="font-size:10px">快捷键: F 打开搜索, Esc 关闭</span>
          </div>
        </div>
      </div>
    `;

    document.getElementById('rr-reader-body')?.appendChild(overlay);

    const input = document.getElementById('rr-search-input');
    const doBtn = document.getElementById('rr-search-do-btn');
    const closeBtn = document.getElementById('rr-search-close-btn');

    const doSearch = () => this.doSearch();
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
      if (e.key === 'Escape') overlay.remove();
    });
    doBtn?.addEventListener('click', doSearch);
    closeBtn?.addEventListener('click', () => overlay.remove());

    setTimeout(() => input?.focus(), 100);
  },

  async doSearch() {
    const query = document.getElementById('rr-search-input')?.value?.trim();
    const status = document.getElementById('rr-search-status');
    const results = document.getElementById('rr-search-results');
    const scope = document.querySelector('input[name="rr-search-scope"]:checked')?.value || 'chapter';

    if (!query) {
      if (status) status.textContent = '⚠️ 请输入关键词';
      return;
    }

    if (status) status.textContent = '⏳ 搜索中...';
    if (results) results.innerHTML = '';

    if (scope === 'chapter') {
      // Search current chapter only (client-side)
      const content = this.getCurrentChapterContent();
      const lines = content.split('\n');
      const matches = [];
      const q = query.toLowerCase();

      lines.forEach((line, idx) => {
        if (line.toLowerCase().includes(q)) {
          matches.push({
            lineNumber: idx + 1,
            line: line.trim().substring(0, 120),
            context: lines.slice(Math.max(0, idx - 1), idx + 2).join('\n').substring(0, 250),
            chapter: this.chapters[this.currentChapter]?.title || '',
          });
        }
      });

      this.renderSearchResults(matches, query, status, results);
    } else {
      // Full book search via API
      try {
        const res = await fetch('/api/reading-room/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: this.filePath, query }),
        });
        const data = await res.json();
        if (data.ok) {
          this.renderSearchResults(data.results, query, status, results);
        } else {
          if (status) status.textContent = '❌ ' + data.error;
        }
      } catch (e) {
        if (status) status.textContent = '❌ 搜索失败: ' + e.message;
      }
    }
  },

  renderSearchResults(matches, query, statusEl, resultsEl) {
    if (matches.length === 0) {
      if (statusEl) statusEl.textContent = '❌ 未找到匹配结果';
      if (resultsEl) resultsEl.innerHTML = '<div class="rr-empty" style="padding:20px"><div class="rr-empty-icon">🔍</div><div>无匹配结果</div></div>';
      return;
    }

    if (statusEl) statusEl.innerHTML = `✅ 找到 <strong>${matches.length}</strong> 个结果`;

    if (resultsEl) {
      resultsEl.innerHTML = matches.map((m, i) => `
        <div class="rr-search-result-item" onclick="TextReader.goToSearchResult(${m.lineNumber})" title="点击跳转">
          <div class="rr-sr-header">
            <span class="rr-sr-num">#${i + 1}</span>
            <span class="rr-sr-chapter">${this.escapeHtml(m.chapter || '')}</span>
            <span class="rr-sr-line">行 ${m.lineNumber}</span>
          </div>
          <div class="rr-sr-context">${this.highlightText(this.escapeHtml(m.context || m.line), query)}</div>
        </div>
      `).join('');
    }
  },

  goToSearchResult(lineNumber) {
    // Navigate to the chapter containing this line, then scroll to it
    for (let i = this.chapters.length - 1; i >= 0; i--) {
      if (this.chapters[i].startLine <= lineNumber - 1) {
        if (i !== this.currentChapter) {
          this.goToChapter(i);
        }
        // Scroll to approximate position
        setTimeout(() => {
          const body = document.getElementById('rr-reader-body');
          if (body) {
            const content = this.getCurrentChapterContent();
            const lines = content.split('\n');
            const targetLine = lineNumber - this.chapters[this.currentChapter].startLine - 1;
            const pct = targetLine / lines.length;
            body.scrollTop = pct * (body.scrollHeight - body.clientHeight);
          }
        }, 200);
        break;
      }
    }

    // Close search overlay
    document.getElementById('rr-search-overlay')?.remove();
  },

  highlightText(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark class="rr-search-highlight">$1</mark>');
  },

  // ========== Toast notification ==========

  showToast(msg) {
    const existing = document.querySelector('.rr-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'rr-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  },

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  autoSave() {
    this.saveProgress();
    this.updateProgress();
  },
};
