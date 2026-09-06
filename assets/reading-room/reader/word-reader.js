// Word Reader using mammoth.js
const WordReader = {
  container: null,
  fileUrl: null,
  fileName: null,
  htmlContent: '',
  fontSize: 16,
  fontFamily: 'system-ui',
  lineHeight: 1.8,
  theme: 'white',
  onClose: null,

  themes: {
    white: { bg: '#ffffff', color: '#333333', name: '白底' },
    sepia: { bg: '#f5f0e8', color: '#5a4632', name: '米黄护眼' },
    dark: { bg: '#1a1a1a', color: '#cccccc', name: '深色夜间' },
  },

  async open(fileUrl, fileName, onClose) {
    this.fileUrl = fileUrl;
    this.fileName = fileName;
    this.onClose = onClose;
    this.fontSize = 16;

    this.renderUI();
    await this.loadDocx();
  },

  renderUI() {
    const existing = document.querySelector('.rr-reader-container');
    if (existing) existing.remove();

    this.container = document.createElement('div');
    this.container.className = 'rr-reader-container';
    this.container.style.setProperty('--reader-bg', '#ffffff');

    this.container.innerHTML = `
      <div class="rr-reader-toolbar">
        <button class="rr-rt-btn" id="rr-wrd-back">← 返回</button>
        <span style="font-weight:600;font-size:13px;color:var(--text)">${this.fileName}</span>
        <span style="flex:1"></span>
        <span style="font-size:11px;color:var(--text3)">字号</span>
        <button class="rr-rt-btn" id="rr-wrd-font-down">A-</button>
        <button class="rr-rt-btn" id="rr-wrd-font-up">A+</button>
        <select id="rr-wrd-font-select">
          <option value="system-ui">系统默认</option>
          <option value='"Noto Serif SC", serif'>宋体</option>
          <option value='"STKaiti", serif'>楷体</option>
          <option value='"Microsoft YaHei", sans-serif'>黑体</option>
        </select>
        <span style="font-size:11px;color:var(--text3)">主题</span>
        <button class="rr-rt-btn active" data-theme="white">白底</button>
        <button class="rr-rt-btn" data-theme="sepia">护眼</button>
        <button class="rr-rt-btn" data-theme="dark">夜间</button>
        <select id="rr-wrd-line-height">
          <option value="1.4">1.4</option>
          <option value="1.6">1.6</option>
          <option value="1.8" selected>1.8</option>
          <option value="2.0">2.0</option>
        </select>
      </div>
      <div class="rr-reader-body" id="rr-wrd-body">
        <div id="rr-wrd-content" style="max-width:800px;margin:0 auto;font-size:16px;line-height:1.8">
          <div class="loading" style="padding:40px;text-align:center">加载文档中...</div>
        </div>
      </div>
    `;

    document.body.appendChild(this.container);
    this.bindEvents();
  },

  async loadDocx() {
    try {
      const response = await fetch(this.fileUrl);
      const arrayBuffer = await response.arrayBuffer();

      const result = await mammoth.convertToHtml({ arrayBuffer });

      if (result.messages && result.messages.length > 0) {
        console.log('mammoth messages:', result.messages);
      }

      this.htmlContent = result.value;
      document.getElementById('rr-wrd-content').innerHTML = this.htmlContent;
    } catch (e) {
      document.getElementById('rr-wrd-content').innerHTML =
        `<div style="padding:40px;text-align:center;color:#e74c3c">❌ 文档加载失败: ${e.message}</div>`;
    }
  },

  bindEvents() {
    document.getElementById('rr-wrd-back').onclick = () => {
      this.container.remove();
      if (this.onClose) this.onClose();
    };

    document.getElementById('rr-wrd-font-down').onclick = () => {
      if (this.fontSize > 12) {
        this.fontSize -= 2;
        document.getElementById('rr-wrd-content').style.fontSize = this.fontSize + 'px';
      }
    };

    document.getElementById('rr-wrd-font-up').onclick = () => {
      if (this.fontSize < 32) {
        this.fontSize += 2;
        document.getElementById('rr-wrd-content').style.fontSize = this.fontSize + 'px';
      }
    };

    document.getElementById('rr-wrd-font-select').onchange = (e) => {
      this.fontFamily = e.target.value;
      document.getElementById('rr-wrd-content').style.fontFamily = this.fontFamily;
    };

    document.querySelectorAll('#rr-wrd-toolbar [data-theme], .rr-reader-toolbar [data-theme]').forEach(btn => {
      btn.onclick = () => {
        const theme = btn.dataset.theme;
        this.theme = theme;
        const t = this.themes[theme];
        if (t) {
          this.container.style.setProperty('--reader-bg', t.bg);
          document.getElementById('rr-wrd-body').style.background = t.bg;
          document.getElementById('rr-wrd-body').style.color = t.color;
        }
        document.querySelectorAll('[data-theme]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });

    document.getElementById('rr-wrd-line-height').onchange = (e) => {
      this.lineHeight = parseFloat(e.target.value);
      document.getElementById('rr-wrd-content').style.lineHeight = this.lineHeight;
    };

    document.addEventListener('keydown', this._keyHandler = (e) => {
      if (!this.container || !this.container.isConnected) {
        document.removeEventListener('keydown', this._keyHandler);
        return;
      }
      if (e.key === 'Escape') {
        this.container.remove();
        if (this.onClose) this.onClose();
      }
    });
  },
};
