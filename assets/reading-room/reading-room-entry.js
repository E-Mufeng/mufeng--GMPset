// Reading Room main page
const readingRoom = {
  currentCategory: null,

  async init() {
    // Load categories and render sidebar + default view
    try {
      const res = await fetch('/api/reading-room/categories');
      const data = await res.json();
      if (!data.ok) throw new Error('Failed to load');

      this.renderSidebar(data.categories);

      // Show first category
      if (data.categories.length > 0) {
        this.switchCategory(data.categories[0].id);
      }
    } catch (e) {
      document.getElementById('rr-content-area').innerHTML =
        `<div class="rr-empty"><div class="rr-empty-icon">❌</div>加载失败: ${e.message}</div>`;
    }
  },

  renderSidebar(categories) {
    const sidebar = document.getElementById('rr-category-nav');
    if (!sidebar) return;

    sidebar.innerHTML = '';

    // Bookshelf section
    const bsTitle = document.createElement('div');
    bsTitle.className = 'rr-section-title';
    bsTitle.textContent = '书架';
    sidebar.appendChild(bsTitle);

    // Bookshelf nav item
    const bookshelfItem = document.createElement('div');
    bookshelfItem.className = 'rr-nav-item';
    bookshelfItem.dataset.id = '__bookshelf__';
    bookshelfItem.innerHTML = '<span class="rr-nav-icon">📚</span><span>我的书架</span>';
    bookshelfItem.addEventListener('click', () => this.showBookshelf());
    sidebar.appendChild(bookshelfItem);

    // Import nav item
    const importItem = document.createElement('div');
    importItem.className = 'rr-nav-item';
    importItem.innerHTML = '<span class="rr-nav-icon">📥</span><span>导入小说</span>';
    importItem.addEventListener('click', () => {
      if (window.Bookshelf) {
        Bookshelf.showImport();
      }
    });
    sidebar.appendChild(importItem);

    // Separator
    const separator = document.createElement('div');
    separator.style.cssText = 'height:1px;background:var(--border);margin:8px 12px';
    sidebar.appendChild(separator);

    // Category section
    const title = document.createElement('div');
    title.className = 'rr-section-title';
    title.textContent = '阅读分类';
    sidebar.appendChild(title);

    categories.forEach(cat => {
      const item = document.createElement('div');
      item.className = 'rr-nav-item';
      item.dataset.id = cat.id;
      item.innerHTML = `<span class="rr-nav-icon">${cat.icon || '📁'}</span><span>${cat.name}</span>`;
      item.addEventListener('click', () => this.switchCategory(cat.id));
      sidebar.appendChild(item);
    });

    // Add category button
    const addBtn = document.createElement('div');
    addBtn.className = 'rr-add-cat';
    addBtn.textContent = '+ 添加分类';
    addBtn.addEventListener('click', () => {
      CategoryEditor.show(null, () => this.init());
    });
    sidebar.appendChild(addBtn);
  },

  showBookshelf() {
    // Update active state - remove all active
    document.querySelectorAll('.rr-nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === '__bookshelf__');
    });

    if (window.Bookshelf) {
      Bookshelf.show();
    }
  },

  switchCategory(catId) {
    this.currentCategory = catId;

    // Update active state
    document.querySelectorAll('.rr-nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === catId);
    });

    CategoryView.render(catId);
  },

  refreshFiles(categoryId) {
    if (categoryId === this.currentCategory) {
      CategoryView.refresh();
    }
  },
};

// Initialize when page is shown
document.addEventListener('DOMContentLoaded', () => {
  // Will be triggered by page-switch event
});

// Expose for other modules
window.readingRoom = readingRoom;
