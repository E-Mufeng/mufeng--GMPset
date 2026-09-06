// ═══════════════════════════════════════════════════════════════
// 写作工作台 — 完整重建
// 功能：项目管理 / 章节编辑器（格式工具栏+AI面板） / 角色 / 笔记 / 大纲 / 设置
// 所有API通过 /api/writing/* 与后端通信
// ═══════════════════════════════════════════════════════════════

const writingManager = {
  _project: null, _chapters: [], _characters: [], _notes: [],
  _prompts: [], _models: [], _styles: [],
  _activeChapter: null, _lastGenerated: null,
  _autoSaveTimer: null, _sessionSec: 0, _timer: null,
  _selectedChars: new Set(),
  _editMode: 'edit', // 'edit' | 'preview'

  // ─── 工具方法 ───

  api(method, url, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);
    return fetch(url, opts)
      .then(r => r.json())
      .then(d => {
        if (d.success !== undefined) {
          return d.success ? (d.data !== undefined ? d.data : d) : (console.error('API Error:', d.error), []);
        }
        return d;
      })
      .catch(e => { console.error('API Error:', e); return []; });
  },

  _esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  _nl2br(s) {
    return this._esc(String(s)).replace(/\n/g, '<br>');
  },

  // ─── 初始化入口（sidebar.js 调用） ───

  init() {
    this.renderHome();
  },

  applyTheme(theme) {
    // no-op: theme handled by global CSS
  },

  // ═══════════════════════════════════════════════════════════════
  // 首页
  // ═══════════════════════════════════════════════════════════════

  renderHome() {
    const area = document.getElementById('writing-content');
    if (!area) return;
    area.innerHTML = `
<div style="padding:14px 20px;max-width:1100px;margin:0 auto">
  <!-- 顶栏 -->
  <div class="wr-home-header">
    <span class="wr-home-title">✍️ 写作工作台</span>
    <button class="btn btn-sm" id="wr-new-proj">+ 新项目</button>
    <button class="btn btn-sm btn-ghost" id="wr-toolbox-btn">🎨 创意工具箱</button>
    <button class="btn btn-sm btn-ghost" id="wr-prompts-btn">📚 提示词库</button>
    <span style="flex:1"></span>
    <span id="wr-home-stats" style="font-size:10px;color:var(--text3)">加载中...</span>
  </div>
  <!-- 统计卡片 -->
  <div id="wr-home-dashboard" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:12px"></div>
  <!-- AI 写作引擎 v2 面板 -->
  <div class="wr-engine-section">
    <div class="wr-engine-title">🤖 AI 写作引擎 v2
      <span id="wr-engine-version" style="font-size:10px;color:var(--text3);margin-left:8px"></span>
      <span style="font-size:10px;color:var(--text3);margin-left:6px;cursor:pointer" id="wr-engine-settings-toggle" title="展开/收起高级设置">⚙️</span>
    </div>
    <div id="wr-engine-panel">
      <div class="wr-ai-row">
        <select id="wr-engine-project" class="tool-input" style="flex:2;min-width:140px;font-size:11px"><option value="">📁 选择项目（可选）</option></select>
        <select id="wr-engine-model" class="tool-input" style="flex:1;min-width:80px;font-size:11px"></select>
      </div>
      <div id="wr-engine-advanced" style="display:none">
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
          <select id="wr-engine-style" class="tool-input" style="flex:1;min-width:100px;font-size:11px"><option value="">🎨 风格</option></select>
          <select id="wr-engine-genre" class="tool-input" style="flex:1;min-width:80px;font-size:11px">
            <option value="">📖 类型</option>
            <option value="都市">都市</option><option value="玄幻">玄幻</option><option value="仙侠">仙侠</option>
            <option value="科幻">科幻</option><option value="悬疑">悬疑</option><option value="言情">言情</option>
            <option value="奇幻">奇幻</option><option value="历史">历史</option><option value="轻小说">轻小说</option>
          </select>
          <input type="number" id="wr-engine-words" class="tool-input" style="flex:0.5;min-width:65px;font-size:11px" placeholder="字数" min="200" max="8000">
          <input type="number" id="wr-engine-chapters" class="tool-input" style="flex:0.3;min-width:50px;font-size:11px" placeholder="章节" min="1" max="20" value="1">
          <label style="font-size:9px;display:inline-flex;align-items:center;gap:2px;white-space:nowrap">
            <input type="checkbox" id="wr-engine-dual" title="生成两个不同温度版本供挑选">🎲
          </label>
          <input type="text" id="wr-engine-requirements" class="tool-input" style="flex:2;min-width:140px;font-size:11px" placeholder="额外要求（选填）">
        </div>
        <div id="wr-engine-chars" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;min-height:24px">
          <span style="font-size:10px;color:var(--text3);line-height:22px">👤 角色：</span>
          <span style="font-size:10px;color:var(--text4);line-height:22px">选择项目后显示</span>
        </div>
        <div id="wr-engine-context" style="display:none;margin-bottom:6px;font-size:10px;color:var(--text2);background:var(--bg);border-radius:6px;padding:6px 8px;line-height:1.6"></div>
        <div id="wr-engine-scene" style="display:none;margin-bottom:6px;font-size:10px;color:var(--text2);background:var(--bg);border-radius:6px;padding:6px 8px"></div>
      </div>
      <textarea id="wr-engine-plot" class="tool-textarea" style="width:100%;height:54px;font-size:12px;margin-bottom:6px;resize:vertical" placeholder="本章剧情（必填）：主角去食堂发现室友被欺负、主角和张警官去密室调查..." maxlength="500"></textarea>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <button class="btn" id="wr-engine-gen" style="font-size:12px;padding:4px 16px">✨ 引擎生成</button>
        <span id="wr-engine-status" style="font-size:10px;color:var(--text3)"></span>
        <span style="flex:1"></span>
        <span id="wr-engine-diversity" style="font-size:10px;color:var(--text3)"></span>
      </div>
      <div id="wr-engine-budget" style="display:none;margin-top:4px;font-size:10px;color:var(--text2)">
        <span>🧠 思考预算:</span>
        <input type="range" id="wr-thinking-budget" min="128" max="32768" value="16384" step="1024" style="width:160px;height:4px;vertical-align:middle">
        <span id="wr-budget-val">16384</span>
      </div>
    </div>
    <div id="wr-engine-result" style="margin-top:8px;display:none"></div>
  </div>
  <!-- 项目网格 -->
  <div id="wr-projects-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px"></div>
</div>`;

    // 绑定事件
    const $ = id => document.getElementById(id);
    $('wr-new-proj').onclick = () => this.showNewProject();
    $('wr-toolbox-btn').onclick = () => this.showCreativeToolbox();
    $('wr-prompts-btn').onclick = () => this.showPromptLibrary();
    $('wr-engine-gen').onclick = () => this.engineGenerate();
    $('wr-engine-settings-toggle').onclick = () => {
      const adv = $('wr-engine-advanced');
      adv.style.display = adv.style.display === 'none' ? 'block' : 'none';
    };

    // 项目切换
    $('wr-engine-project').onchange = () => this.onProjectChange($('wr-engine-project').value);

    // 模型切换
    $('wr-engine-model').onchange = () => this.onEngineModelChange($('wr-engine-model').value);

    // 思考预算滑块
    const s = $('wr-thinking-budget'), v = $('wr-budget-val');
    if (s && v) s.oninput = () => { v.textContent = s.value; };

    this.renderHomeDashboard();
    this.loadHomeData();
  },

  async loadHomeData() {
    await Promise.all([
      this.loadProjects(),
      this.loadQuickPrompts(),
      this.loadModels(),
      this.loadStyles()
    ]);
    const ver = document.getElementById('wr-engine-version');
    if (ver) ver.textContent = 'v2 · 自动上下文+知识库+多样性';
  },

  async renderHomeDashboard() {
    const el = document.getElementById('wr-home-dashboard');
    if (!el) return;
    el.innerHTML = '<div style="grid-column:1/-1;padding:10px;text-align:center;color:var(--text3);font-size:10px">正在加载...</div>';
    try {
      const r = await this.api('GET', '/api/writing/projects');
      if (!r || !r.length) { el.innerHTML = ''; return; }
      let tw = 0, tc = 0, tp = r.length;
      r.forEach(p => { tw += p.wordCount || 0; tc += p.chapterCount || 0; });
      el.innerHTML = [
        '<div style="padding:8px;text-align:center;background:var(--bg3);border-radius:8px"><div style="font-size:22px;font-weight:700">' + tw.toLocaleString() + '</div><div style="font-size:10px;color:var(--text3)">总字数</div></div>',
        '<div style="padding:8px;text-align:center;background:var(--bg3);border-radius:8px"><div style="font-size:22px;font-weight:700">' + tc + '</div><div style="font-size:10px;color:var(--text3)">章节数</div></div>',
        '<div style="padding:8px;text-align:center;background:var(--bg3);border-radius:8px"><div style="font-size:22px;font-weight:700">' + tp + '</div><div style="font-size:10px;color:var(--text3)">项目数</div></div>'
      ].join('');
    } catch (e) { el.innerHTML = ''; }
  },

  // ─── 项目列表 ───

  async loadProjects() {
    const grid = document.getElementById('wr-projects-grid');
    const stats = document.getElementById('wr-home-stats');
    const engProj = document.getElementById('wr-engine-project');
    if (!grid) return;
    try {
      const projs = await this.api('GET', '/api/writing/projects');
      this._projects = projs || [];
      const totalWords = (projs || []).reduce((s, p) => s + (p.wordCount || 0), 0);
      if (stats) stats.textContent = '📊 ' + projs.length + ' 个项目 · ' + totalWords.toLocaleString() + ' 字';

      // 引擎下拉
      if (engProj) {
        const curVal = engProj.value;
        engProj.innerHTML = '<option value="">📁 选择项目（可选）</option>';
        (projs || []).forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id; opt.textContent = p.name + ' (' + (p.chapterCount || 0) + '章)';
          engProj.appendChild(opt);
        });
        if (curVal) engProj.value = curVal;
      }

      if (!projs.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px"><div style="font-size:48px;margin-bottom:8px">📝</div><div style="font-size:14px;color:var(--text3)">暂无项目，点击"+ 新项目"开始创作</div></div>';
        return;
      }
      grid.innerHTML = projs.map(p =>
        '<div class="wr-project-card" data-id="' + p.id + '">' +
          '<div class="wr-card-category">' + (p.category === 'script' ? '🎬 剧本' : '📖 小说') + '</div>' +
          '<div class="wr-card-title">' + this._esc(p.name) + '</div>' +
          '<div class="wr-card-desc">' + this._esc(p.description || '无描述') + '</div>' +
          '<div class="wr-card-stats">' +
            '<span>📄 ' + (p.chapterCount || 0) + '章</span>' +
            '<span>✍️ ' + (p.wordCount || 0).toLocaleString() + '字</span>' +
            '<span>👤 ' + (p.charCount || 0) + '人</span>' +
          '</div>' +
          '<div class="wr-card-actions">' +
            '<button class="btn btn-sm wr-enter-btn" data-idx="' + projs.indexOf(p) + '">✏️ 写作</button>' +
            '<button class="btn btn-sm btn-ghost wr-mgmt-btn" data-idx="' + projs.indexOf(p) + '">管理</button>' +
          '</div>' +
        '</div>'
      ).join('');
      grid.querySelectorAll('.wr-enter-btn').forEach(btn => {
        btn.onclick = e => { e.stopPropagation(); this.openProject(projs[parseInt(btn.dataset.idx)].id); };
      });
      grid.querySelectorAll('.wr-mgmt-btn').forEach(btn => {
        btn.onclick = e => { e.stopPropagation(); this.openProjectMgmt(projs[parseInt(btn.dataset.idx)].id); };
      });
    } catch (e) {
      if (stats) stats.textContent = '加载失败';
    }
  },

  showNewProject() {
    const name = prompt('项目名称：');
    if (!name) return;
    const desc = prompt('项目描述（可选）：') || '';
    const cat = confirm('点击确定=小说，取消=剧本') ? 'novel' : 'script';
    this.api('POST', '/api/writing/project', { name, desc, type: cat }).then(() => this.loadProjects());
  },

  async deleteProject(id) {
    if (!confirm('确定删除此项目？此操作不可撤销！')) return;
    await this.api('DELETE', '/api/writing/project/' + id);
    this.loadProjects();
  },

  // ─── AI 引擎 ───

  async loadModels() {
    try {
      // 仅加载 Ollama 本地模型（已暂停云端 API 调用）
      const ollamaStatus = await this.api('GET', '/api/writing/ollama/status');
      if (ollamaStatus?.data?.available) {
        const models = ollamaStatus.data.models || [];
        this._models = {};
        const sel = document.getElementById('wr-engine-model');
        if (sel) {
          sel.innerHTML = '';
          models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = 'ollama:' + m;
            opt.textContent = '🦙 ' + m;
            sel.appendChild(opt);
          });
          if (models.length === 0) {
            const opt = document.createElement('option');
            opt.value = ''; opt.textContent = 'Ollama 无可用模型';
            sel.appendChild(opt);
          }
        }
      } else {
        const sel = document.getElementById('wr-engine-model');
        if (sel) {
          sel.innerHTML = '<option value="">⚠️ Ollama 未运行，请先启动 Ollama</option>';
        }
      }
    } catch (e) { console.error('loadModels error:', e); }
  },

  async loadStyles() {
    try {
      const s = await this.api('GET', '/api/writing/ai/styles');
      if (Array.isArray(s)) {
        this._styles = s;
        const sel = document.getElementById('wr-engine-style');
        if (sel) {
          sel.innerHTML = '<option value="">🎨 风格</option>';
          s.forEach(st => {
            const opt = document.createElement('option');
            opt.value = st.id; opt.textContent = st.name;
            if (st.desc) opt.title = st.desc;
            sel.appendChild(opt);
          });
        }
      }
    } catch (e) { console.error('loadStyles error:', e); }
  },

  async loadQuickPrompts() {
    try {
      const r = await this.api('GET', '/api/writing/ai/prompts');
      this._prompts = r.prompts || [];
    } catch (e) {}
  },

  onEngineModelChange(model) {
    const budgetArea = document.getElementById('wr-engine-budget');
    if (budgetArea) budgetArea.style.display = model === 'thinker' ? 'block' : 'none';
    const s = document.getElementById('wr-thinking-budget');
    const v = document.getElementById('wr-budget-val');
    if (s && v) s.oninput = () => { v.textContent = s.value; };
  },

  onProjectChange(projectId) {
    if (!projectId) {
      const charsDiv = document.getElementById('wr-engine-chars');
      const ctxDiv = document.getElementById('wr-engine-context');
      const scDiv = document.getElementById('wr-engine-scene');
      if (charsDiv) charsDiv.innerHTML = '<span style="font-size:10px;color:var(--text3);line-height:22px">👤 角色：</span><span style="font-size:10px;color:var(--text4);line-height:22px">选择项目后显示</span>';
      if (ctxDiv) ctxDiv.style.display = 'none';
      if (scDiv) scDiv.style.display = 'none';
      return;
    }
    // 加载角色
    this.api('GET', '/api/writing/characters/' + projectId).then(chars => {
      const div = document.getElementById('wr-engine-chars');
      if (!div) return;
      const arr = Array.isArray(chars) ? chars : [];
      if (!arr.length) {
        div.innerHTML = '<span style="font-size:10px;color:var(--text3);line-height:22px">👤 角色：</span><span style="font-size:10px;color:var(--text4);line-height:22px">暂无角色</span>';
        return;
      }
      div.innerHTML = '<span style="font-size:10px;color:var(--text3);line-height:22px">👤 角色：</span>' +
        arr.map(c => '<label style="font-size:10px;display:inline-flex;align-items:center;gap:2px;margin-right:4px">' +
          '<input type="checkbox" class="wr-char-check" value="' + c.id + '">' + this._esc(c.name) +
          '</label>').join('');
    });
    this.loadProjectContext(projectId);
  },

  async loadProjectContext(projectId) {
    try {
      const ctxDiv = document.getElementById('wr-engine-context');
      if (!ctxDiv) return;
      const dna = await this.api('GET', '/api/writing/engine/dna/' + projectId);
      let html = [];
      if (dna && dna.totalChapters > 0) {
        html.push('📊 已写 ' + dna.totalChapters + ' 章');
        if (dna.recent && dna.recent.length > 0) {
          html.push('📄 最近：' + dna.recent.map(r => '#' + r.chapter).join(' '));
        }
      }
      if (html.length > 0) {
        ctxDiv.innerHTML = html.join('<br>');
        ctxDiv.style.display = 'block';
      } else {
        ctxDiv.style.display = 'none';
      }
    } catch (e) {}
  },

  async engineGenerate() {
    const plot = document.getElementById('wr-engine-plot')?.value;
    const projectId = document.getElementById('wr-engine-project')?.value;
    const model = document.getElementById('wr-engine-model')?.value || 'atmosphere';
    const style = document.getElementById('wr-engine-style')?.value || undefined;
    const genre = document.getElementById('wr-engine-genre')?.value || undefined;
    const wordCount = parseInt(document.getElementById('wr-engine-words')?.value) || undefined;
    const requirements = document.getElementById('wr-engine-requirements')?.value || undefined;
    const status = document.getElementById('wr-engine-status');
    if (!plot?.trim()) { alert('请输入本章剧情'); return; }

    const charChecks = document.querySelectorAll('.wr-char-check:checked');
    const characters = Array.from(charChecks).map(c => c.value);

    if (status) status.textContent = '⏳ 引擎分析中...';

    // 场景检测预览
    try {
      const scenePreview = await this.api('POST', '/api/writing/engine/detect-scene', { plot, genre });
      const sceneDiv = document.getElementById('wr-engine-scene');
      if (sceneDiv && scenePreview) {
        sceneDiv.innerHTML = '<span>🔍 检测到场景：' + (scenePreview.sceneType || '未知') + '</span>';
        sceneDiv.style.display = 'block';
      }
    } catch (e) {}

    if (status) status.textContent = '⏳ AI 生成中...' + (model === 'thinker' ? '（推理模型可能需要30秒）' : '');

    let worldContext = null;
    if (projectId) {
      try {
        const wr = await this.api('GET', '/api/world/' + projectId);
        if (wr && wr.world) worldContext = wr.world;
      } catch (e) {}
    }

    const r = await this.api('POST', '/api/writing/engine/generate', {
      projectId: projectId || undefined,
      plot,
      characters: characters.length > 0 ? characters : undefined,
      style,
      genre: genre || undefined,
      model,
      chapterCount: parseInt(document.getElementById('wr-engine-chapters')?.value) || 1,
      dualVersion: document.getElementById('wr-engine-dual')?.checked || false,
      thinkingBudget: model === 'thinker' ? parseInt(document.getElementById('wr-thinking-budget')?.value || '16384') : undefined,
      requirements: requirements || undefined,
      wordCount: wordCount || undefined,
      worldContext: worldContext || undefined
    });

    if (r.success) {
      this._lastGenerated = r.content;
      const meta = r.metadata || {};
      const resultDiv = document.getElementById('wr-engine-result');
      if (resultDiv) {
        resultDiv.style.display = 'block';
        const metaParts = [];
        if (meta.persona) metaParts.push('🤖 ' + meta.persona);
        if (meta.sceneType) metaParts.push('📌 ' + meta.sceneType);
        if (meta.usage) metaParts.push('📊 ' + meta.usage.total_tokens + 'tokens');
        resultDiv.innerHTML =
          '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:10px;font-size:12px;line-height:1.7;max-height:350px;overflow-y:auto">' +
            this._nl2br(r.content) +
          '</div>' +
          '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;align-items:center">' +
            '<span style="font-size:10px;color:var(--text3)">' + metaParts.join(' · ') + '</span>' +
            '<span style="flex:1"></span>' +
            '<button class="btn btn-sm" onclick="writingManager.engineGenerate()">⟳ 重新生成</button>' +
            '<button class="btn btn-sm btn-ghost" onclick="writingManager.upgradeConflict()">⚡ 冲突升级</button>' +
            '<button class="btn btn-sm btn-ghost" onclick="writingManager.polishAI()">✨ 去AI味</button>' +
            '<button class="btn btn-sm btn-ghost" onclick="writingManager.betaReadResult()">📖 检查</button>' +
            '<button class="btn btn-sm btn-ghost" onclick="writingManager.copyToClipboard()">📋 复制</button>' +
            '<button class="btn btn-sm btn-ghost" onclick="this.parentElement.parentElement.style.display=\'none\'">✕</button>' +
          '</div>' +
          '<div id="wr-beta-read-result" style="margin-top:4px"></div>';
      }
      if (projectId) { this.loadProjectContext(projectId); this.loadProjects(); }
      if (status) status.textContent = '✅ 生成完成';
    } else {
      if (status) status.textContent = '❌ 失败';
      const resultDiv = document.getElementById('wr-engine-result');
      if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<div style="padding:10px;color:var(--red);font-size:12px">❌ 生成失败: ' + (r.error || '未知错误') + '</div>';
      }
    }
  },

  // ─── 快捷AI工作流 ───

  async upgradeConflict() {
    const text = this._lastGenerated;
    if (!text) { alert('请先生成内容'); return; }
    const r = await this.api('POST', '/api/writing/ai/upgrade-conflict', { text });
    if (r.success) {
      this._lastGenerated = r.content;
      this._showQuickResult(r.content, '⚡ 冲突升级完成');
    }
  },

  async polishAI() {
    const text = this._lastGenerated;
    if (!text) { alert('请先生成内容'); return; }
    const r = await this.api('POST', '/api/writing/ai/polish-ai', { text });
    if (r.success) {
      this._lastGenerated = r.content;
      this._showQuickResult(r.content, '✨ 润色完成');
    }
  },

  _showQuickResult(content, label) {
    const resultDiv = document.getElementById('wr-engine-result');
    if (!resultDiv) return;
    resultDiv.style.display = 'block';
    resultDiv.innerHTML =
      '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:10px;font-size:12px;line-height:1.7;max-height:350px;overflow-y:auto">' +
        this._nl2br(content) +
      '</div>' +
      '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;align-items:center">' +
        '<span style="font-size:10px;color:var(--text3)">' + label + '</span>' +
        '<button class="btn btn-sm btn-ghost" onclick="this.parentElement.parentElement.style.display=\'none\'">✕</button>' +
      '</div>';
  },

  async betaReadResult() {
    const text = this._lastGenerated;
    if (!text) { alert('没有内容可检查'); return; }
    const div = document.getElementById('wr-beta-read-result');
    if (!div) return;
    const wordCount = text.length;
    const paraCount = text.split('\n').filter(l => l.trim()).length;
    div.innerHTML = '<span style="font-size:10px;color:var(--text3)">📖 字数：' + wordCount + ' | 段落：' + paraCount + '</span>';
  },

  copyToClipboard() {
    if (this._lastGenerated) {
      navigator.clipboard.writeText(this._lastGenerated).then(() => {});
    }
  },
  _toggleFindReplace() {
    const bar = document.getElementById('wr-find-bar');
    if (!bar) return;
    bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
    if (bar.style.display === 'flex') {
      const inp = document.getElementById('wr-find-input');
      if (inp) { inp.focus(); inp.select(); }
    }
  },

  _doFind(dir) {
    const ta = document.getElementById('wr-editor');
    const inp = document.getElementById('wr-find-input');
    const countEl = document.getElementById('wr-find-count');
    if (!ta || !inp) return;
    const q = inp.value;
    if (!q) { if (countEl) countEl.textContent = '0/0'; return; }
    const caseSens = document.getElementById('wr-find-case')?.classList.contains('active') || false;
    const text = ta.value;
    const flags = caseSens ? 'g' : 'gi';
    var matches = [];
    try {
      // Simple search - escape regex chars
      const escQ = q.replace(/[.*+?^${}()|[\]\\]/g, function(m) { return '\\' + m; });
      var re = new RegExp(escQ, flags);
      var m;
      while ((m = re.exec(text)) !== null) {
        matches.push(m);
      }
    } catch(e) {}
    const total = matches.length;
    let current = 0;
    if (total > 0) {
      const cursor = ta.selectionStart;
      if (dir === 'next') {
        for (let i = 0; i < matches.length; i++) {
          if (matches[i].index > cursor) { current = i; break; }
          if (i === matches.length - 1) current = 0;
        }
      } else {
        for (let i = matches.length - 1; i >= 0; i--) {
          if (matches[i].index < cursor) { current = i; break; }
          if (i === 0) current = matches.length - 1;
        }
      }
      const idx = matches[current].index;
      ta.focus();
      ta.setSelectionRange(idx, idx + q.length);
      // Scroll to ensure visible
      const lineHeight = parseInt(getComputedStyle(ta).lineHeight) || 24;
      const linesBefore = text.substring(0, idx).split('\n').length - 1;
      ta.scrollTop = Math.max(0, linesBefore * lineHeight - 100);
    }
    if (countEl) countEl.textContent = total > 0 ? (current + 1) + '/' + total : '0/0';
  },

  _replace() {
    const ta = document.getElementById('wr-editor');
    const inp = document.getElementById('wr-find-input');
    const rep = document.getElementById('wr-replace-input');
    if (!ta || !inp || !rep || !inp.value) return;
    const selText = ta.value.substring(ta.selectionStart, ta.selectionEnd);
    if (selText === inp.value) {
      ta.value = ta.value.slice(0, ta.selectionStart) + rep.value + ta.value.slice(ta.selectionEnd);
      this._updateWordCount();
    }
    this._doFind('next');
  },

  _replaceAll() {
    const ta = document.getElementById('wr-editor');
    const inp = document.getElementById('wr-find-input');
    const rep = document.getElementById('wr-replace-input');
    if (!ta || !inp || !rep || !inp.value) return;
    const caseSens = document.getElementById('wr-find-case')?.classList.contains('active') || false;
    const flags = caseSens ? 'g' : 'gi';
    try {
      const escQ = inp.value.replace(/[.*+?^${}()|[\]\\]/g, function(m) { return '\\' + m; });
      ta.value = ta.value.replace(new RegExp(escQ, flags), rep.value);
    } catch(e) {}
    this._updateWordCount();
    this._updateGoalDisplay();
    const countEl = document.getElementById('wr-find-count');
    if (countEl) countEl.textContent = '0/0';
  },

  _toggleChapterSearch() {
    // Create search input dynamically if not in DOM
    let wrapper = document.getElementById('wr-ch-search-wrapper');
    if (!wrapper) {
      // Find the chapter sidebar header and insert search wrapper
      const header = document.querySelector('#wr-chapter-panel > div:first-child');
      if (header) {
        wrapper = document.createElement('div');
        wrapper.id = 'wr-ch-search-wrapper';
        wrapper.style.cssText = 'flex:1;min-width:0;display:none';
        wrapper.innerHTML = '<input type="text" id="wr-ch-search" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:1px 6px;font-size:9px;color:var(--text)" placeholder="搜索章节...">';
        // Insert before the flex:1 spacer
        const spacer = header.querySelector('span[style*="flex:1"]');
        if (spacer) header.insertBefore(wrapper, spacer);
        else header.appendChild(wrapper);
        // Bind search event
        document.getElementById('wr-ch-search').oninput = function() { writingManager._filterChapters(); };
      }
    }
    const search = document.getElementById('wr-ch-search');
    if (!wrapper) return;
    const vis = wrapper.style.display === 'block';
    if (vis) {
      wrapper.style.display = 'none';
      if (search) search.value = '';
      this._renderChapterList(this._chapters);
    } else {
      wrapper.style.display = 'block';
      if (search) { search.value = ''; search.focus(); }
    }
  },

  _filterChapters() {
    const q = document.getElementById('wr-ch-search')?.value?.toLowerCase() || '';
    if (!q) { this._renderChapterList(this._chapters); return; }
    const filtered = this._chapters.filter(function(ch) {
      return (ch.title || '').toLowerCase().includes(q) ||
             (ch.content || '').toLowerCase().includes(q);
    });
    this._renderChapterList(filtered);
  },

  _renderChapterList(chapters) {
    const body = document.getElementById('wr-chapter-panel-body');
    if (!body) return;
    if (!chapters || !chapters.length) {
      body.innerHTML = '<div style="padding:20px;text-align:center;font-size:11px;color:var(--text3)">' +
        (document.getElementById('wr-ch-search')?.value ? '未找到匹配章节' : '暂无章节<br>点击"+\"创建') +
      '</div>';
      return;
    }
    body.innerHTML = chapters.map(function(ch) {
      return '<div class="wr-chapter-card ' + (ch.status || 'draft') + '" data-id="' + ch.id + '">' +
        '<div class="wr-ch-card-title">' + writingManager._esc(ch.title || '第' + (ch.number || 0) + '章') + '</div>' +
        '<div class="wr-ch-card-meta">' +
          (ch.wordCount || (ch.content ? ch.content.length : 0)) + '字 · ' + (ch.status === 'completed' ? '已完成' : ch.status === 'polished' ? '已润色' : '草稿') +
        '</div>' +
        '<div class="wr-ch-card-meta wr-ch-card-actions" style="display:flex;gap:4px;margin-top:3px">' +
          '<button class="wr-ai-btn" onclick="event.stopPropagation();writingManager.deleteChapter(\'' + ch.id + '\')">🗑️</button>' +
          '<button class="wr-ai-btn" onclick="event.stopPropagation();writingManager.renameChapter(\'' + ch.id + '\')">✏️</button>' +
        '</div>' +
      '</div>';
    }).join('');
    body.querySelectorAll('.wr-chapter-card').forEach(function(el) {
      el.onclick = function() { writingManager.loadChapter(el.dataset.id); };
    });
    if (this._activeChapter) {
      const active = body.querySelector('.wr-chapter-card[data-id="' + this._activeChapter.id + '"]');
      if (active) active.classList.add('active');
    }
  },

  _toggleGoal() {
    const current = parseInt(localStorage.getItem('wr_writing_goal') || '0');
    const target = prompt('今日写作目标（字数）：', current || '500');
    if (target === null) return;
    const num = parseInt(target);
    if (!num || num < 0) {
      localStorage.setItem('wr_writing_goal', '0');
      const el = document.getElementById('wr-goal-display');
      if (el) el.style.display = 'none';
    } else {
      localStorage.setItem('wr_writing_goal', String(num));
    }
    this._updateGoalDisplay();
  },

  _updateGoalDisplay() {
    const el = document.getElementById('wr-goal-display');
    const prog = document.getElementById('wr-goal-progress');
    if (!el || !prog) return;
    const goal = parseInt(localStorage.getItem('wr_writing_goal') || '0');
    if (!goal) { el.style.display = 'none'; return; }
    el.style.display = 'inline';
    const ta = document.getElementById('wr-editor');
    const written = ta ? ta.value.trim().length : 0;
    prog.textContent = written + '/' + goal;
    el.title = '进度: ' + Math.min(100, Math.round((written / goal) * 100)) + '% (' + written + '/' + goal + ' 字)';
  },


  // ═══════════════════════════════════════════════════════════════
  // 项目视图 — 章节编辑器
  // ═══════════════════════════════════════════════════════════════

  async openProject(id) {
    this._project = { id };
    const area = document.getElementById('writing-content');
    if (!area) return;

    area.innerHTML = `
<div class="writing-editor-panel" data-project="${id}">
  <!-- 顶栏 -->
  <div class="wr-editor-header">
    <button class="btn btn-sm btn-ghost" id="wr-back-home">← 返回</button>
    <span id="wr-proj-title" class="wr-proj-title">加载中...</span>
    <div class="wr-editor-btn-group">
      <button class="btn btn-sm" id="wr-save-chapter" style="font-size:10px">💾 保存</button>
      <button class="btn btn-sm btn-ghost" id="wr-preview-toggle" style="font-size:10px" title="切换预览">👁️</button>
      <button class="btn btn-sm btn-ghost" id="wr-snap-btn" style="font-size:10px" title="版本快照">📸</button>
      <button class="btn btn-sm btn-ghost" id="wr-predict-btn" style="font-size:10px" title="预测下一章">🔮</button>
      <button class="btn btn-sm btn-ghost" id="wr-focus-toggle" style="font-size:10px" title="专注模式">🎯</button>
    </div>
  </div>
  <!-- 主区域：侧栏 + 编辑器 + AI面板 -->
  <div style="display:flex;flex:1;min-height:0;overflow:hidden">
    <!-- 章节侧栏 -->
    <div class="wr-chapter-sidebar" id="wr-chapter-panel">
      <div class="wr-sidebar-header">
        <span style="font-size:11px;font-weight:600">📖 章节</span>
        <span id="wr-chapter-count" style="font-size:10px;color:var(--text3)"></span>
        <button class="wr-format-btn" id="wr-ch-search-toggle" style="font-size:8px;padding:1px 4px" title="搜索章节">🔍</button>
        <span style="flex:1"></span>
        <button class="btn-icon" id="wr-ch-sidebar-toggle" title="收起/展开侧栏" style="font-size:10px">◀</button>
        <button class="btn btn-sm" id="wr-new-chapter" style="font-size:10px">+</button>
      </div>
      <div id="wr-chapter-panel-body" style="flex:1;overflow-y:auto;padding:4px 0"></div>
      <div id="wr-chapter-context" class="wr-context-panel" style="display:none"></div>
    </div>
    <!-- 编辑器区域 -->
    <div style="flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden" id="wr-editor-area">
      <!-- 格式工具栏 -->
      <div class="wr-format-toolbar" id="wr-format-toolbar">
        <div class="wr-format-group">
          <select class="wr-format-select" id="wr-fmt-block" style="width:80px">
            <option value="p">正文</option><option value="h1">标题1</option><option value="h2">标题2</option>
            <option value="h3">标题3</option><option value="blockquote">引用</option>
          </select>
        </div>
        <div class="wr-format-group">
          <button class="wr-format-btn" data-cmd="bold" title="加粗 Ctrl+B"><b>B</b></button>
          <button class="wr-format-btn" data-cmd="italic" title="斜体 Ctrl+I"><i>I</i></button>
          <button class="wr-format-btn" data-cmd="underline" title="下划线 Ctrl+U"><u>U</u></button>
        </div>
        <div class="wr-format-group">
          <button class="wr-format-btn" data-cmd="insertOrderedList" title="有序列表">1.</button>
          <button class="wr-format-btn" data-cmd="insertUnorderedList" title="无序列表">•</button>
        </div>
        <div class="wr-format-group">
          <button class="wr-format-btn" data-cmd="indent" title="增加缩进">→</button>
          <button class="wr-format-btn" data-cmd="outdent" title="减少缩进">←</button>
        </div>
        <div class="wr-format-group">
          <span style="font-size:10px;color:var(--text3)" id="wr-word-count">0 字</span>
          <span style="font-size:9px;color:var(--text4);margin-left:4px" id="wr-session-time"></span>
        </div>
      </div>
      <!-- 查找替换 -->
      <div class="wr-find-bar" id="wr-find-bar" style="display:none">
        <div class="wr-find-row">
          <input type="text" id="wr-find-input" class="tool-input" style="width:140px;font-size:11px" placeholder="查找..." spellcheck="false">
          <input type="text" id="wr-replace-input" class="tool-input" style="width:100px;font-size:11px" placeholder="替换为..." spellcheck="false">
          <span id="wr-find-count" style="font-size:10px;color:var(--text3);min-width:40px;text-align:center">0/0</span>
          <button class="wr-format-btn" id="wr-find-prev" style="font-size:9px" title="上一个 (Shift+Enter)">◀</button>
          <button class="wr-format-btn" id="wr-find-next" style="font-size:9px" title="下一个 (Enter)">▶</button>
          <button class="wr-format-btn" id="wr-find-replace" style="font-size:9px" title="替换">替换</button>
          <button class="wr-format-btn" id="wr-find-replaceall" style="font-size:9px" title="全部替换">全部</button>
          <button class="wr-format-btn" id="wr-find-case" style="font-size:9px">Aa</button>
          <button class="wr-format-btn" id="wr-find-close" style="font-size:9px;margin-left:4px">✕</button>
        </div>
      </div>
      <!-- 编辑器 -->
      <div class="wr-editor-scroll" id="wr-editor-scroll">
        <textarea class="writing-editor wr-editor-textarea wr-editor-ta" id="wr-editor" placeholder="开始写作..."></textarea>
      </div>
      <!-- 状态栏 -->
      <div class="wr-statsbar">
        <span id="wr-cursor-pos">Ln 1, Col 1</span>
        <span class="sep"></span>
        <span id="wr-editor-word-count">0 字 · 0 字符</span>
        <span style="flex:1"></span>
        <span id="wr-editor-chapter-nav">
          <button class="wr-format-btn" onclick="writingManager._prevChapter()" title="上一章" style="font-size:8px;padding:1px 4px">◀</button>
          <span id="wr-editor-ch-pos" style="margin:0 4px">0/0</span>
          <button class="wr-format-btn" onclick="writingManager._nextChapter()" title="下一章" style="font-size:8px;padding:1px 4px">▶</button>
        </span>
        <span id="wr-goal-display" style="cursor:pointer;display:none" title="点击设置今日目标">🎯 <span id="wr-goal-progress">0/0</span></span>
        <span id="wr-editor-save-status" style="color:var(--text4)">自动保存</span>
        <button class="wr-format-btn" onclick="writingManager._showShortcuts()" title="快捷键" style="font-size:8px">⌨️</button>
      </div>
    </div>
    <!-- AI 面板 -->
    <div class="wr-ai-panel" data-collapsed="true" id="wr-ai-panel" style="width:0;overflow:hidden;border-left:none">
      <div style="display:flex;align-items:center;gap:4px;padding:6px 12px;border-bottom:1px solid var(--border);flex-shrink:0">
        <span style="font-size:11px;font-weight:600">🤖 AI</span>
        <span style="flex:1"></span>
        <button id="wr-ai-close" class="btn-icon" style="font-size:10px">✕</button>
      </div>
      <div id="wr-ai-content" style="display:none;overflow-y:auto;flex:1;padding:8px 12px">
        <div style="margin-bottom:6px">
          <select id="wr-ai-model" class="tool-input" style="font-size:11px;width:100%"></select>
        </div>
        <div style="margin-bottom:6px">
          <select id="wr-ai-prompt" class="tool-input" style="font-size:11px;width:100%">
            <option value="">选择写作风格（可选）</option>
          </select>
        </div>
        <div style="margin-bottom:6px">
          <input type="text" id="wr-ai-requirements" class="tool-input" style="font-size:11px;width:100%" placeholder="额外要求（选填）">
        </div>
        <button class="btn btn-sm" id="wr-ai-gen" style="width:100%;font-size:11px">✨ AI 生成</button>
        <div id="wr-ai-gen-result" style="margin-top:6px;font-size:11px"></div>
      </div>
      <div id="wr-ai-collapsed-hint" style="display:none;padding:12px;text-align:center;font-size:10px;color:var(--text3)">AI 面板已折叠</div>
    </div>
  </div>
</div>`;

    const $ = id => document.getElementById(id);

    // 绑定
    $('wr-back-home').onclick = () => this.renderHome();
    $('wr-save-chapter').onclick = () => this.saveChapter();
    $('wr-new-chapter').onclick = () => this.newChapter();
    $('wr-ch-sidebar-toggle').onclick = () => this._toggleChapterSidebar();
    $('wr-preview-toggle').onclick = () => this._togglePreview();
    $('wr-snap-btn').onclick = () => this.showSnapshots();
    $('wr-predict-btn').onclick = () => this._showEditorPredict();
    $('wr-focus-toggle').onclick = () => this._toggleFocus();

    // 格式工具栏
    $('wr-format-toolbar').querySelectorAll('.wr-format-btn[data-cmd]').forEach(btn => {
      btn.onclick = () => {
        const ta = $('wr-editor');
        if (!ta) return;
        const cmd = btn.dataset.cmd;
        // Support for simple rich text-like operations via execCommand simulation
        // For textarea, we implement basic formatting by inserting markdown markers
        const start = ta.selectionStart, end = ta.selectionEnd;
        if (start === undefined || end === undefined) return;
        const text = ta.value;
        let newText, cursorPos;
        switch (cmd) {
          case 'bold': newText = text.slice(0, start) + '**' + text.slice(start, end) + '**' + text.slice(end); cursorPos = end + 4; break;
          case 'italic': newText = text.slice(0, start) + '*' + text.slice(start, end) + '*' + text.slice(end); cursorPos = end + 2; break;
          case 'underline': newText = text.slice(0, start) + '<u>' + text.slice(start, end) + '</u>' + text.slice(end); cursorPos = end + 7; break;
          case 'insertOrderedList': newText = text.slice(0, start) + (start > 0 ? '\n' : '') + '1. ' + text.slice(start); cursorPos = start + 3; break;
          case 'insertUnorderedList': newText = text.slice(0, start) + (start > 0 ? '\n' : '') + '- ' + text.slice(start); cursorPos = start + 2; break;
          case 'indent': newText = text.slice(0, start) + '  ' + text.slice(start); cursorPos = start + 2; break;
          case 'outdent': if (text.startsWith('  ') || text.startsWith('\t')) { newText = text.slice(text.startsWith('\t') ? 1 : 2); cursorPos = Math.max(0, start - 2); } break;
          default: return;
        }
        if (newText) { ta.value = newText; ta.focus(); ta.selectionStart = ta.selectionEnd = cursorPos || start; }
        this._updateWordCount();
      };
    });

    // 编辑器自动更新字数 + 自动保存
    if (this._autoSaveTimer) clearTimeout(this._autoSaveTimer);
    $('wr-editor').oninput = () => {
      this._updateWordCount();
      this._updateCursorPos();
      if (this._autoSaveTimer) clearTimeout(this._autoSaveTimer);
      this._autoSaveTimer = setTimeout(() => {
        const b = document.getElementById('wr-save-chapter');
        if (b && b.textContent.includes('保存')) {
          this.saveChapter();
          const st = document.getElementById('wr-editor-save-status');
          if (st) { st.textContent = '⏳ 保存中...'; st.style.color = 'var(--accent)'; }
        }
      }, 15000);
    };
    $('wr-editor').onkeydown = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); this.saveChapter(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); this._toggleFindReplace(); }
      if (e.key === 'Tab') { e.preventDefault();
        const ta = document.getElementById('wr-editor');
        if (!ta) return;
        const s = ta.selectionStart, en = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + '    ' + ta.value.slice(en);
        ta.selectionStart = ta.selectionEnd = s + 4;
        this._updateWordCount();
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) { this._showShortcuts(); }
    };
    $('wr-editor').onclick = () => this._updateCursorPos();
    $('wr-editor').onkeyup = () => this._updateCursorPos();

    // 会话计时器（当前编辑时长）
    this._sessionSec = 0;
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => {
      this._sessionSec++;
      const el = document.getElementById('wr-session-time');
      if (el) {
        const m = Math.floor(this._sessionSec / 60);
        const s = this._sessionSec % 60;
        el.textContent = '⏱ ' + m + ':' + (s < 10 ? '0' : '') + s;
      }
    }, 1000);

    // 查找替换
    $('wr-find-next').onclick = () => this._doFind('next');
    $('wr-find-prev').onclick = () => this._doFind('prev');
    $('wr-find-replace').onclick = () => this._replace();
    $('wr-find-replaceall').onclick = () => this._replaceAll();
    $('wr-find-close').onclick = () => this._toggleFindReplace();
    $('wr-find-input').onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); this._doFind(e.shiftKey ? 'prev' : 'next'); }
      if (e.key === 'Escape') { this._toggleFindReplace(); }
    };
    $('wr-replace-input').onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); this._replace(); }
    };
    $('wr-find-case').onclick = function () { this.classList.toggle('active'); };

    // 章节搜索
    $('wr-ch-search-toggle').onclick = () => this._toggleChapterSearch();
    const _cs = document.getElementById('wr-ch-search'); if (_cs) _cs.oninput = () => this._filterChapters();

    // 写作目标
    $('wr-goal-display').onclick = () => this._toggleGoal();

    // 块级格式
    $('wr-fmt-block').onchange = function () {
      const ta = $('wr-editor');
      if (!ta) return;
      const val = this.value;
      if (val === 'h1') ta.value = '# ' + ta.value;
      else if (val === 'h2') ta.value = '## ' + ta.value;
      else if (val === 'h3') ta.value = '### ' + ta.value;
      else if (val === 'blockquote') ta.value = '> ' + ta.value;
    };

    // AI面板 — 使用4标签面板
    $('wr-ai-close').onclick = () => this._toggleAIPanel();
    // 当AI面板展开时，渲染4标签内容
    const aiContent = document.getElementById('wr-ai-content');
    if (aiContent) {
      // 用showAIPanel替换原来的简单生成面板
      this.showAIPanel(aiContent);
    }
    document.querySelector('.wr-ai-panel').onclick = (e) => {
      const panel = document.querySelector('.wr-ai-panel');
      if (panel.dataset.collapsed === 'true' && e.target.closest('.wr-ai-panel')) {
        this._toggleAIPanel();
      }
    };

    // 加载数据
    const projectData = (this._projects || []).find(p => p.id === id);
    if (projectData) {
      this._project = { ...projectData, id };
      $('wr-proj-title').textContent = '📖 ' + projectData.name;
    } else {
      $('wr-proj-title').textContent = '📖 项目';
    }
    await Promise.all([
      this.loadChapters(id),
      this.loadCharacters(id),
      this._loadEditorAI()
    ]);
    // Initialize resizable layout
    this.initEditorResize();
  },


  _updateCursorPos() {
    const ta = document.getElementById('wr-editor');
    const el = document.getElementById('wr-cursor-pos');
    if (!ta || !el) return;
    const val = ta.value;
    const pos = ta.selectionStart;
    const before = val.substring(0, pos);
    const line = (before.match(/\n/g) || []).length + 1;
    const lastNewline = before.lastIndexOf('\n');
    const col = lastNewline >= 0 ? pos - lastNewline : pos + 1;
    el.textContent = 'Ln ' + line + ', Col ' + col;
  },

  _updateEditorStats() {
    const ta = document.getElementById('wr-editor');
    const el = document.getElementById('wr-editor-word-count');
    if (!ta || !el) return;
    const text = ta.value;
    el.textContent = (text.trim() ? text.trim().length : 0) + ' 字 \u00b7 ' + text.length + ' 字符';
  },

  _prevChapter() {
    if (!this._chapters.length || !this._activeChapter) return;
    const idx = this._chapters.findIndex(c => c.id === this._activeChapter.id);
    if (idx > 0) this.loadChapter(this._chapters[idx - 1].id);
  },

  _nextChapter() {
    if (!this._chapters.length || !this._activeChapter) return;
    const idx = this._chapters.findIndex(c => c.id === this._activeChapter.id);
    if (idx < this._chapters.length - 1) this.loadChapter(this._chapters[idx + 1].id);
  },

  _updateChapterNav() {
    const el = document.getElementById('wr-editor-ch-pos');
    if (!el) return;
    if (!this._chapters.length || !this._activeChapter) {
      el.textContent = '0/0';
      return;
    }
    const idx = this._chapters.findIndex(c => c.id === this._activeChapter.id);
    const total = this._chapters.length;
    el.textContent = (idx + 1) + '/' + total;
  },

  _showShortcuts() {
    const overlay = document.createElement('div');
    overlay.id = 'wr-shortcuts-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center';
    overlay.onclick = function(e) { if (e.target === this) this.remove(); };
    overlay.innerHTML = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:20px;max-width:380px;width:90%;font-size:12px;line-height:2">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:8px">⌨️ 快捷键</div>' +
      '<div><kbd>Ctrl+S</kbd> 保存章节</div>' +
      '<div><kbd>Ctrl+B</kbd> 加粗</div>' +
      '<div><kbd>Ctrl+I</kbd> 斜体</div>' +
      '<div><kbd>Ctrl+U</kbd> 下划线</div>' +
      '<div><kbd>Tab</kbd> 插入缩进</div>' +
      '<div><kbd>?</kbd> 显示此帮助</div>' +
      '<hr style="border-color:var(--border);margin:6px 0">' +
      '<div style="color:var(--text3);font-size:10px;line-height:1.6">提示：编辑器支持Markdown格式。<br>点击工具栏按钮可快速插入格式。</div>' +
      '<button class="btn btn-sm" style="margin-top:8px;width:100%" onclick="this.closest(\'#wr-shortcuts-overlay\').remove()">知道了</button>' +
    '</div>';
    document.body.appendChild(overlay);
  },

  _updateWordCount() {
    const el = document.getElementById('wr-word-count');
    const ta = document.getElementById('wr-editor');
    if (el && ta) {
      const text = ta.value.trim();
      el.textContent = (text ? text.length : 0) + ' 字';
    }
    this._updateEditorStats();
    this._updateChapterNav();
  },

  _toggleChapterSidebar() {
    const panel = document.getElementById('wr-chapter-panel');
    const btn = document.getElementById('wr-ch-sidebar-toggle');
    if (!panel) return;
    const collapsed = panel.classList.toggle('collapsed');
    if (btn) btn.textContent = collapsed ? '▶' : '◀';
  },

  _togglePreview() {
    const ta = document.getElementById('wr-editor');
    if (!ta) return;
    if (this._editMode === 'edit') {
      const preview = document.createElement('div');
      preview.id = 'wr-preview-area';
      preview.style.cssText = 'flex:1;overflow-y:auto;padding:16px 24px;font-size:14px;line-height:1.8;color:var(--text);white-space:pre-wrap';
      preview.innerHTML = this._nl2br(ta.value);
      ta.style.display = 'none';
      ta.parentNode.appendChild(preview);
      this._editMode = 'preview';
      document.getElementById('wr-preview-toggle').textContent = '✏️';
    } else {
      const pv = document.getElementById('wr-preview-area');
      if (pv) pv.remove();
      ta.style.display = '';
      this._editMode = 'edit';
      document.getElementById('wr-preview-toggle').textContent = '👁️';
    }
  },

  _toggleFocus() {
    const panel = document.getElementById('writing-content');
    if (!panel) return;
    panel.classList.toggle('wr-focus-mode');
    document.getElementById('wr-focus-toggle').textContent =
      panel.classList.contains('wr-focus-mode') ? '🖋️' : '🎯';
  },

  _toggleAIPanel() {
    const panel = document.querySelector('.wr-ai-panel');
    const btn = document.getElementById('wr-ai-close');
    const content = document.getElementById('wr-ai-content');
    if (!panel) return;
    const collapsed = panel.dataset.collapsed === 'true';
    panel.dataset.collapsed = collapsed ? 'false' : 'true';
    if (collapsed) {
      panel.style.width = '340px';
      panel.style.borderLeft = '1px solid var(--border)';
      panel.style.overflow = '';
      if (content) content.style.display = 'block';
    } else {
      panel.style.width = '0';
      panel.style.borderLeft = 'none';
      panel.style.overflow = 'hidden';
      if (content) content.style.display = 'none';
    }
  },

  _loadEditorAI() {
    const sel = document.getElementById('wr-ai-model');
    if (sel && this._models) {
      sel.innerHTML = '';
      Object.entries(this._models).forEach(([key, m]) => {
        const opt = document.createElement('option');
        opt.value = key; opt.textContent = m.emoji + ' ' + m.name;
        sel.appendChild(opt);
      });
    }
    const psel = document.getElementById('wr-ai-prompt');
    if (psel) {
      psel.innerHTML = '<option value="">选择写作风格（可选）</option>';
      (this._prompts || []).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id; opt.textContent = p.title;
        psel.appendChild(opt);
      });
    }
  },

  async _aiGenerateInEditor() {
    const ta = document.getElementById('wr-editor');
    if (!ta) return;
    const selectedText = ta.value.substring(ta.selectionStart, ta.selectionEnd);
    const promptId = document.getElementById('wr-ai-prompt')?.value;
    const modelVersion = document.getElementById('wr-ai-model')?.value || 'atmosphere';
    const requirements = document.getElementById('wr-ai-requirements')?.value || '';
    const result = document.getElementById('wr-ai-gen-result');
    if (!result) return;

    result.innerHTML = '<div style="text-align:center;padding:8px;color:var(--text3)">⏳ 生成中...</div>';
    const r = await this.api('POST', '/api/writing/ai/generate', {
      promptId: promptId || undefined,
      userInput: selectedText || ta.value.substring(0, 500) || '写作方向：' + (this._project?.name || '未知'),
      extra: requirements || '(直接输出正文)',
      modelVersion
    });

    if (r.success) {
      this._lastGenerated = r.content;
      result.innerHTML =
        '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:4px;padding:8px;font-size:11px;line-height:1.6;max-height:200px;overflow-y:auto;margin-bottom:4px">' +
          this._nl2br(r.content.substring(0, 1000)) +
        '</div>' +
        '<div style="display:flex;gap:4px;flex-wrap:wrap">' +
          '<button class="btn btn-sm" onclick="writingManager._insertAIResult()">📋 插入</button>' +
          '<button class="btn btn-sm btn-ghost" onclick="writingManager._aiGenerateInEditor()">⟳ 重试</button>' +
        '</div>';
    } else {
      result.innerHTML = '<div style="color:var(--red);font-size:11px">❌ ' + (r.error || '失败') + '</div>';
    }
  },

  _insertAIResult() {
    const ta = document.getElementById('wr-editor');
    if (!ta || !this._lastGenerated) return;
    const pos = ta.selectionStart;
    ta.value = ta.value.slice(0, pos) + '\n' + this._lastGenerated + '\n' + ta.value.slice(ta.selectionEnd);
    this._updateWordCount();
    document.getElementById('wr-ai-gen-result').innerHTML = '<span style="color:var(--green);font-size:10px">✅ 已插入</span>';
  },

  // ─── 章节 CRUD ───

  async loadChapters(projectId) {
    try {
      const chapters = await this.api('GET', '/api/writing/chapters/' + projectId);
      this._chapters = Array.isArray(chapters) ? chapters : [];
      const body = document.getElementById('wr-chapter-panel-body');
      const count = document.getElementById('wr-chapter-count');
      if (count) count.textContent = '(' + this._chapters.length + ')';
      if (!body) return;

      if (!this._chapters.length) {
        body.innerHTML = '<div style="padding:20px;text-align:center;font-size:11px;color:var(--text3)">暂无章节<br>点击"+"创建</div>';
        return;
      }
      this._renderChapterList(this._chapters);
// 选中第一个
      if (this._chapters.length > 0) {
        const first = body.querySelector('.wr-chapter-card');
        if (first) first.classList.add('active');
        this.loadChapter(this._chapters[0].id);
      }
    } catch (e) { console.error('loadChapters error:', e); }
  },

  async loadChapter(id) {
    try {
      const ch = await this.api('GET', '/api/writing/chapter/' + id);
      if (!ch) return;
      this._activeChapter = ch;
      const ta = document.getElementById('wr-editor');
      if (ta) {
        ta.value = ch.content || '';
        this._updateWordCount();
        this._updateCursorPos();
        this._updateChapterNav();
        this._updateGoalDisplay();
        // Update save status
        const st = document.getElementById('wr-editor-save-status');
        if (st) { st.textContent = '已加载'; st.style.color = ''; }
      }
      // Highlight
      document.querySelectorAll('.wr-chapter-card').forEach(el => {
        el.classList.toggle('active', el.dataset.id === id);
      });
    } catch (e) { console.error('loadChapter error:', e); }
  },

  async saveChapter() {
    const ta = document.getElementById('wr-editor');
    if (!ta) return;
    const content = ta.value;
    const b = document.getElementById('wr-save-chapter');
    const pid = this._project?.id;
    if (!pid) return;

    if (this._activeChapter && this._activeChapter.id) {
      b.textContent = '💾 保存中...';
      await this.api('PUT', '/api/writing/chapter/' + this._activeChapter.id, {
        projectId: pid,
        content,
        wordCount: content.length
      });
      b.textContent = '✅ 已保存';
      setTimeout(() => { b.textContent = '💾 保存'; }, 1500);
      this.loadChapters(pid);
    } else {
      await this.newChapter();
      if (this._activeChapter) {
        await this.api('PUT', '/api/writing/chapter/' + this._activeChapter.id, { projectId: pid, content, wordCount: content.length });
      }
      this.loadChapters(pid);
    }
  },

  async newChapter() {
    const projectId = this._project?.id;
    if (!projectId) return;
    const num = (this._chapters.length || 0) + 1;
    const name = prompt('章节标题（可选）：') || '第' + num + '章';
    const r = await this.api('POST', '/api/writing/chapter/' + projectId, {
      title: name,
      number: num
    });
    if (r) {
      const id = r.id || r._id || r;
      if (id) {
        this._activeChapter = { id, title: name, content: '' };
        const ta = document.getElementById('wr-editor');
        if (ta) ta.value = '';
        this._updateWordCount();
      }
      await this.loadChapters(projectId);
    }
  },

  async deleteChapter(id) {
    if (!confirm('确认删除此章节？')) return;
    await this.api('DELETE', '/api/writing/chapter/' + id, { projectId: this._project?.id });
    this._activeChapter = null;
    const ta = document.getElementById('wr-editor');
    if (ta) ta.value = '';
    this._updateWordCount();
    this.loadChapters(this._project.id);
  },

  async renameChapter(id) {
    const ch = this._chapters.find(c => c.id === id);
    if (!ch) return;
    const name = prompt('新标题：', ch.title || '');
    if (!name) return;
    await this.api('PUT', '/api/writing/chapter/' + id, { title: name });
    this.loadChapters(this._project.id);
  },

  // ─── 角色 ───

  async loadCharacters(projectId) {
    try {
      const chars = await this.api('GET', '/api/writing/characters/' + projectId);
      this._characters = Array.isArray(chars) ? chars : [];
    } catch (e) { this._characters = []; }
  },

  // ═══════════════════════════════════════════════════════════════
  // 项目管理视图
  // ═══════════════════════════════════════════════════════════════

  async openProjectMgmt(id) {
    this._project = { id };
    const area = document.getElementById('writing-content');
    if (!area) return;

    const project = (this._projects || []).find(p => p.id === id) || { id, name: '项目', description: '' };
    area.innerHTML = `
<div style="padding:14px 20px;max-width:900px;margin:0 auto;height:100%;overflow-y:auto">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
    <button class="btn btn-sm btn-ghost" id="wr-mgmt-back">← 返回</button>
    <span style="font-size:16px;font-weight:600">⚙️ 项目管理</span>
    <span id="wr-mgmt-name" style="font-size:14px;color:var(--text2)">${this._esc(project?.name || '项目')}</span>
    <span style="flex:1"></span>
    <button class="btn btn-sm btn-ghost" id="wr-mgmt-delete" style="color:var(--red)">🗑️ 删除项目</button>
  </div>
  <!-- 标签栏 -->
  <div style="display:flex;gap:0;margin-bottom:10px;border-bottom:1px solid var(--border)">
    <button class="wr-mgmt-tab active" data-tab="outline">📜 大纲</button>
    <button class="wr-mgmt-tab" data-tab="characters">👤 角色</button>
    <button class="wr-mgmt-tab" data-tab="notes">📝 笔记</button>
    <button class="wr-mgmt-tab" data-tab="stats">📊 统计</button>
    <button class="wr-mgmt-tab" data-tab="settings">⚙️ 设置</button>
  </div>
  <div id="wr-mgmt-content"></div>
</div>`;

    const $ = id => document.getElementById(id);

    $('wr-mgmt-back').onclick = () => this.renderHome();
    $('wr-mgmt-delete').onclick = () => {
      if (confirm('确定永久删除此项目？所有章节、角色、笔记都将丢失！')) {
        this.api('DELETE', '/api/writing/project/' + id).then(() => this.renderHome());
      }
    };

    // Tab切换
    document.querySelectorAll('.wr-mgmt-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.wr-mgmt-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._renderMgmtTab(tab.dataset.tab);
      };
    });

    // 初始加载大纲
    this._renderMgmtTab('outline');
  },

  async _renderMgmtTab(tab) {
    const container = document.getElementById('wr-mgmt-content');
    if (!container) return;
    const pid = this._project?.id;

    switch (tab) {
      case 'outline':
        container.innerHTML = '<div style="padding:10px;text-align:center;color:var(--text3);font-size:11px">⏳ 加载大纲...</div>';
        try {
          let outlineText = '';
          try {
            const r = await fetch('/api/writing/outline/' + pid);
            if (r.ok) {
              const data = await r.json();
              outlineText = data.success ? (data.data?.content || data.data || '') : '';
            }
          } catch (e) {}
          const text = outlineText;
          container.innerHTML =
            '<div style="font-size:12px;font-weight:600;margin-bottom:6px">📜 项目大纲</div>' +
            '<textarea class="tool-textarea" id="wr-outline-editor" style="width:100%;height:400px;font-size:13px;line-height:1.7;resize:vertical">' + this._esc(text) + '</textarea>' +
            '<div style="margin-top:6px;display:flex;gap:6px">' +
              '<button class="btn btn-sm" id="wr-outline-save">💾 保存大纲</button>' +
              '<button class="btn btn-sm btn-ghost" id="wr-outline-gen">🤖 AI生成大纲</button>' +
              '<span id="wr-outline-status" style="font-size:10px;color:var(--text3);line-height:28px"></span>' +
            '</div>' +
            '<div style="margin-top:8px;font-size:10px;color:var(--text3)">' +
              '💡 支持 Markdown 格式。使用 # ## ### 表示标题层级。' +
            '</div>';
          document.getElementById('wr-outline-save').onclick = async () => {
            const c = document.getElementById('wr-outline-editor')?.value || '';
            await this.api('POST', '/api/writing/outline/' + pid, { content: c });
            const st = document.getElementById('wr-outline-status');
            if (st) { st.textContent = '✅ 已保存'; setTimeout(() => { st.textContent = ''; }, 2000); }
          };
          document.getElementById('wr-outline-gen').onclick = () => {
            alert('此功能正在开发中，请手动编写大纲。\n\n你也可以使用首页的AI写作引擎，选择对应项目后输入"生成大纲"来使用AI生成。');
          };
        } catch (e) {
          container.innerHTML = '<div style="padding:10px;color:var(--red);font-size:11px">❌ 加载大纲失败</div>';
        }
        break;

      case 'characters':
        container.innerHTML = '<div style="padding:10px;text-align:center;color:var(--text3);font-size:11px">⏳ 加载角色...</div>';
        try {
          const chars = await this.api('GET', '/api/writing/characters/' + pid);
          const arr = Array.isArray(chars) ? chars : [];
          container.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
              '<span style="font-size:12px;font-weight:600">👤 角色管理</span>' +
              '<span style="font-size:10px;color:var(--text3)">(' + arr.length + ' 人)</span>' +
              '<span style="flex:1"></span>' +
              '<button class="btn btn-sm" id="wr-char-add">+ 添加</button>' +
            '</div>' +
            '<div id="wr-char-list">' +
              (arr.length ? arr.map(c =>
                '<div class="wr-char-card" data-id="' + c.id + '">' +
                  '<div style="display:flex;align-items:center;gap:6px">' +
                    '<span style="font-weight:600;font-size:13px;flex:1">' + this._esc(c.name || '未命名') + '</span>' +
                    '<button class="wr-ai-btn" onclick="event.stopPropagation();writingManager._editChar(\'' + c.id + '\')">✏️</button>' +
                    '<button class="wr-ai-btn" onclick="event.stopPropagation();writingManager._deleteChar(\'' + c.id + '\')">🗑️</button>' +
                  '</div>' +
                  (c.description ? '<div style="font-size:10px;color:var(--text3);margin-top:2px">' + this._esc(c.description) + '</div>' : '') +
                '</div>'
              ).join('') :
              '<div style="text-align:center;padding:30px;color:var(--text3);font-size:12px">暂无角色</div>'
            ) + '</div>';
          document.getElementById('wr-char-add').onclick = () => this._addChar();
        } catch (e) {
          container.innerHTML = '<div style="padding:10px;color:var(--red);font-size:11px">❌ 加载角色失败</div>';
        }
        break;

      case 'notes':
        container.innerHTML = '<div style="padding:10px;text-align:center;color:var(--text3);font-size:11px">⏳ 加载笔记...</div>';
        try {
          const notes = await this.api('GET', '/api/writing/notes/' + pid);
          const arr = Array.isArray(notes) ? notes : [];
          container.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
              '<span style="font-size:12px;font-weight:600">📝 笔记</span>' +
              '<span style="flex:1"></span>' +
              '<button class="btn btn-sm" id="wr-note-add">+ 添加</button>' +
            '</div>' +
            '<div id="wr-note-list">' +
              (arr.length ? arr.map(n =>
                '<div class="wr-note-card" data-id="' + n.id + '">' +
                  '<div style="display:flex;align-items:center;gap:6px">' +
                    '<span style="font-weight:600;font-size:12px;flex:1">' + this._esc(n.title || '未命名') + '</span>' +
                    '<span style="font-size:9px;color:var(--text3)">' + (n.createdAt ? new Date(n.createdAt).toLocaleDateString() : '') + '</span>' +
                    '<button class="wr-ai-btn" onclick="event.stopPropagation();writingManager._editNote(\'' + n.id + '\')">✏️</button>' +
                    '<button class="wr-ai-btn" onclick="event.stopPropagation();writingManager._deleteNote(\'' + n.id + '\')">🗑️</button>' +
                  '</div>' +
                  (n.content ? '<div style="font-size:10px;color:var(--text3);margin-top:2px;max-height:40px;overflow:hidden">' + this._esc(n.content) + '</div>' : '') +
                '</div>'
              ).join('') :
              '<div style="text-align:center;padding:30px;color:var(--text3);font-size:12px">暂无笔记</div>'
            ) + '</div>';
          document.getElementById('wr-note-add').onclick = () => this._addNote();
        } catch (e) {
          container.innerHTML = '<div style="padding:10px;color:var(--red);font-size:11px">❌ 加载笔记失败</div>';
        }
        break;

      case 'stats':
        container.innerHTML = '<div style="padding:10px;text-align:center;color:var(--text3);font-size:11px">⏳ 加载统计...</div>';
        try {
          const stats = await this.api('GET', '/api/writing/stats/' + pid);
          const s = stats || {};
          const tw = s.totalWords || s.wordCount || 0;
          const tc = s.totalChapters || s.chapterCount || 0;
          container.innerHTML =
            '<div style="font-size:12px;font-weight:600;margin-bottom:8px">📊 写作统计</div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:12px">' +
              '<div class="stat-card"><div class="stat-val">' + tc + '</div><div class="stat-lbl">总章节</div></div>' +
              '<div class="stat-card"><div class="stat-val">' + tw.toLocaleString() + '</div><div class="stat-lbl">总字数</div></div>' +
              '<div class="stat-card"><div class="stat-val">' + (tc > 0 ? Math.round(tw / tc) : 0) + '</div><div class="stat-lbl">平均每章字数</div></div>' +
              '<div class="stat-card"><div class="stat-val">' + this._characters.length + '</div><div class="stat-lbl">角色数</div></div>' +
            '</div>';
        } catch (e) {
          container.innerHTML = '<div style="padding:10px;color:var(--red);font-size:11px">❌ 加载统计失败</div>';
        }
        break;

      case 'settings':
        const proj = (this._projects || []).find(p => p.id === pid);
        container.innerHTML =
          '<div style="font-size:12px;font-weight:600;margin-bottom:8px">⚙️ 项目设置</div>' +
          '<div style="max-width:400px">' +
            '<div class="form-group">' +
              '<label>项目名称</label>' +
              '<input type="text" id="wr-set-name" value="' + this._esc(proj?.name || '') + '">' +
            '</div>' +
            '<div class="form-group">' +
              '<label>项目描述</label>' +
              '<textarea class="tool-textarea" id="wr-set-desc" style="height:60px;font-size:12px">' + this._esc(proj?.description || '') + '</textarea>' +
            '</div>' +
            '<div class="form-group">' +
              '<label>类型</label>' +
              '<select id="wr-set-type" class="tool-input">' +
                '<option value="novel"' + (proj?.category === 'novel' || !proj?.category ? ' selected' : '') + '>📖 小说</option>' +
                '<option value="script"' + (proj?.category === 'script' ? ' selected' : '') + '>🎬 剧本</option>' +
              '</select>' +
            '</div>' +
            '<button class="btn btn-sm" id="wr-set-save">💾 保存设置</button>' +
            '<span id="wr-set-status" style="font-size:10px;color:var(--text3);margin-left:6px"></span>' +
          '</div>';
        document.getElementById('wr-set-save').onclick = async () => {
          const name = document.getElementById('wr-set-name')?.value;
          const desc = document.getElementById('wr-set-desc')?.value;
          const type = document.getElementById('wr-set-type')?.value;
          if (!name) { alert('项目名称不能为空'); return; }
          await this.api('PUT', '/api/writing/project/' + pid, { name, description: desc, type });
          const st = document.getElementById('wr-set-status');
          if (st) { st.textContent = '✅ 已保存'; setTimeout(() => { st.textContent = ''; }, 2000); }
          const title = document.getElementById('wr-mgmt-name');
          if (title) title.textContent = name;
        };
        break;
    }
  },

  // ─── 角色 CRUD ───

  _addChar() {
    const name = prompt('角色名称：');
    if (!name) return;
    const desc = prompt('角色描述（可选）：') || '';
    this.api('POST', '/api/writing/character/' + this._project.id, { name, description: desc })
      .then(() => this._renderMgmtTab('characters'));
  },

  _editChar(id) {
    const char = this._characters.find(c => c.id === id);
    if (!char) return;
    const name = prompt('角色名称：', char.name || '');
    if (!name) return;
    const desc = prompt('角色描述：', char.description || '');
    this.api('PUT', '/api/writing/character/' + id, { name, description: desc || '' })
      .then(() => this._renderMgmtTab('characters'));
  },

  _deleteChar(id) {
    if (!confirm('确认删除此角色？')) return;
    this.api('DELETE', '/api/writing/character/' + id)
      .then(() => this._renderMgmtTab('characters'));
  },

  // ─── 笔记 CRUD ───

  _addNote() {
    const title = prompt('笔记标题：');
    if (!title) return;
    const content = prompt('笔记内容（可选）：') || '';
    this.api('POST', '/api/writing/note/' + this._project.id, { title, content })
      .then(() => this._renderMgmtTab('notes'));
  },

  _editNote(id) {
    const note = this._notes.find(n => n.id === id);
    if (!note) return;
    const title = prompt('笔记标题：', note.title || '');
    if (!title) return;
    const content = prompt('笔记内容：', note.content || '');
    this.api('PUT', '/api/writing/note/' + id, { title, content: content || '' })
      .then(() => this._renderMgmtTab('notes'));
  },

  _deleteNote(id) {
    if (!confirm('确认删除此笔记？')) return;
    this.api('DELETE', '/api/writing/note/' + id)
      .then(() => this._renderMgmtTab('notes'));
  },

  // ═══════════════════════════════════════════════════════════════
  // 创意工具箱
  // ═══════════════════════════════════════════════════════════════

  showCreativeToolbox() {
    const area = document.getElementById('writing-content');
    if (!area) return;
    area.innerHTML = `
<div style="padding:14px 20px;max-width:900px;margin:0 auto">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
    <button class="btn btn-sm btn-ghost" id="wr-tb-back">← 返回</button>
    <span style="font-size:16px;font-weight:600">🎨 创意工具箱</span>
  </div>
  <div class="wr-tool-grid">
    <div class="wr-tool-card" id="wr-tool-name-gen">
      <div class="tcc-icon">🏷️</div>
      <div class="tcc-title">角色姓名生成</div>
      <div class="tcc-desc">随机生成中/西风格的角色姓名</div>
    </div>
    <div class="wr-tool-card" id="wr-tool-quick-prompt">
      <div class="tcc-icon">📝</div>
      <div class="tcc-title">快捷写作提示</div>
      <div class="tcc-desc">常用写作方向提示词，直接复制使用</div>
    </div>
    <div class="wr-tool-card" id="wr-tool-text-tools">
      <div class="tcc-icon">🔧</div>
      <div class="tcc-title">文本工具</div>
      <div class="tcc-desc">字数统计 / 替换 / 查找</div>
    </div>
  </div>
  <div id="wr-tool-content" style="margin-top:12px"></div>
</div>`;

    document.getElementById('wr-tb-back').onclick = () => this.renderHome();
    document.getElementById('wr-tool-name-gen').onclick = () => this._showNameGenerator();
    document.getElementById('wr-tool-quick-prompt').onclick = () => this._showQuickPrompts();
    document.getElementById('wr-tool-text-tools').onclick = () => this._showTextTools();
  },

  _showNameGenerator() {
    const div = document.getElementById('wr-tool-content');
    if (!div) return;
    const surnames = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳丰鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚程嵇邢滑裴陆荣翁荀羊於惠甄靳封芮羿储靳汲邴糜松'.match(/.{1,2}/g) || [];
    const maleNames = '伟强磊军勇杰鑫涛斌浩明辉鹏飞超波晨阳峰俊志文博健龙海林平刚毅旭瑞德宁静胜胜利祺轩宇天泽豪睿辰恒远翔翼瀚玮瑜璟卿昊然川渊尧聪昆山鸿鸣澜卓晏枫霖烨煜炜铮钧锴锋钢腾骞麟鸣凤鹏鹤麒麟骁骏驰骋'.split('');
    const femaleNames = '芳娟敏静丽艳梅琳玲萍红娜霞燕华秀雪莹婷莉雯蕊颖蕾璇瑶薇萱玥琪悦慧洁丹希露绮曼舒荷莲芙蓉芝兰竹菊梅琴瑟笛箫筝嫣婵姝柳眉黛颜柔懿娴淑婉洁清滢湉沐溪漪泓沁洛汐洵涵湄滟潆润淳钰珊珂璐瑛芙芷若欣宜嘉思彤萌芊蓓蕊璞宛妙珺姝娴婕媛忆幻念清亭苹茜茹茵茹萍萱莎蕾颖璇岚薇淼青冉艺语芷若颜竹梅沛菡霏玥晗诗雅琪曦璨瑾瑜'.split('');
    div.innerHTML =
      '<div style="font-size:12px;font-weight:600;margin-bottom:6px">🏷️ 角色姓名生成</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
        '<button class="btn btn-sm" id="wr-name-gen-m">♂ 生成男性名</button>' +
        '<button class="btn btn-sm" id="wr-name-gen-f">♀ 生成女性名</button>' +
      '</div>' +
      '<div id="wr-name-result" style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:10px;font-size:12px;min-height:30px;line-height:1.8"></div>';

    const gen = (isMale) => {
      const list = isMale ? maleNames : femaleNames;
      const count = 10;
      const names = [];
      for (let i = 0; i < count; i++) {
        const s = surnames[Math.floor(Math.random() * surnames.length)];
        const g = [];
        const len = Math.random() > 0.3 ? 2 : 1;
        for (let j = 0; j < len; j++) g.push(list[Math.floor(Math.random() * list.length)]);
        names.push(s + g.join(''));
      }
      document.getElementById('wr-name-result').innerHTML = names.map(n => '<span style="display:inline-block;margin:2px 6px;padding:2px 8px;background:var(--bg);border-radius:4px">' + n + '</span>').join('');
    };
    document.getElementById('wr-name-gen-m').onclick = () => gen(true);
    document.getElementById('wr-name-gen-f').onclick = () => gen(false);
    gen(true);
  },

  _showQuickPrompts() {
    const div = document.getElementById('wr-tool-content');
    if (!div) return;
    const prompts = [
      { title: '【🔥】番茄爽文节奏', content: '用番茄小说的风格续写。要求：1. 减少景物和情绪描写，节奏要快 2. 对话推动剧情，不设太多心理活动 3. 每段不超过3句话 4. 前500字要有钩子或小冲突 5. 去掉AI常见的过渡词' },
      { title: '【💕】情感细腻风格', content: '用细腻的情感风格续写。要求：1. 用感官描写传达情绪 2. 微表情代替直白心理 3. 内心独白不超过50字 4. 环境描写服务于情感氛围 5. 对话留白比说满更动人' },
      { title: '【⚔️】打斗场面·燃系', content: '描写打斗场面。要求：1. 清晰的攻防交替节奏 2. 利用场地环境增加变化 3. 每个动作有明确目的 4. 打斗中的对话简短有力 5. 打斗结果有影响力' },
      { title: '【🧐】悬疑推理风格', content: '按悬疑推理风格续写。要求：1. 多角度铺设线索 2. 真假信息交错 3. 节奏由缓到急 4. 保持逻辑自洽 5. 结尾留下新悬念' },
      { title: '【🎭】轻小说·对话风', content: '用轻小说风格续写。要求：1. 对话占60%以上内容 2. 角色说话有辨识度 3. 叙述视角轻快活泼 4. 适当加入吐槽和内心OS 5. 场景转换快' },
    ];
    div.innerHTML =
      '<div style="font-size:12px;font-weight:600;margin-bottom:6px">📝 快捷写作提示</div>' +
      '<div style="font-size:10px;color:var(--text3);margin-bottom:6px">点击复制，然后粘贴到AI引擎的「额外要求」中输入</div>' +
      '<div style="display:grid;gap:6px">' +
        prompts.map((p, i) =>
          '<div class="wr-prompt-card" data-idx="' + i + '">' +
            '<div style="font-size:12px;font-weight:500;margin-bottom:2px">' + p.title + '</div>' +
            '<div style="font-size:10px;color:var(--text3);max-height:60px;overflow:hidden">' + p.content.substring(0, 100) + '...</div>' +
          '</div>'
        ).join('') +
      '</div>';
    div.querySelectorAll('.wr-prompt-card').forEach(el => {
      el.onclick = () => {
        const idx = parseInt(el.dataset.idx);
        const p = prompts[idx];
        navigator.clipboard.writeText(p.content).then(() => {
          alert('✅ 已复制到剪贴板：' + p.title);
        });
      };
    });
  },

  _showTextTools() {
    const div = document.getElementById('wr-tool-content');
    if (!div) return;
    div.innerHTML =
      '<div style="font-size:12px;font-weight:600;margin-bottom:6px">🔧 文本工具</div>' +
      '<div style="margin-bottom:6px">' +
        '<textarea class="tool-textarea" id="wr-text-tool-input" style="width:100%;height:150px;font-size:13px;resize:vertical" placeholder="粘贴或输入文本..."></textarea>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">' +
        '<button class="btn btn-sm" id="wr-text-count">📊 统计字数</button>' +
        '<button class="btn btn-sm btn-ghost" id="wr-text-trim">✂️ 清理空格</button>' +
        '<button class="btn btn-sm btn-ghost" id="wr-text-uni">统一标点</button>' +
      '</div>' +
      '<div id="wr-text-result" style="font-size:11px;color:var(--text2)"></div>';

    document.getElementById('wr-text-count').onclick = () => {
      const text = document.getElementById('wr-text-tool-input')?.value || '';
      const chars = text.replace(/\s/g, '').length;
      const words = text.length;
      const paras = text.split('\n').filter(l => l.trim()).length;
      document.getElementById('wr-text-result').innerHTML =
        '📊 字符数（不含空格）：' + chars + ' | 总字符：' + words + ' | 段落：' + paras;
    };
    document.getElementById('wr-text-trim').onclick = () => {
      const ta = document.getElementById('wr-text-tool-input');
      if (ta) { ta.value = ta.value.replace(/[ 　]+/g, ' ').replace(/^\s+|\s+$/gm, '').trim(); }
    };
    document.getElementById('wr-text-uni').onclick = () => {
      const ta = document.getElementById('wr-text-tool-input');
      if (ta) {
        ta.value = ta.value
          .replace(/【/g, '「').replace(/】/g, '」')
          .replace(/(\d)\.(\d)/g, '$1.$2')
          .replace(/([。，、：；？！])+/g, '$1');
      }
    };
  },

  // ═══════════════════════════════════════════════════════════════
  // 提示词库
  // ═══════════════════════════════════════════════════════════════

  showPromptLibrary() {
    const area = document.getElementById('writing-content');
    if (!area) return;
    area.innerHTML = `
<div style="padding:14px 20px;max-width:900px;margin:0 auto">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
    <button class="btn btn-sm btn-ghost" id="wr-pl-back">← 返回</button>
    <span style="font-size:16px;font-weight:600">📚 提示词库</span>
    <span style="font-size:10px;color:var(--text3)" id="wr-pl-count"></span>
  </div>
  <div id="wr-pl-content" style="font-size:11px;color:var(--text3)">⏳ 加载中...</div>
</div>`;

    document.getElementById('wr-pl-back').onclick = () => this.renderHome();

    if (!this._prompts.length) {
      document.getElementById('wr-pl-content').innerHTML = '<div style="text-align:center;padding:20px">暂无提示词</div>';
      return;
    }
    document.getElementById('wr-pl-count').textContent = '(' + this._prompts.length + ' 条)';
    // 按分类分组
    const categorized = {};
    this._prompts.forEach(p => {
      const cat = p.category || '其他';
      if (!categorized[cat]) categorized[cat] = [];
      categorized[cat].push(p);
    });
    document.getElementById('wr-pl-content').innerHTML = Object.entries(categorized).map(([cat, items]) =>
      '<div style="margin-bottom:10px">' +
        '<div style="font-size:12px;font-weight:600;margin-bottom:4px;color:var(--text2)">' + cat + ' (' + items.length + ')</div>' +
        '<div style="display:grid;gap:4px">' +
          items.map(p =>
            '<div class="wr-prompt-card" data-id="' + p.id + '">' +
              '<div style="font-size:12px;font-weight:500">' + p.title + '</div>' +
              '<div style="font-size:10px;color:var(--text3)">' + this._esc(p.desc || '') + '</div>' +
              '<div style="margin-top:4px;font-size:9px;color:var(--text4);display:none" class="wr-pl-prompt-content">' + this._esc(p.content || '') + '</div>' +
            '</div>'
          ).join('') +
        '</div>' +
      '</div>'
    ).join('');

    document.querySelectorAll('.wr-prompt-card').forEach(el => {
      el.onclick = () => {
        const content = el.querySelector('.wr-pl-prompt-content');
        if (content) {
          const visible = content.style.display !== 'block';
          document.querySelectorAll('.wr-pl-prompt-content').forEach(c => c.style.display = 'none');
          content.style.display = visible ? 'block' : 'none';
        }
      };
    });
  }

,

  // ═══════════════════════════════════════════════════════════════
  // AI 面板 — 编辑器内集成
  // ═══════════════════════════════════════════════════════════════

  showAIPanel(area) {
    if (!area) return;
    // If the AI panel has its own content area, render tabs
    // Otherwise we're rendering into the writing-content area directly
    area.innerHTML = `
<div style="display:flex;flex-direction:column;height:100%">
  <div style="display:flex;gap:0;border-bottom:1px solid var(--border);flex-shrink:0">
    <button class="wr-ai-tab active" data-tab="write">✍️ 写作</button>
    <button class="wr-ai-tab" data-tab="outline">📋 章纲</button>
    <button class="wr-ai-tab" data-tab="polish">✨ 润色</button>
    <button class="wr-ai-tab" data-tab="chat">💬 对话</button>
  </div>
  <div id="wr-ai-tab-content" style="flex:1;overflow-y:auto;padding:8px 10px;font-size:12px"></div>
</div>`;
    area.querySelectorAll('.wr-ai-tab').forEach(tab => {
      tab.onclick = () => {
        area.querySelectorAll('.wr-ai-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._renderAITab(tab.dataset.tab);
      };
    });
    this._renderAITab('write');
  },

  _renderAITab(tab) {
    const container = document.getElementById('wr-ai-tab-content');
    if (!container) return;
    const ta = document.getElementById('wr-editor');
    const selectedText = ta ? ta.value.substring(ta.selectionStart, ta.selectionEnd) : '';
    const chapterContent = ta ? ta.value : '';

    switch (tab) {
      case 'write':
        container.innerHTML = `
  <div style="margin-bottom:6px">
    <select id="wr-ai-write-model" class="tool-input" style="width:100%;font-size:11px"></select>
  </div>
  <div style="margin-bottom:6px">
    <select id="wr-ai-write-style" class="tool-input" style="width:100%;font-size:11px">
      <option value="">📝 选择写作方向（可选）</option>
    </select>
  </div>
  <div style="margin-bottom:6px">
    <textarea id="wr-ai-write-input" class="tool-textarea" style="width:100%;height:60px;font-size:11px;resize:vertical" placeholder="写作提示：续写/改写/新段落的方向...">${this._esc(selectedText || '')}</textarea>
  </div>
  <div style="margin-bottom:6px">
    <input type="text" id="wr-ai-write-extra" class="tool-input" style="width:100%;font-size:11px" placeholder="额外要求（选填）">
  </div>
  <div style="display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap">
    <button class="btn btn-sm" id="wr-ai-write-gen" style="flex:1">✨ 生成</button>
    <button class="btn btn-sm btn-ghost" id="wr-ai-write-continue">📝 续写</button>
    <button class="btn btn-sm btn-ghost" id="wr-ai-write-suggest">🔥 灵感</button>
  </div>
  <div id="wr-ai-write-result" style="background:var(--bg3);border:1px solid var(--border);border-radius:4px;padding:8px;font-size:11px;line-height:1.5;min-height:40px">
    <span style="color:var(--text3)">选择写作方向后点击生成...</span>
  </div>
  <div id="wr-ai-write-actions" style="display:none;margin-top:4px;gap:4px;flex-wrap:wrap">
    <button class="btn btn-sm" onclick="writingManager._insertAIText()">📋 插入</button>
    <button class="btn btn-sm btn-ghost" onclick="writingManager._renderAITab('write')">⟳ 重试</button>
    <button class="btn btn-sm btn-ghost" onclick="writingManager.copyToClipboard()">📋 复制</button>
  </div>`;
        const msel = document.getElementById('wr-ai-write-model');
        if (msel && this._models) {
          Object.entries(this._models).forEach(([key, m]) => {
            const opt = document.createElement('option');
            opt.value = key; opt.textContent = m.emoji + ' ' + m.name;
            msel.appendChild(opt);
          });
        }
        const ssel = document.getElementById('wr-ai-write-style');
        if (ssel && this._prompts) {
          this._prompts.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id; opt.textContent = p.title;
            ssel.appendChild(opt);
          });
        }
        const genBtn = document.getElementById('wr-ai-write-gen');
        if (genBtn) genBtn.onclick = () => this._aiWriteGenerate();
        const contBtn = document.getElementById('wr-ai-write-continue');
        if (contBtn) contBtn.onclick = () => {
          const inp = document.getElementById('wr-ai-write-input');
          if (inp && chapterContent) inp.value = '续写后面的剧情：' + chapterContent.slice(-300);
          this._aiWriteGenerate();
        };
        const sugBtn = document.getElementById('wr-ai-write-suggest');
        if (sugBtn) sugBtn.onclick = () => {
          const inp = document.getElementById('wr-ai-write-input');
          if (inp && chapterContent) inp.value = '根据前文生成后续剧情的几个不同方向，每个方向50字说明';
          this._aiWriteGenerate();
        };
        break;

      case 'outline':
        container.innerHTML = `
  <div style="margin-bottom:6px">
    <select id="wr-ai-outline-model" class="tool-input" style="width:100%;font-size:11px"></select>
  </div>
  <div style="margin-bottom:6px">
    <input type="text" id="wr-ai-outline-title" class="tool-input" style="width:100%;font-size:11px" placeholder="本章标题（选填）" value="${this._esc(this._activeChapter?.title || '')}">
  </div>
  <div style="margin-bottom:6px">
    <textarea id="wr-ai-outline-plot" class="tool-textarea" style="width:100%;height:80px;font-size:11px;resize:vertical" placeholder="本章剧情要点（可选）"></textarea>
  </div>
  <div style="margin-bottom:6px">
    <div style="font-size:10px;color:var(--text3);margin-bottom:3px">📐 结构类型</div>
    <div style="display:flex;gap:4px;flex-wrap:wrap">
      <label style="font-size:10px;display:flex;align-items:center;gap:2px"><input type="radio" name="outline-type" value="standard" checked> 标准三段</label>
      <label style="font-size:10px;display:flex;align-items:center;gap:2px"><input type="radio" name="outline-type" value="detailed"> 详细分段</label>
      <label style="font-size:10px;display:flex;align-items:center;gap:2px"><input type="radio" name="outline-type" value="conflict"> 冲突推进</label>
    </div>
  </div>
  <button class="btn btn-sm" id="wr-ai-outline-gen" style="width:100%">📋 生成章纲</button>
  <div id="wr-ai-outline-result" style="margin-top:6px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;padding:8px;font-size:11px;line-height:1.5;min-height:30px"></div>`;
        const omsel = document.getElementById('wr-ai-outline-model');
        if (omsel && this._models) {
          Object.entries(this._models).forEach(([key, m]) => {
            const opt = document.createElement('option');
            opt.value = key; opt.textContent = m.emoji + ' ' + m.name;
            omsel.appendChild(opt);
          });
        }
        const ogBtn = document.getElementById('wr-ai-outline-gen');
        if (ogBtn) ogBtn.onclick = () => this._generateOutlineAI();
        break;

      case 'polish':
        container.innerHTML = `
  <div style="margin-bottom:6px">
    <select id="wr-ai-polish-model" class="tool-input" style="width:100%;font-size:11px"></select>
  </div>
  <div style="margin-bottom:6px">
    <div style="font-size:10px;color:var(--text3);margin-bottom:3px">🎯 润色模式</div>
    <div style="display:flex;gap:4px;flex-wrap:wrap">
      <label style="font-size:10px;display:flex;align-items:center;gap:2px"><input type="radio" name="polish-mode" value="polish" checked> 通用润色</label>
      <label style="font-size:10px;display:flex;align-items:center;gap:2px"><input type="radio" name="polish-mode" value="ai-polish"> 去AI味</label>
      <label style="font-size:10px;display:flex;align-items:center;gap:2px"><input type="radio" name="polish-mode" value="expand"> 扩写</label>
      <label style="font-size:10px;display:flex;align-items:center;gap:2px"><input type="radio" name="polish-mode" value="condense"> 缩写</label>
    </div>
  </div>
  <div id="wr-ai-polish-target" style="margin-bottom:6px">
    <div style="font-size:10px;color:var(--text3);margin-bottom:2px">📄 待处理文本</div>
    <div style="font-size:10px;background:var(--bg);padding:6px;border-radius:4px;max-height:80px;overflow-y:auto;word-break:break-all">${this._esc(selectedText || chapterContent.slice(0, 500) || '（编辑器为空，请在编辑器中输入内容）')}</div>
  </div>
  <div style="margin-bottom:6px">
    <input type="text" id="wr-ai-polish-focus" class="tool-input" style="width:100%;font-size:11px" placeholder="重点关注（选填：对话/描写/节奏/...）">
  </div>
  <button class="btn btn-sm" id="wr-ai-polish-gen" style="width:100%">✨ 执行润色</button>
  <div id="wr-ai-polish-result" style="margin-top:6px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;padding:8px;font-size:11px;line-height:1.5;min-height:30px"></div>
  <div id="wr-ai-polish-actions" style="display:none;margin-top:4px;gap:4px;flex-wrap:wrap">
    <button class="btn btn-sm" onclick="writingManager._insertAIText()">📋 插入</button>
    <button class="btn btn-sm btn-ghost" onclick="writingManager._renderAITab('polish')">⟳ 重试</button>
  </div>`;
        const pmsel = document.getElementById('wr-ai-polish-model');
        if (pmsel && this._models) {
          Object.entries(this._models).forEach(([key, m]) => {
            const opt = document.createElement('option');
            opt.value = key; opt.textContent = m.emoji + ' ' + m.name;
            pmsel.appendChild(opt);
          });
        }
        const pgBtn = document.getElementById('wr-ai-polish-gen');
        if (pgBtn) pgBtn.onclick = () => this._aiPolishGenerate();
        break;

      case 'chat':
        container.innerHTML = `
  <div style="margin-bottom:6px">
    <select id="wr-ai-chat-model" class="tool-input" style="width:100%;font-size:11px"></select>
  </div>
  <div id="wr-ai-chat-messages" style="flex:1;overflow-y:auto;margin-bottom:6px;background:var(--bg);border-radius:4px;padding:6px;min-height:120px;max-height:260px;font-size:11px;line-height:1.5">
    <div style="text-align:center;color:var(--text3);padding:20px 0">💬 与AI助手对话<br><span style="font-size:10px">可以问写作建议、剧情构思、角色分析</span></div>
  </div>
  <div style="display:flex;gap:4px">
    <textarea id="wr-ai-chat-input" class="tool-textarea" style="flex:1;font-size:11px;resize:none;height:36px" placeholder="输入消息..." onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();writingManager._aiChatSend()}"></textarea>
    <button class="btn btn-sm" id="wr-ai-chat-send" style="padding:4px 10px">发送</button>
  </div>
  <div id="wr-ai-chat-insert-area" style="margin-top:4px;display:none;gap:4px;flex-wrap:wrap">
    <button class="btn btn-sm" onclick="writingManager._insertAIText()">📋 插入到编辑器</button>
    <button class="btn btn-sm btn-ghost" onclick="document.getElementById('wr-ai-chat-insert-area').style.display='none'">✕</button>
  </div>`;
        const cmsel = document.getElementById('wr-ai-chat-model');
        if (cmsel && this._models) {
          Object.entries(this._models).forEach(([key, m]) => {
            const opt = document.createElement('option');
            opt.value = key; opt.textContent = m.emoji + ' ' + m.name;
            cmsel.appendChild(opt);
          });
        }
        document.getElementById('wr-ai-chat-send').onclick = () => this._aiChatSend();
        this._chatMessages = [];
        break;
    }
  },

  // ─── 写作生成 ───

  async _aiWriteGenerate() {
    const rdiv = document.getElementById('wr-ai-write-result');
    const adiv = document.getElementById('wr-ai-write-actions');
    if (!rdiv) return;
    const ta = document.getElementById('wr-editor');
    const promptId = document.getElementById('wr-ai-write-style')?.value;
    const modelVersion = document.getElementById('wr-ai-write-model')?.value || 'atmosphere';
    const input = document.getElementById('wr-ai-write-input')?.value?.trim() || '';
    const extra = document.getElementById('wr-ai-write-extra')?.value?.trim() || '';

    if (!input) { rdiv.innerHTML = '<span style="color:var(--red)">请输入写作提示或选择文本</span>'; return; }

    rdiv.innerHTML = '<span style="color:var(--text3)">⏳ 思考中...</span>';
    if (adiv) adiv.style.display = 'none';

    const contextPrefix = ta && ta.value ? '以下是当前章节内容（仅供参考，不要重复）：\n' + ta.value.slice(-800) + '\n\n---\n\n' : '';
    const r = await this.api('POST', '/api/writing/ai/generate', {
      promptId: promptId || undefined,
      userInput: contextPrefix + input,
      extra: extra || '输出流畅的中文正文，不要解释你的思考过程，直接输出内容。',
      modelVersion
    });

    if (r.success) {
      this._lastGenerated = r.content;
      rdiv.innerHTML = this._nl2br(r.content);
      if (adiv) adiv.style.display = 'flex';
    } else {
      rdiv.innerHTML = '<span style="color:var(--red)">❌ ' + (r.error || '生成失败') + '</span>';
    }
  },

  async _generateOutlineAI() {
    const rdiv = document.getElementById('wr-ai-outline-result');
    if (!rdiv) return;
    const ta = document.getElementById('wr-editor');
    const title = document.getElementById('wr-ai-outline-title')?.value || this._activeChapter?.title || '未命名';
    const plot = document.getElementById('wr-ai-outline-plot')?.value || '';
    const type = document.querySelector('input[name="outline-type"]:checked')?.value || 'standard';
    const model = document.getElementById('wr-ai-outline-model')?.value || 'atmosphere';

    const context = ta?.value ? ta.value.slice(-400) : '';
    const typeDesc = { standard: '标准三段式（起承转合）', detailed: '详细分段（每段100-200字描述）', conflict: '冲突推进（矛盾-升级-解决）' }[type] || type;

    rdiv.innerHTML = '<span style="color:var(--text3)">⏳ 生成中...</span>';
    const prompt = '请为一章小说生成章纲。\n章节标题：' + title + '\n类型：' + typeDesc + '\n' +
      (plot ? '剧情要点：' + plot + '\n' : '') +
      (context ? '前文摘要：' + context + '\n' : '') +
      '\n输出格式：直接用段落描述每节内容，每节用【节X】标注。字数200-500字。';

    const r = await this.api('POST', '/api/writing/ai/generate', {
      userInput: prompt,
      extra: '直接输出章纲内容，不要附加说明。',
      modelVersion: model
    });

    if (r.success) {
      rdiv.innerHTML = '<div style="margin-bottom:4px;font-weight:600;font-size:12px">📋 ' + this._esc(title) + ' 章纲</div>' + this._nl2br(r.content);
    } else {
      rdiv.innerHTML = '<span style="color:var(--red)">❌ ' + (r.error || '生成失败') + '</span>';
    }
  },

  async _aiPolishGenerate() {
    const rdiv = document.getElementById('wr-ai-polish-result');
    const adiv = document.getElementById('wr-ai-polish-actions');
    if (!rdiv) return;
    const mode = document.querySelector('input[name="polish-mode"]:checked')?.value || 'polish';
    const model = document.getElementById('wr-ai-polish-model')?.value || 'atmosphere';
    const focus = document.getElementById('wr-ai-polish-focus')?.value?.trim() || '';
    const ta = document.getElementById('wr-editor');
    const text = ta ? ta.value.substring(ta.selectionStart, ta.selectionEnd) || ta.value.slice(0, 1000) : '';

    if (!text) { rdiv.innerHTML = '<span style="color:var(--red)">请先在编辑器中输入或选中文本</span>'; return; }

    rdiv.innerHTML = '<span style="color:var(--text3)">⏳ 正在' + { polish: '润色', 'ai-polish': '去AI味', expand: '扩写', condense: '缩写' }[mode] + '中...</span>';
    if (adiv) adiv.style.display = 'none';

    const modeDesc = {
      polish: '润色以下文本：修正语病、优化表达、保持原文风格。',
      'ai-polish': '去掉AI生成痕迹：减少冗余修饰、让语言更自然、去掉过渡词和模板化表达。',
      expand: '扩写以下文本：丰富细节描写、增加感官体验、扩展对话和动作。',
      condense: '缩写以下文本：保留核心信息、精简修饰语、压缩到最短。'
    }[mode];

    const r = await this.api('POST', '/api/writing/ai/polish-ai', {
      text,
      mode,
      focus: focus || undefined,
      extra: modeDesc + (focus ? '重点关注：' + focus : '')
    });

    if (r.success) {
      this._lastGenerated = r.content;
      rdiv.innerHTML = this._nl2br(r.content);
      if (adiv) adiv.style.display = 'flex';
    } else {
      rdiv.innerHTML = '<span style="color:var(--red)">❌ ' + (r.error || '处理失败') + '</span>';
    }
  },

  // ─── AI 对话 ───

  _chatMessages: [],

  async _aiChatSend() {
    const input = document.getElementById('wr-ai-chat-input');
    const msgs = document.getElementById('wr-ai-chat-messages');
    if (!input || !msgs || !input.value.trim()) return;

    const msg = input.value.trim();
    input.value = '';
    if (!this._chatMessages) this._chatMessages = [];

    this._chatMessages.push({ role: 'user', content: msg });
    msgs.innerHTML = this._chatMessages.map(m =>
      '<div style="margin-bottom:4px;display:flex;flex-direction:' + (m.role === 'user' ? 'row-reverse' : 'row') + ';gap:4px">' +
        '<div style="background:' + (m.role === 'user' ? 'var(--accent)' : 'var(--bg)') + ';color:' + (m.role === 'user' ? '#fff' : 'var(--text)') + ';padding:4px 8px;border-radius:8px;max-width:80%;font-size:11px;line-height:1.4">' +
          this._nl2br(m.content) +
        '</div>' +
      '</div>'
    ).join('');
    msgs.scrollTop = msgs.scrollHeight;

    msgs.innerHTML += '<div style="text-align:center;color:var(--text3);font-size:10px;padding:4px">AI思考中...</div>';
    msgs.scrollTop = msgs.scrollHeight;

    const ta = document.getElementById('wr-editor');
    const chapterContext = ta?.value ? ta.value.slice(0, 600) : '';

    // Build conversation context from chat history (backend expects simple message + context pattern)
    const history = this._chatMessages.slice(0, -1); // exclude the just-added message
    const contextText = history.length > 0
      ? '对话历史：\n' + history.map(m => (m.role === 'user' ? '用户' : '助手') + '：' + m.content).join('\n\n')
      + (chapterContext ? '\n\n当前章节：' + chapterContext : '')
      : (chapterContext ? '当前章节：' + chapterContext : '');

    const r = await this.api('POST', '/api/writing/ai/chat', {
      message: msg,
      context: contextText || undefined,
      modelVersion: document.getElementById('wr-ai-chat-model')?.value || 'atmosphere'
    });

    if (r.success) {
      this._chatMessages.push({ role: 'assistant', content: r.content });
      this._lastGenerated = r.content;
      msgs.innerHTML = this._chatMessages.map(m =>
        '<div style="margin-bottom:4px;display:flex;flex-direction:' + (m.role === 'user' ? 'row-reverse' : 'row') + ';gap:4px">' +
          '<div style="background:' + (m.role === 'user' ? 'var(--accent)' : 'var(--bg)') + ';color:' + (m.role === 'user' ? '#fff' : 'var(--text)') + ';padding:4px 8px;border-radius:8px;max-width:80%;font-size:11px;line-height:1.4;white-space:pre-wrap;word-break:break-word">' +
            this._esc(m.content) +
          '</div>' +
        '</div>'
      ).join('');
      const ia = document.getElementById('wr-ai-chat-insert-area');
      if (ia) ia.style.display = 'flex';
    } else {
      msgs.innerHTML += '<div style="color:var(--red);font-size:10px">❌ ' + (r.error || '对话失败') + '</div>';
    }
    msgs.scrollTop = msgs.scrollHeight;
  },

  _insertAIText() {
    const ta = document.getElementById('wr-editor');
    if (!ta || !this._lastGenerated) return;
    const pos = ta.selectionStart;
    ta.value = ta.value.slice(0, pos) + '\n' + this._lastGenerated + '\n' + ta.value.slice(ta.selectionEnd);
    this._updateWordCount();
    const rdivs = ['wr-ai-write-result', 'wr-ai-polish-result'];
    rdivs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<span style="color:var(--green);font-size:10px">✅ 已插入到编辑器</span>';
    });
  },

  // ═══════════════════════════════════════════════════════════════
  // 章节预测
  // ═══════════════════════════════════════════════════════════════

  async predictNextChapter() {
    const pdiv = document.getElementById('wr-predict-result');
    const btn = document.getElementById('wr-ai-predict');
    if (!pdiv) return;
    if (btn) btn.textContent = '⏳ 预测中...';

    const ta = document.getElementById('wr-editor');
    const recentText = ta ? ta.value.slice(-800) : '';
    const pid = this._project?.id;

    let context = '';
    if (pid) {
      try {
        const dna = await this.api('GET', '/api/writing/engine/dna/' + pid);
        if (dna) context = JSON.stringify(dna);
      } catch (e) {}
    }

    const r = await this.api('POST', '/api/writing/engine/predict', {
      projectId: pid,
      recentText,
      context: context || undefined
    });

    if (r.success) {
      pdiv.innerHTML =
        '<div style="font-size:11px;font-weight:600;margin-bottom:4px">🔮 下一章预测</div>' +
        '<div style="font-size:11px;line-height:1.6;white-space:pre-wrap;background:var(--bg);padding:8px;border-radius:4px">' + this._esc(r.content) + '</div>' +
        '<div style="display:flex;gap:4px;margin-top:4px">' +
          '<button class="btn btn-sm" onclick="writingManager.predictNextChapter()">⟳ 重新预测</button>' +
          '<button class="btn btn-sm btn-ghost" onclick="writingManager.copyToClipboard()">📋 复制</button>' +
        '</div>';
      this._lastGenerated = r.content;
    } else {
      pdiv.innerHTML = '<span style="color:var(--red);font-size:11px">❌ ' + (r.error || '预测失败') + '</span>';
    }
    if (btn) btn.textContent = '🔮 预测下一章';
  },

  _showEditorPredict() {
    const overlay = document.createElement('div');
    overlay.id = 'wr-editor-predict-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center';
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

    const ta = document.getElementById('wr-editor');
    const recentText = ta ? ta.value.slice(-1500) : '';

    overlay.innerHTML = [
      '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;width:600px;max-width:90vw;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.3)">',
      '  <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border)">',
      '    <span style="font-size:14px;font-weight:600">\u{1F52E} 章节预测</span>',
      '    <span style="font-size:10px;color:var(--text3)">基于当前内容预测后续剧情</span>',
      '    <span style="flex:1"></span>',
      '    <button class="btn-icon" onclick="this.parentElement.parentElement.parentElement.remove()" style="font-size:12px">\u2715</button>',
      '  </div>',
      '  <div style="padding:10px;overflow-y:auto">',
      '    <div style="font-size:10px;color:var(--text3);margin-bottom:6px">\u{1F4C4} 参考内容（' + (recentText.length || 0) + '字）：</div>',
      '    <div style="font-size:10px;background:var(--bg);padding:6px;border-radius:4px;max-height:80px;overflow-y:auto;margin-bottom:10px">' + this._esc(recentText.slice(-500) || '（编辑器为空）') + '</div>',
      '    <div id="wr-editor-predict-result" style="font-size:11px;line-height:1.6;min-height:40px">',
      '      <span style="color:var(--text3)">点击下方按钮预测后续剧情...</span>',
      '    </div>',
      '    <div style="display:flex;gap:4px;margin-top:8px">',
      '      <button class="btn btn-sm" id="wr-editor-predict-go" style="flex:1">\u{1F52E} 预测</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n');
    document.body.appendChild(overlay);

    document.getElementById('wr-editor-predict-go').onclick = async () => {
      const rdiv = document.getElementById('wr-editor-predict-result');
      if (!rdiv || !ta) return;
      rdiv.innerHTML = '<span style="color:var(--text3)">\u23F3 分析中...</span>';
      const r = await this.api('POST', '/api/writing/engine/predict', {
        recentText: ta.value.slice(-1500),
        projectId: this._project?.id
      });
      if (r.success) {
        this._lastGenerated = r.content;
        rdiv.innerHTML = '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:10px;white-space:pre-wrap;font-size:11px;line-height:1.6">' + this._esc(r.content) + '</div>' +
          '<div style="margin-top:4px;display:flex;gap:4px">' +
            '<button class="btn btn-sm" onclick="writingManager._insertAIText()">\u{1F4CB} 插入</button>' +
            '<button class="btn btn-sm btn-ghost" onclick="this.parentElement.parentElement.parentElement.parentElement.remove()">\u2715</button>' +
          '</div>';
      } else {
        rdiv.innerHTML = '<span style="color:var(--red)">\u274C ' + (r.error || '预测失败') + '</span>';
      }
    };
  },

  // 版本管理 — 快照
  // ═══════════════════════════════════════════════════════════════

  async showSnapshots() {
    const pid = this._project?.id;
    if (!pid) return;
    const overlay = document.createElement('div');
    overlay.id = 'wr-snap-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center';
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `
<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;width:700px;max-width:90vw;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.3)">
  <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border)">
    <span style="font-size:14px;font-weight:600">📸 版本快照</span>
    <span style="font-size:10px;color:var(--text3)">保存和恢复章节草稿</span>
    <span style="flex:1"></span>
    <button class="btn btn-sm" id="wr-snap-new">+ 创建快照</button>
    <button class="btn-icon" onclick="this.closest('#wr-snap-overlay').remove()" style="font-size:12px">✕</button>
  </div>
  <div id="wr-snap-list" style="flex:1;overflow-y:auto;padding:8px">
    <div style="text-align:center;padding:20px;color:var(--text3);font-size:11px">⏳ 加载中...</div>
  </div>
</div>`;
    document.body.appendChild(overlay);

    document.getElementById('wr-snap-new').onclick = async () => {
      const ta = document.getElementById('wr-editor');
      const chId = this._activeChapter?.id;
      if (!ta || !chId) { alert('请先打开一个章节'); return; }
      const name = prompt('快照名称（可选）：') || ('快照 ' + new Date().toLocaleTimeString());
      await this.api('POST', '/api/writing/snapshot/' + chId, {
        content: ta.value,
        name
      });
      this._refreshSnapList();
    };

    this._refreshSnapList();
  },

  async _refreshSnapList() {
    const list = document.getElementById('wr-snap-list');
    if (!list) return;
    const chId = this._activeChapter?.id;
    if (!chId) { list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);font-size:11px">请先选择章节</div>'; return; }

    try {
      const snaps = await this.api('GET', '/api/writing/snapshots/' + chId + '?projectId=' + (this._project?.id || ''));
      const arr = Array.isArray(snaps) ? snaps : [];
      if (!arr.length) {
        list.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3);font-size:11px">暂无快照<br><span style="font-size:10px">编辑内容后点击"创建快照"保存进度</span></div>';
        return;
      }
      list.innerHTML = arr.map((s, i) => `
<div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:4px;display:flex;align-items:center;gap:8px">
  <span style="font-size:10px;color:var(--text3);min-width:24px">#${arr.length - i}</span>
  <div style="flex:1">
    <div style="font-size:11px;font-weight:500">${this._esc(s.name || '无名称')}</div>
    <div style="font-size:9px;color:var(--text3)">${s.createdAt ? new Date(s.createdAt).toLocaleString() : ''} · ${(s.content?.length || 0)}字</div>
  </div>
  <button class="wr-ai-btn" onclick="writingManager._restoreSnapshot('${s.id}')" title="恢复此版本">📂</button>
  <button class="wr-ai-btn" onclick="writingManager._deleteSnapshot('${s.id}')" title="删除">🗑️</button>
</div>`).join('');
    } catch (e) {
      list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--red);font-size:11px">加载失败</div>';
    }
  },

  async _restoreSnapshot(id) {
    if (!confirm('恢复快照将替换当前编辑器内容，确定？')) return;
    try {
      const res = await this.api('POST', '/api/writing/snapshot/' + id + '/restore', { projectId: this._project?.id });
    const s = res?.chapter || res?.snapshot || res;
      if (s?.content) {
        const ta = document.getElementById('wr-editor');
        if (ta) { ta.value = s.content; this._updateWordCount(); }
        this._refreshSnapList();
      }
    } catch (e) { alert('恢复失败'); }
  },

  async _deleteSnapshot(id) {
    if (!confirm('删除此快照？')) return;
    await this.api('DELETE', '/api/writing/snapshot/' + id);
    this._refreshSnapList();
  },

  // ═══════════════════════════════════════════════════════════════
  // 编辑器调整大小
  // ═══════════════════════════════════════════════════════════════

  initEditorResize() {
    const sidebar = document.getElementById('wr-chapter-panel');
    const editorArea = document.getElementById('wr-editor-area');
    const aiPanel = document.querySelector('.wr-ai-panel');
    if (!sidebar || !editorArea) return;

    setTimeout(() => {
      const savedWidth = localStorage.getItem('wr_chapter_width');
      if (savedWidth) {
        sidebar.style.width = savedWidth;
        sidebar.style.flex = '0 0 ' + savedWidth;
        sidebar.style.minWidth = '0';
      }
      const savedAi = localStorage.getItem('wr_ai_width');
      if (savedAi && aiPanel) {
        aiPanel.style.width = savedAi;
        aiPanel.style.flex = '0 0 ' + savedAi;
      }
    }, 50);

    // Create drag handle if it doesn't exist
    if (!document.querySelector('.wr-sidebar-resizer')) {
      const handle = document.createElement('div');
      handle.className = 'wr-sidebar-resizer';
      handle.style.cssText = 'width:4px;cursor:col-resize;background:transparent;flex-shrink:0;position:relative;z-index:10';
      handle.onmouseover = () => handle.style.background = 'var(--accent)';
      handle.onmouseout = () => handle.style.background = 'transparent';
      sidebar.parentNode.insertBefore(handle, sidebar.nextSibling);

      let startX, startW;
      handle.onmousedown = e => {
        startX = e.clientX;
        startW = sidebar.offsetWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        const onMove = (ev) => {
          const w = Math.max(100, Math.min(400, startW + (ev.clientX - startX)));
          sidebar.style.width = w + 'px';
          sidebar.style.flex = '0 0 ' + w + 'px';
        };
        const onUp = () => {
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          localStorage.setItem('wr_chapter_width', sidebar.style.width);
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      };
    }

    if (aiPanel) {
      const savedAI = localStorage.getItem('wr_ai_visible');
      if (savedAI === 'true') {
        aiPanel.dataset.collapsed = 'false';
        aiPanel.style.width = localStorage.getItem('wr_ai_width') || '340px';
        aiPanel.style.borderLeft = '1px solid var(--border)';
        aiPanel.style.overflow = '';
        const content = document.getElementById('wr-ai-content');
        if (content) content.style.display = 'block';
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // 创意工具箱 — 详细工具处理
  // ═══════════════════════════════════════════════════════════════

  showTool(tool) {
    const div = document.getElementById('wr-tool-content');
    if (!div) return;

    if (tool === 'name-generator') {
      this._showNameGenerator();
    } else if (tool === 'quick-prompt') {
      this._showQuickPrompts();
    } else if (tool === 'text-tools') {
      this._showTextTools();
    } else if (tool === 'detail-outline') {
      this._showDetailOutline();
    } else if (tool === 'ai-chat') {
      this._showToolAIChat();
    } else if (tool === 'predict') {
      this._showToolPredict();
    } else if (tool === 'prompt-library') {
      this.showPromptLibrary();
    }
  },

  async _showDetailOutline() {
    const div = document.getElementById('wr-tool-content');
    if (!div) return;
    div.innerHTML = `
<div style="font-size:12px;font-weight:600;margin-bottom:6px">📋 详细大纲生成</div>
<div style="margin-bottom:6px">
  <select id="wr-tool-outline-model" class="tool-input" style="width:100%;font-size:11px"></select>
</div>
<div style="margin-bottom:6px">
  <input type="text" id="wr-tool-outline-name" class="tool-input" style="width:100%;font-size:11px" placeholder="项目名称（选填）">
</div>
<div style="margin-bottom:6px">
  <textarea id="wr-tool-outline-input" class="tool-textarea" style="width:100%;height:100px;font-size:11px;resize:vertical" placeholder="输入小说构思：世界观、主线、角色等..."></textarea>
</div>
<div style="display:flex;gap:4px;margin-bottom:6px">
  <select id="wr-tool-outline-genre" class="tool-input" style="flex:1;font-size:11px">
    <option value="">📖 类型</option>
    <option value="都市">都市</option><option value="玄幻">玄幻</option><option value="仙侠">仙侠</option>
    <option value="科幻">科幻</option><option value="悬疑">悬疑</option><option value="言情">言情</option>
    <option value="奇幻">奇幻</option><option value="历史">历史</option>
  </select>
  <input type="number" id="wr-tool-outline-chapters" class="tool-input" style="flex:0.3;font-size:11px;min-width:50px" placeholder="章节数" value="5" min="1" max="30">
</div>
<button class="btn btn-sm" id="wr-tool-outline-gen" style="width:100%">🤖 生成详细大纲</button>
<div id="wr-tool-outline-result" style="margin-top:8px;font-size:11px;line-height:1.6"></div>`;
    const msel = document.getElementById('wr-tool-outline-model');
    if (msel && this._models) {
      Object.entries(this._models).forEach(([key, m]) => {
        const opt = document.createElement('option');
        opt.value = key; opt.textContent = m.emoji + ' ' + m.name;
        msel.appendChild(opt);
      });
    }
    document.getElementById('wr-tool-outline-gen').onclick = () => this._generateDetailOutline();
  },

  async _generateDetailOutline() {
    const rdiv = document.getElementById('wr-tool-outline-result');
    if (!rdiv) return;
    const input = document.getElementById('wr-tool-outline-input')?.value?.trim();
    if (!input) { rdiv.innerHTML = '<span style="color:var(--red)">请输入小说构思</span>'; return; }

    rdiv.innerHTML = '<span style="color:var(--text3)">⏳ 正在生成详细大纲...</span>';
    const name = document.getElementById('wr-tool-outline-name')?.value || '';
    const genre = document.getElementById('wr-tool-outline-genre')?.value || '';
    const chapters = parseInt(document.getElementById('wr-tool-outline-chapters')?.value) || 5;
    const model = document.getElementById('wr-tool-outline-model')?.value || 'atmosphere';

    const r = await this.api('POST', '/api/writing/ai/generate', {
      userInput: '请为一部小说生成详细大纲。\n' +
        (name ? '书名：' + name + '\n' : '') +
        (genre ? '类型：' + genre + '\n' : '') +
        '章节数：' + chapters + '章\n' +
        '构思：' + input + '\n\n' +
        '请输出：\n1. 故事概要（200字）\n2. 核心设定（100字）\n3. 主要角色介绍（每人50字）\n4. 分章大纲（每章100-150字）\n5. 主线走向（100字）',
      extra: '结构化输出，用标题分段。',
      modelVersion: model
    });

    if (r.success) {
      rdiv.innerHTML = '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:10px;white-space:pre-wrap">' + this._esc(r.content) + '</div>' +
        '<div style="margin-top:4px;display:flex;gap:4px">' +
          '<button class="btn btn-sm" onclick="writingManager.copyToClipboard()">📋 复制</button>' +
          '<button class="btn btn-sm btn-ghost" onclick="writingManager._generateDetailOutline()">⟳ 重试</button>' +
        '</div>';
      this._lastGenerated = r.content;
    } else {
      rdiv.innerHTML = '<span style="color:var(--red)">❌ ' + (r.error || '生成失败') + '</span>';
    }
  },

  _showToolAIChat() {
    const div = document.getElementById('wr-tool-content');
    if (!div) return;
    div.innerHTML = `
<div style="font-size:12px;font-weight:600;margin-bottom:6px">💬 AI 创意助手</div>
<div style="margin-bottom:6px">
  <select id="wr-tool-chat-model" class="tool-input" style="width:100%;font-size:11px"></select>
</div>
<div id="wr-tool-chat-msgs" style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:6px;min-height:120px;max-height:300px;overflow-y:auto;font-size:11px;line-height:1.5;margin-bottom:6px">
  <div style="text-align:center;color:var(--text3);padding:20px">问写作技巧、剧情设计、角色塑造...</div>
</div>
<div style="display:flex;gap:4px">
  <textarea id="wr-tool-chat-input" class="tool-textarea" style="flex:1;font-size:11px;resize:none;height:36px" placeholder="输入问题..." onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();writingManager._toolChatSend()}"></textarea>
  <button class="btn btn-sm" onclick="writingManager._toolChatSend()">发送</button>
</div>`;
    this._toolChatMessages = [];
    const msel = document.getElementById('wr-tool-chat-model');
    if (msel && this._models) {
      Object.entries(this._models).forEach(([key, m]) => {
        const opt = document.createElement('option');
        opt.value = key; opt.textContent = m.emoji + ' ' + m.name;
        msel.appendChild(opt);
      });
    }
  },

  _toolChatMessages: [],

  async _toolChatSend() {
    const input = document.getElementById('wr-tool-chat-input');
    const msgs = document.getElementById('wr-tool-chat-msgs');
    if (!input || !msgs || !input.value.trim()) return;

    const msg = input.value.trim();
    input.value = '';
    if (!this._toolChatMessages) this._toolChatMessages = [];

    this._toolChatMessages.push({ role: 'user', content: msg });
    msgs.innerHTML = this._toolChatMessages.map(m =>
      '<div style="margin-bottom:4px;display:flex;flex-direction:' + (m.role === 'user' ? 'row-reverse' : 'row') + ';gap:4px">' +
        '<div style="background:' + (m.role === 'user' ? 'var(--accent)' : 'var(--bg3)') + ';color:' + (m.role === 'user' ? '#fff' : 'var(--text)') + ';padding:4px 8px;border-radius:8px;max-width:80%;font-size:11px;line-height:1.4;white-space:pre-wrap">' +
          this._esc(m.content) +
        '</div>' +
      '</div>'
    ).join('') + '<div style="text-align:center;color:var(--text3);font-size:10px;padding:4px">⏳ AI回复中...</div>';
    msgs.scrollTop = msgs.scrollHeight;

    const history = this._toolChatMessages.slice(0, -1);
    const contextText = history.length > 0
      ? '对话历史：\n' + history.map(m => (m.role === 'user' ? '用户' : '助手') + '：' + m.content).join('\n\n')
      : '';
    const r = await this.api('POST', '/api/writing/ai/chat', {
      message: msg,
      context: contextText || undefined,
      modelVersion: document.getElementById('wr-tool-chat-model')?.value || 'atmosphere'
    });

    msgs.querySelector(':last-child')?.remove();

    if (r.success) {
      this._toolChatMessages.push({ role: 'assistant', content: r.content });
      msgs.innerHTML = this._toolChatMessages.map(m =>
        '<div style="margin-bottom:4px;display:flex;flex-direction:' + (m.role === 'user' ? 'row-reverse' : 'row') + ';gap:4px">' +
          '<div style="background:' + (m.role === 'user' ? 'var(--accent)' : 'var(--bg3)') + ';color:' + (m.role === 'user' ? '#fff' : 'var(--text)') + ';padding:4px 8px;border-radius:8px;max-width:80%;font-size:11px;line-height:1.4;white-space:pre-wrap">' +
            this._esc(m.content) +
          '</div>' +
        '</div>'
      ).join('');
    } else {
      msgs.innerHTML += '<div style="color:var(--red);font-size:10px">❌ ' + (r.error || '请求失败') + '</div>';
    }
    msgs.scrollTop = msgs.scrollHeight;
  },

  _showToolPredict() {
    const div = document.getElementById('wr-tool-content');
    if (!div) return;
    div.innerHTML = `
<div style="font-size:12px;font-weight:600;margin-bottom:6px">🔮 AI 章节预测</div>
<div style="font-size:10px;color:var(--text3);margin-bottom:6px">基于当前写作内容，预测下一章的剧情走向</div>
<div style="margin-bottom:6px">
  <textarea id="wr-tool-predict-input" class="tool-textarea" style="width:100%;height:100px;font-size:11px;resize:vertical" placeholder="粘贴当前已完成的章节内容，AI将分析并预测后续发展..."></textarea>
</div>
<button class="btn btn-sm" id="wr-tool-predict-gen">🔮 预测</button>
<div id="wr-tool-predict-result" style="margin-top:6px;font-size:11px;line-height:1.6"></div>`;
    document.getElementById('wr-tool-predict-gen').onclick = async () => {
      const input = document.getElementById('wr-tool-predict-input')?.value?.trim();
      const rdiv = document.getElementById('wr-tool-predict-result');
      if (!input || !rdiv) return;
      rdiv.innerHTML = '<span style="color:var(--text3)">⏳ 分析中...</span>';
      const r = await this.api('POST', '/api/writing/engine/predict', {
        recentText: input.slice(-1500),
        projectId: this._project?.id
      });
      if (r.success) {
        rdiv.innerHTML = '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:10px;white-space:pre-wrap">' + this._esc(r.content) + '</div>';
      } else {
        rdiv.innerHTML = '<span style="color:var(--red)">❌ ' + (r.error || '预测失败') + '</span>';
      }
    };
  }


};
window.writingManager = writingManager;
