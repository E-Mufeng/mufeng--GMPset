// PDF Reader using PDF.js
const PDFReader = {
  container: null,
  pdfDoc: null,
  currentPage: 1,
  totalPages: 0,
  scale: 1.0,
  fileName: '',
  fileUrl: '',
  isSlideshow: false,
  slideshowTimer: null,
  onClose: null,

  async open(fileUrl, fileName, onClose) {
    this.fileUrl = fileUrl;
    this.fileName = fileName;
    this.onClose = onClose;
    this.currentPage = 1;
    this.scale = 1.0;

    this.renderUI();
    await this.loadPDF();
  },

  renderUI() {
    const existing = document.querySelector('.rr-pdf-viewer');
    if (existing) existing.remove();

    this.container = document.createElement('div');
    this.container.className = 'rr-pdf-viewer';
    this.container.innerHTML = `
      <div class="rr-reader-toolbar" style="background:#333">
        <button class="rr-rt-btn" id="rr-pdf-back" style="color:#fff;border-color:#555">← 返回</button>
        <span style="color:#fff;font-weight:600;font-size:13px">${this.fileName}</span>
        <span style="flex:1"></span>
        <button class="rr-rt-btn" id="rr-pdf-zoom-out" style="color:#fff;border-color:#555">🔍-</button>
        <span id="rr-pdf-zoom-lbl" style="color:#fff;font-size:12px">100%</span>
        <button class="rr-rt-btn" id="rr-pdf-zoom-in" style="color:#fff;border-color:#555">🔍+</button>
        <span style="color:#666">|</span>
        <button class="rr-rt-btn" id="rr-pdf-prev" style="color:#fff;border-color:#555">◀</button>
        <span id="rr-pdf-page-info" style="color:#fff;font-size:12px">- / -</span>
        <button class="rr-rt-btn" id="rr-pdf-next" style="color:#fff;border-color:#555">▶</button>
        <span style="color:#666">|</span>
        <button class="rr-rt-btn" id="rr-pdf-slideshow" style="color:#fff;border-color:#555">📽 幻灯片</button>
      </div>
      <div class="rr-pdf-canvas-area" id="rr-pdf-canvas-area">
        <canvas id="rr-pdf-canvas"></canvas>
      </div>
    `;

    document.body.appendChild(this.container);

    document.getElementById('rr-pdf-back').onclick = () => this.close();
    document.getElementById('rr-pdf-prev').onclick = () => this.goToPage(this.currentPage - 1);
    document.getElementById('rr-pdf-next').onclick = () => this.goToPage(this.currentPage + 1);
    document.getElementById('rr-pdf-zoom-in').onclick = () => {
      this.scale = Math.min(this.scale + 0.25, 3.0);
      this.renderPDF();
    };
    document.getElementById('rr-pdf-zoom-out').onclick = () => {
      this.scale = Math.max(this.scale - 0.25, 0.5);
      this.renderPDF();
    };
    document.getElementById('rr-pdf-slideshow').onclick = () => this.toggleSlideshow();

    // Keyboard
    document.addEventListener('keydown', this._keyHandler = (e) => {
      if (!this.container || !this.container.isConnected) {
        document.removeEventListener('keydown', this._keyHandler);
        return;
      }
      if (e.key === 'Escape') {
        if (this.isSlideshow) this.stopSlideshow(false);
        else this.close();
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this.goToPage(this.currentPage + 1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') this.goToPage(this.currentPage - 1);
    });
  },

  async loadPDF() {
    try {
      const loadingTask = pdfjsLib.getDocument(this.fileUrl);
      this.pdfDoc = await loadingTask.promise;
      this.totalPages = this.pdfDoc.numPages;
      document.getElementById('rr-pdf-page-info').textContent = `${this.currentPage} / ${this.totalPages}`;
      document.getElementById('rr-pdf-zoom-lbl').textContent = `${Math.round(this.scale * 100)}%`;
      this.renderPDF();
    } catch (e) {
      console.error('Failed to load PDF:', e);
      document.getElementById('rr-pdf-canvas-area').innerHTML =
        '<div style="color:#fff;padding:40px;text-align:center">❌ PDF 加载失败<br><span style="font-size:12px;opacity:0.6">' + e.message + '</span></div>';
    }
  },

  async renderPDF() {
    if (!this.pdfDoc) return;
    const canvas = document.getElementById('rr-pdf-canvas');
    const ctx = canvas.getContext('2d');

    try {
      const page = await this.pdfDoc.getPage(this.currentPage);
      const viewport = page.getViewport({ scale: this.scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderContext = { canvasContext: ctx, viewport };
      await page.render(renderContext).promise;

      document.getElementById('rr-pdf-page-info').textContent = `${this.currentPage} / ${this.totalPages}`;
      document.getElementById('rr-pdf-zoom-lbl').textContent = `${Math.round(this.scale * 100)}%`;
    } catch (e) {
      console.error('Render error:', e);
    }
  },

  goToPage(n) {
    if (n < 1 || n > this.totalPages) return;
    this.currentPage = n;
    this.renderPDF();
  },

  toggleSlideshow() {
    if (this.isSlideshow) {
      this.stopSlideshow();
    } else {
      this.startSlideshow();
    }
  },

  startSlideshow() {
    this.isSlideshow = true;
    document.getElementById('rr-pdf-slideshow').textContent = '⏹ 停止';

    // Enter fullscreen
    const area = document.getElementById('rr-pdf-canvas-area');
    if (area.requestFullscreen) area.requestFullscreen();

    this.slideshowTimer = setInterval(() => {
      if (this.currentPage >= this.totalPages) {
        this.stopSlideshow();
        return;
      }
      this.goToPage(this.currentPage + 1);
    }, 5000);
  },

  stopSlideshow(closeFS = true) {
    this.isSlideshow = false;
    if (this.slideshowTimer) {
      clearInterval(this.slideshowTimer);
      this.slideshowTimer = null;
    }
    document.getElementById('rr-pdf-slideshow').textContent = '📽 幻灯片';
    if (closeFS && document.fullscreenElement) {
      document.exitFullscreen();
    }
  },

  close() {
    if (this.isSlideshow) this.stopSlideshow();
    if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
    this.container.remove();
    if (this.onClose) this.onClose();
  },
};
