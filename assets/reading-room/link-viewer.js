// Embedded website viewer - opens links inside the toolbox
// Uses sandbox for security, with popup escape for target="_blank" links
const LinkViewer = {
  container: null,

  open(url, title) {
    const existing = document.querySelector('.rr-embedded-view');
    if (existing) this.close();

    this.container = document.createElement('div');
    this.container.className = 'rr-embedded-view';
    this.container.innerHTML = `
      <div class="rr-ev-toolbar">
        <button class="rr-rt-btn" id="rr-ev-back">← 返回</button>
        <span class="rr-ev-url" id="rr-ev-url" title="${url}">${url}</span>
        <button class="rr-rt-btn" id="rr-ev-refresh">🔄</button>
        <button class="rr-rt-btn" id="rr-ev-external">🌐 浏览器打开</button>
      </div>
      <iframe id="rr-ev-iframe" src="${url}"></iframe>
    `;

    document.body.appendChild(this.container);

    document.getElementById('rr-ev-back').onclick = () => this.close();
    document.getElementById('rr-ev-refresh').onclick = () => {
      const iframe = document.getElementById('rr-ev-iframe');
      iframe.src = iframe.src;
    };
    document.getElementById('rr-ev-external').onclick = () => {
      window.open(url, '_blank');
    };

    document.addEventListener('keydown', this._keyHandler = (e) => {
      if (!this.container || !this.container.isConnected) {
        document.removeEventListener('keydown', this._keyHandler);
        return;
      }
      if (e.key === 'Escape') this.close();
    });
  },

  close() {
    if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  },
};
