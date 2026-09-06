// Download Manager for reading room
const DownloadManager = {
  overlay: null,
  currentCategory: null,

  show(categoryId) {
    this.currentCategory = categoryId;

    this.overlay = document.createElement('div');
    this.overlay.className = 'rr-download-overlay';
    this.overlay.innerHTML = `
      <div class="rr-download-box">
        <h3>📥 下载文件</h3>
        <p style="font-size:12px;color:var(--text3);margin-bottom:12px">
          输入文件下载链接，将保存到当前分类目录
        </p>
        <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">下载链接</label>
        <input type="url" id="rr-dl-url" placeholder="https://example.com/file.pdf" autofocus>
        <div id="rr-dl-status" style="font-size:12px;margin-top:8px;color:var(--text3)"></div>
        <div class="rr-dl-actions">
          <button class="btn btn-sm btn-ghost" id="rr-dl-cancel">取消</button>
          <button class="btn btn-sm" id="rr-dl-start">⬇ 下载</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    document.getElementById('rr-dl-cancel').onclick = () => this.hide();
    document.getElementById('rr-dl-start').onclick = () => this.startDownload();
    document.getElementById('rr-dl-url').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.startDownload();
    });

    // Focus input
    setTimeout(() => document.getElementById('rr-dl-url')?.focus(), 100);
  },

  async startDownload() {
    const url = document.getElementById('rr-dl-url').value.trim();
    if (!url) {
      this.showStatus('⚠️ 请输入下载链接', '#e67e22');
      return;
    }

    const btn = document.getElementById('rr-dl-start');
    btn.disabled = true;
    btn.textContent = '⏳ 下载中...';
    this.showStatus('⏳ 正在下载...', '#3498db');

    try {
      const response = await fetch('/api/reading-room/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, category: this.currentCategory }),
      });

      const data = await response.json();

      if (data.ok) {
        this.showStatus(`✅ 下载完成: ${data.file.name} (${(data.file.size / 1024).toFixed(1)} KB)`, '#27ae60');
        btn.textContent = '✅ 完成';
        // Refresh file list after short delay
        setTimeout(() => {
          this.hide();
          if (window.readingRoom) window.readingRoom.refreshFiles(this.currentCategory);
        }, 1500);
      } else if (data.error === 'redirect') {
        this.showStatus(`🔄 链接重定向，请尝试直接链接`, '#e67e22');
        btn.disabled = false;
        btn.textContent = '⬇ 下载';
      } else {
        this.showStatus(`❌ 下载失败: ${data.error}`, '#e74c3c');
        btn.disabled = false;
        btn.textContent = '⬇ 下载';
      }
    } catch (e) {
      this.showStatus(`❌ 网络错误: ${e.message}`, '#e74c3c');
      btn.disabled = false;
      btn.textContent = '⬇ 下载';
    }
  },

  showStatus(msg, color) {
    const el = document.getElementById('rr-dl-status');
    if (el) {
      el.textContent = msg;
      el.style.color = color || 'var(--text3)';
    }
  },

  hide() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  },
};
