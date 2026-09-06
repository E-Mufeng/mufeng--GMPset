/**
 * 聚创台 · 端口工具桥接层 (tb-shim)
 * 作用：让从「工具箱」原样移植过来的前端页面（fileTools / musicManager / systemTools /
 * toolManager / writingManager / readingRoom / sysDash / scriptsManager 等）在
 * 聚创台内联环境下正常工作，且不依赖 iframe、不改动页面源码。
 *
 * 1) 全局重写 window.fetch：对所有「根相对」URL（以 / 开头、非 //）自动拼接
 *    window.__TB_BASE__（= 该工具的 baseUrl，如 http://127.0.0.1:8806）。
 *    这样页面里裸写的 fetch('/api/...')、fetch('/reading-downloads/...') 都能正确打到
 *    对应独立端口，无需逐个改源码。
 * 2) 提供 window.toolbox.api(method, endpoint, body) / .upload(endpoint, formData)
 *    契约（工具箱 app.js 定义的唯一数据调用方式）。
 * 3) 暴露 ensureCss / ensureScript 供渲染器加载样式与脚本（幂等）。
 *
 * 该脚本只读 window.__TB_BASE__，在每次工具打开（bind）时由渲染器重置，因此
 * 多个端口工具串行打开时各自独立自洽。
 */
(function () {
  if (window.__TB_SHIM__) return;
  window.__TB_SHIM__ = true;

  // 当前工具的基础地址（由渲染器每次打开时写入）
  window.__TB_BASE__ = window.__TB_BASE__ || '';
  window.__TB_TOKEN__ = window.__TB_TOKEN__ || (localStorage && localStorage.getItem ? (localStorage.getItem('jct_token') || '') : '');

  // ---- 1) 全局 fetch 前缀重写 ----
  var _fetch = window.fetch ? window.fetch.bind(window) : function () {
    return Promise.reject(new Error('fetch unavailable'));
  };
  window.fetch = function (url, opts) {
    if (typeof url === 'string') {
      if (url.indexOf('/') === 0 && url.indexOf('//') !== 0) {
        // 根相对：/api/... 或 /reading-downloads/...
        url = window.__TB_BASE__ + url;
      }
    }
    opts = opts || {};
    opts.headers = opts.headers || {};
    if (window.__TB_TOKEN__ && !(opts.headers instanceof Headers) && !opts.headers['X-Access-Token']) {
      opts.headers['X-Access-Token'] = window.__TB_TOKEN__;
    }
    return _fetch(url, opts);
  };

  // ---- 2) 工具箱 api 契约 ----
  window.toolbox = window.toolbox || {};
  window.toolbox.api = function (method, endpoint, body) {
    var m = (method || 'GET').toUpperCase();
    var opts = { method: m, headers: { 'Content-Type': 'application/json' } };
    if (window.__TB_TOKEN__) opts.headers['X-Access-Token'] = window.__TB_TOKEN__;
    if (body !== undefined && m !== 'GET' && m !== 'HEAD') {
      opts.body = (typeof body === 'string') ? body : JSON.stringify(body);
    }
    return fetch(window.__TB_BASE__ + endpoint, opts).then(function (resp) {
      var ct = resp.headers && resp.headers.get ? resp.headers.get('content-type') || '' : '';
      if (ct.indexOf('application/json') !== -1) {
        return resp.json().catch(function () { return { ok: false, error: 'json' }; });
      }
      return resp.text();
    });
  };
  window.toolbox.upload = function (endpoint, formData) {
    return fetch(window.__TB_BASE__ + endpoint, { method: 'POST', body: formData })
      .then(function (resp) { return resp.json().catch(function () { return { ok: false }; }); });
  };

  // ---- 3) 资源加载助手（幂等）----
  window.__TB_LOADED__ = window.__TB_LOADED__ || {};
  window.ensureCss = function (href) {
    return new Promise(function (res) {
      if (document.querySelector('link[href="' + href + '"]')) return res();
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = href;
      l.onload = function () { res(); };
      l.onerror = function () { res(); };
      document.head.appendChild(l);
    });
  };
  window.ensureScript = function (src) {
    return new Promise(function (res) {
      if (window.__TB_LOADED__[src]) return res();
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { window.__TB_LOADED__[src] = true; res(); };
      s.onerror = function () { console.error('[tb] 脚本加载失败:', src); res(); };
      document.body.appendChild(s);
    });
  };

  // ---- 4) 工具箱页面依赖的全局工具函数（原由父应用提供，这里补齐）----
  if (typeof window.escapeHtml !== 'function') {
    window.escapeHtml = function (s) {
      if (s == null) return '';
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };
  }
  if (typeof window.showToast !== 'function') {
    window.showToast = function (msg, type) {
      // 映射到聚创台全局 toast(msg, isError)
      var isErr = (type === 'error' || type === 'danger' || type === false);
      if (typeof window.toast === 'function') window.toast(msg, isErr);
      else console.log('[toast]', msg);
    };
  }
  if (typeof window.copyText !== 'function') {
    window.copyText = function (text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function () {});
      }
      return text;
    };
  }
  if (typeof window.formatBytes !== 'function') {
    window.formatBytes = function (b) {
      if (b == null || isNaN(b)) return '-';
      var u = ['B', 'KB', 'MB', 'GB', 'TB'];
      var i = 0; while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
      return (b.toFixed(i ? 1 : 0)) + ' ' + u[i];
    };
  }

  // ---- 5) 根相对资源 URL 重写（img/audio/source/a 的 src/href）----
  // fetch 重写只能覆盖 JS 内的 fetch()；页面动态插入的 <img src="/..."> 等需靠观察器修正。
  function fixUrlAttr(el, attr) {
    if (!el || !el.getAttribute) return;
    var v = el.getAttribute(attr);
    if (!v || v.charAt(0) !== '/' || v.indexOf('//') === 0) return;
    if (el.hasAttribute('data-tb-fixed')) return;
    el.setAttribute(attr, window.__TB_BASE__ + v);
    el.setAttribute('data-tb-fixed', '1');
  }
  function fixNodeUrls(root) {
    if (!root) return;
    if (root.nodeType === 1) {
      if (/^(IMG|AUDIO|SOURCE|VIDEO|LINK|IFRAME)$/.test(root.tagName)) {
        fixUrlAttr(root, 'src'); fixUrlAttr(root, 'href');
      }
    }
    var nodes = root.querySelectorAll ? root.querySelectorAll('img[src^="/"],audio[src^="/"],source[src^="/"],video[src^="/"],a[href^="/"],link[href^="/"]') : [];
    for (var n = 0; n < nodes.length; n++) {
      fixUrlAttr(nodes[n], 'src'); fixUrlAttr(nodes[n], 'href');
    }
  }
  window.fixNodeUrls = fixNodeUrls;
  if (typeof MutationObserver !== 'undefined') {
    var _obs = new MutationObserver(function (mutations) {
      for (var m = 0; m < mutations.length; m++) {
        var adds = mutations[m].addedNodes;
        for (var a = 0; a < adds.length; a++) fixNodeUrls(adds[a]);
      }
    });
    _obs.observe(document.body, { childList: true, subtree: true });
  }
})();
