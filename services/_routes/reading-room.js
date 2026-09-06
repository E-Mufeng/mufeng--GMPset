const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DOWNLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'downloads');
const CONFIG_FILE = path.join(DATA_DIR, 'reading-room.json');

// --- Default config ---
function getDefaultConfig() {
  return {
    categories: [
      {
        id: 'da-a',
        name: '大A',
        icon: '📈',
        paths: [],  // 由使用者自行配置扫描目录
        fileTypes: ['.md'],
        readerType: 'text',
        links: [
          { name: '东方财富网', url: 'https://www.eastmoney.com/', desc: '综合财经门户，行情/公告/研报' },
          { name: '雪球', url: 'https://xueqiu.com/', desc: '投资者社区，个股分析/讨论' },
          { name: '同花顺', url: 'https://www.10jqka.com.cn/', desc: '实时行情，技术分析' },
          { name: '巨潮资讯网', url: 'http://www.cninfo.com.cn/', desc: '指定上市公司公告平台' },
          { name: '财联社', url: 'https://www.cls.cn/', desc: '7×24快讯，电报' },
          { name: '华尔街见闻', url: 'https://wallstreetcn.com/', desc: '全球财经资讯' },
          { name: '每日经济新闻', url: 'https://www.nbd.com.cn/', desc: '深度财经报道' },
          { name: '证券时报网', url: 'https://www.stcn.com/', desc: '证券新闻/数据' },
          { name: '第一财经', url: 'https://www.yicai.com/', desc: '财经资讯/视频' },
          { name: '和讯网', url: 'https://www.hexun.com/', desc: '财经门户/个股资料' },
        ],
        dailyScan: true,
      },
      {
        id: 'novels',
        name: '小说',
        icon: '📖',
        paths: [path.join(DOWNLOADS_DIR, 'novels')],
        fileTypes: ['.txt'],
        readerType: 'text',
        links: [
          { name: '笔趣阁', url: 'https://www.biquge.com/', desc: '全网小说免费阅读' },
          { name: '番茄小说', url: 'https://fanqienovel.com/', desc: '正版免费，推荐算法' },
          { name: '起点中文网', url: 'https://www.qidian.com/', desc: '最大原创小说平台（部分免费）' },
          { name: '飞卢小说网', url: 'https://b.faloo.com/', desc: '同人/原创免费小说' },
          { name: '书旗小说', url: 'https://www.shuqi.com/', desc: '免费/付费小说' },
          { name: '晋江文学城', url: 'https://www.jjwxc.net/', desc: '言情/耽美/纯爱' },
          { name: '纵横中文网', url: 'https://www.zongheng.com/', desc: '原创小说免费阅读' },
          { name: '掌阅', url: 'https://www.zhangyue.com/', desc: '电子书阅读平台' },
          { name: '豆瓣阅读', url: 'https://read.douban.com/', desc: '原创小说/专栏' },
          { name: '话本小说', url: 'https://www.ihuaben.com/', desc: '免费小说阅读' },
        ],
        dailyScan: true,
      },
      {
        id: 'ebooks',
        name: 'PDF/电子书',
        icon: '📄',
        paths: [path.join(DOWNLOADS_DIR, 'ebooks')],
        fileTypes: ['.pdf'],
        readerType: 'pdf',
        links: [
          { name: '安娜的档案', url: 'https://zh.annas-archive.org/', desc: '全球最大开源数字图书馆' },
          { name: '鸠摩搜索', url: 'https://www.jiumodiary.com/', desc: '电子书搜索引擎' },
          { name: '小力盘', url: 'https://www.xiaolipan.com/', desc: '电子书资源搜索' },
          { name: '书籍知识库', url: 'https://www.zhishikoo.com/', desc: '书籍推荐+下载' },
          { name: '识典古籍', url: 'https://www.shidianguji.com/', desc: '古籍在线阅读（北大+字节）' },
          { name: '书格', url: 'https://www.shuge.org/', desc: '古籍数字图书馆' },
          { name: '飞库文学网', url: 'https://www.feiku6.com/', desc: '免费电子书在线阅读' },
          { name: '电子书之家', url: 'https://honeypdf.com/', desc: '全网电子书免费下载' },
          { name: '一单书', url: 'https://www.yidanshu.com/', desc: '书单+免费电子书下载' },
          { name: 'SoBooks', url: 'https://sobooks.cc/', desc: '电子书网盘下载' },
        ],
        dailyScan: true,
      },
      {
        id: 'documents',
        name: 'Word/文字',
        icon: '📝',
        paths: [path.join(DOWNLOADS_DIR, 'documents')],
        fileTypes: ['.docx', '.md'],
        readerType: 'word',
        links: [
          { name: '百度文库', url: 'https://wenku.baidu.com/', desc: '综合文档平台' },
          { name: '道客巴巴', url: 'https://www.doc88.com/', desc: '专业文档分享' },
          { name: '原创力文档', url: 'https://www.book118.com/', desc: '文档在线阅读' },
          { name: 'MBA智库文档', url: 'https://doc.mbalib.com/', desc: '经管类文档' },
          { name: '豆丁网', url: 'https://www.docin.com/', desc: '文档分享平台' },
          { name: '爱问共享', url: 'https://ishare.iask.sina.com.cn/', desc: '资料分享' },
          { name: 'PDFCraft', url: 'https://pdfcraft.devtoolcafe.com/zh/tools/', desc: 'PDF全能工具箱' },
          { name: 'Smallpdf', url: 'https://smallpdf.com/cn', desc: 'PDF转换/编辑' },
          { name: 'MinerU', url: 'https://mineru.net/OpenSourceTools/Extractor', desc: '文档解析/PDF转markdown' },
          { name: 'Look Scanned', url: 'https://lookscanned.io/scan', desc: '文件转扫描件' },
        ],
        dailyScan: true,
      },
    ],
    files: [],
    lastScan: null,
    scanSchedule: '0 6 * * *',
    readProgress: {},
  };
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    const def = getDefaultConfig();
    saveConfig(def);
    return def;
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    const def = getDefaultConfig();
    saveConfig(def);
    return def;
  }
}

function saveConfig(data) {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Ensure download dirs exist
['novels', 'ebooks', 'documents'].forEach(d => {
  const dp = path.join(DOWNLOADS_DIR, d);
  if (!fs.existsSync(dp)) fs.mkdirSync(dp, { recursive: true });
});

// --- API routes ---

// Get all categories
router.get('/categories', (req, res) => {
  const cfg = loadConfig();
  res.json({ ok: true, categories: cfg.categories });
});

// Create or update a category
router.post('/categories', (req, res) => {
  try {
    const cfg = loadConfig();
    const cat = req.body;
    if (!cat.id || !cat.name) return res.status(400).json({ ok: false, error: 'id and name required' });

    const idx = cfg.categories.findIndex(c => c.id === cat.id);
    if (idx >= 0) {
      cfg.categories[idx] = { ...cfg.categories[idx], ...cat };
    } else {
      cfg.categories.push(cat);
    }
    // Create paths
    (cat.paths || []).forEach(p => {
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    });
    saveConfig(cfg);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Delete a category
router.delete('/categories/:id', (req, res) => {
  try {
    const cfg = loadConfig();
    cfg.categories = cfg.categories.filter(c => c.id !== req.params.id);
    saveConfig(cfg);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Get files for a category (scan directory + config)
router.get('/files', (req, res) => {
  try {
    const cfg = loadConfig();
    const catId = req.query.category || 'da-a';
    const cat = cfg.categories.find(c => c.id === catId);
    if (!cat) return res.status(404).json({ ok: false, error: 'Category not found' });

    let files = [];
    (cat.paths || []).forEach(dir => {
      if (!fs.existsSync(dir)) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        entries.forEach(e => {
          if (e.isFile()) {
            const ext = path.extname(e.name).toLowerCase();
            if (cat.fileTypes.includes(ext) || cat.fileTypes.length === 0) {
              const fp = path.join(dir, e.name);
              const stat = fs.statSync(fp);
              files.push({
                name: e.name,
                path: fp,
                ext,
                size: stat.size,
                modified: stat.mtime.toISOString(),
                category: catId,
              });
            }
          }
        });
      } catch {}
    });

    // Sort by modified desc
    files.sort((a, b) => b.modified.localeCompare(a.modified));
    res.json({ ok: true, files });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Get file content
router.get('/content', (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ ok: false, error: 'path required' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ ok: false, error: 'File not found' });

    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.txt' || ext === '.md' || ext === '.html') {
      const content = fs.readFileSync(filePath, 'utf8');
      res.json({ ok: true, type: 'text', content, name: path.basename(filePath) });
    } else if (ext === '.pdf') {
      // Return file as download for frontend PDF.js
      res.json({ ok: true, type: 'pdf', url: `/api/reading-room/raw-file?path=${encodeURIComponent(filePath)}`, name: path.basename(filePath) });
    } else if (ext === '.docx') {
      // Return file as download for frontend mammoth.js
      res.json({ ok: true, type: 'docx', url: `/api/reading-room/raw-file?path=${encodeURIComponent(filePath)}`, name: path.basename(filePath) });
    } else {
      res.status(400).json({ ok: false, error: `Unsupported file type: ${ext}` });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Serve raw file (for PDF.js and mammoth.js)
router.get('/raw-file', (req, res) => {
  const filePath = req.query.path;
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).send('File not found');
  const ext = path.extname(filePath).toLowerCase();
  const mimes = { '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  res.setHeader('Content-Type', mimes[ext] || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(filePath))}"`);
  fs.createReadStream(filePath).pipe(res);
});

// Download file from URL to category
// SSRF 防护：仅允许 http/https，解析后禁止环回/私有/保留网段
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    if (p[0] === 127 || p[0] === 0 || p[0] === 10) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] >= 224) return true;
  } else if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::1' || l.startsWith('fe80') || l.startsWith('fc') || l.startsWith('fd') || l.indexOf('::ffff:127') === 0) return true;
  }
  return false;
}
function assertSafeUrl(rawUrl) {
  const u = new URL(rawUrl);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('仅支持 http/https 协议');
  const host = u.hostname;
  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' || host === '[::]') throw new Error('禁止访问本地主机');
  // IP 字面量直接判定（避免无谓的 DNS 查询与歧义）
  if (net.isIPv4(host) || net.isIPv6(host)) {
    if (isPrivateIp(host)) throw new Error('目标地址属于内网/保留网段，已拦截(SSRF)');
    return u;
  }
  let addrs;
  try { addrs = dns.lookup(host, { all: true }); }
  catch (e) { throw new Error('域名解析失败/被拒绝: ' + host); }
  for (const a of addrs) { if (isPrivateIp(a.address)) throw new Error('目标地址属于内网/保留网段，已拦截(SSRF)'); }
  return u;
}

router.post('/download', (req, res) => {
  try {
    const { url, category } = req.body;
    if (!url || !category) return res.status(400).json({ ok: false, error: 'url and category required' });

    const urlObj = assertSafeUrl(url);

    const cfg = loadConfig();
    const cat = cfg.categories.find(c => c.id === category);
    if (!cat || !cat.paths || cat.paths.length === 0) return res.status(400).json({ ok: false, error: 'Category has no paths' });

    const destDir = cat.paths[0];
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    // Extract filename from URL
    let filename = path.basename(urlObj.pathname) || 'download';
    if (!filename.includes('.')) filename += '.txt';

    // Deduplicate
    let finalPath = path.join(destDir, filename);
    let counter = 1;
    while (fs.existsSync(finalPath)) {
      const parts = path.parse(filename);
      finalPath = path.join(destDir, `${parts.name}_${counter}${parts.ext}`);
      counter++;
    }

    // Download
    const client = url.startsWith('https') ? https : http;
    client.get(url, (response) => {
      if (response.statusCode !== 200) {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            return res.json({ ok: false, error: 'redirect', redirectUrl });
          }
        }
        return res.status(400).json({ ok: false, error: `HTTP ${response.statusCode}` });
      }

      const fileStream = fs.createWriteStream(finalPath);
      const MAX_DOWNLOAD = 50 * 1024 * 1024;
      let downloaded = 0;

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (downloaded > MAX_DOWNLOAD) {
          response.destroy();
          fileStream.destroy();
          try { fs.unlinkSync(finalPath); } catch (_) {}
          return res.status(400).json({ ok: false, error: '下载文件过大(>50MB)，已拦截' });
        }
      });
      response.pipe(fileStream);
      response.on('end', () => {
        fileStream.close();
        res.json({
          ok: true,
          file: { name: path.basename(finalPath), path: finalPath, size: downloaded }
        });
      });
      response.on('error', (e) => {
        fileStream.close();
        fs.unlinkSync(finalPath);
        res.status(500).json({ ok: false, error: e.message });
      });
    }).on('error', (e) => {
      res.status(500).json({ ok: false, error: e.message });
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Manual scan all directories
router.post('/scan', (req, res) => {
  try {
    const cfg = loadConfig();
    cfg.lastScan = new Date().toISOString();
    cfg.files = [];

    cfg.categories.forEach(cat => {
      (cat.paths || []).forEach(dir => {
        if (!fs.existsSync(dir)) return;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          entries.forEach(e => {
            if (e.isFile()) {
              const ext = path.extname(e.name).toLowerCase();
              if (cat.fileTypes.includes(ext) || cat.fileTypes.length === 0) {
                const fp = path.join(dir, e.name);
                const stat = fs.statSync(fp);
                cfg.files.push({
                  name: e.name, path: fp, ext,
                  size: stat.size, modified: stat.mtime.toISOString(),
                  category: cat.id,
                });
              }
            }
          });
        } catch {}
      });
    });

    saveConfig(cfg);
    res.json({ ok: true, files: cfg.files.length, lastScan: cfg.lastScan });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Get reading progress
router.get('/progress', (req, res) => {
  const cfg = loadConfig();
  res.json({ ok: true, progress: cfg.readProgress || {} });
});

// Save reading progress
router.post('/progress', (req, res) => {
  try {
    const cfg = loadConfig();
    cfg.readProgress = { ...(cfg.readProgress || {}), ...req.body };
    saveConfig(cfg);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- Filesystem discovery (scan arbitrary directories) ---

// Get/set scan roots (persistent)
router.get('/scan-roots', (req, res) => {
  const cfg = loadConfig();
  res.json({ ok: true, scanRoots: cfg.scanRoots || [] });
});

router.post('/scan-roots', (req, res) => {
  try {
    const cfg = loadConfig();
    cfg.scanRoots = req.body.roots || [];
    saveConfig(cfg);
    res.json({ ok: true, scanRoots: cfg.scanRoots });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Deep discover: scan directories recursively, return matching files
router.post('/discover', (req, res) => {
  try {
    const { roots, fileTypes, maxDepth } = req.body;
    if (!roots || !Array.isArray(roots) || roots.length === 0) {
      return res.status(400).json({ ok: false, error: 'roots (array) required' });
    }
    const types = fileTypes || ['.txt', '.md', '.pdf', '.docx'];
    const depth = maxDepth || 10;
    const results = [];

    function scanDir(dir, currentDepth) {
      if (currentDepth > depth) return;
      if (dir.includes('node_modules') || dir.includes('.git') ||
          dir.includes('cache') || dir.includes('AppData') ||
          dir.includes('__pycache__') || dir.startsWith('C:\\Windows')) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const fp = path.join(dir, e.name);
          try {
            if (e.isDirectory()) {
              scanDir(fp, currentDepth + 1);
            } else if (e.isFile()) {
              const ext = path.extname(e.name).toLowerCase();
              if (types.includes(ext)) {
                const stat = fs.statSync(fp);
                results.push({
                  name: e.name,
                  path: fp,
                  ext,
                  size: stat.size,
                  modified: stat.mtime.toISOString(),
                  source: 'discovery',
                });
              }
            }
          } catch {}
        }
      } catch {}
    }

    for (const root of roots) {
      if (fs.existsSync(root)) {
        scanDir(root, 0);
      }
    }

    results.sort((a, b) => b.modified.localeCompare(a.modified));
    res.json({ ok: true, files: results, count: results.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============ Bookshelf API ============

// Get all bookshelf books
router.get('/bookshelf', (req, res) => {
  try {
    const cfg = loadConfig();
    if (!cfg.bookshelf) cfg.bookshelf = [];
    res.json({ ok: true, books: cfg.bookshelf });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Add book to bookshelf
router.post('/bookshelf', (req, res) => {
  try {
    const cfg = loadConfig();
    if (!cfg.bookshelf) cfg.bookshelf = [];
    const { name, path: filePath, author } = req.body;
    if (!name || !filePath) return res.status(400).json({ ok: false, error: 'name and path required' });

    // Check if already exists
    const existing = cfg.bookshelf.find(b => b.path === filePath);
    if (existing) {
      existing.lastReadAt = new Date().toISOString();
      saveConfig(cfg);
      return res.json({ ok: true, book: existing });
    }

    const book = {
      id: 'book_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      name,
      path: filePath,
      author: author || '',
      cover: '',
      status: 'reading',
      addedAt: new Date().toISOString(),
      lastReadAt: new Date().toISOString(),
      progress: 0,
    };
    cfg.bookshelf.push(book);
    saveConfig(cfg);
    res.json({ ok: true, book });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Update book
router.put('/bookshelf/:id', (req, res) => {
  try {
    const cfg = loadConfig();
    if (!cfg.bookshelf) cfg.bookshelf = [];
    const idx = cfg.bookshelf.findIndex(b => b.id === req.params.id);
    if (idx === -1) return res.status(404).json({ ok: false, error: 'Book not found' });

    const updates = req.body;
    if (updates.status) cfg.bookshelf[idx].status = updates.status;
    if (updates.progress !== undefined) cfg.bookshelf[idx].progress = updates.progress;
    if (updates.lastReadAt) cfg.bookshelf[idx].lastReadAt = updates.lastReadAt;
    if (updates.author) cfg.bookshelf[idx].author = updates.author;
    saveConfig(cfg);
    res.json({ ok: true, book: cfg.bookshelf[idx] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Delete book
router.delete('/bookshelf/:id', (req, res) => {
  try {
    const cfg = loadConfig();
    if (!cfg.bookshelf) cfg.bookshelf = [];
    cfg.bookshelf = cfg.bookshelf.filter(b => b.id !== req.params.id);
    saveConfig(cfg);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============ Bookmark API ============

// Get bookmarks for a file
router.get('/bookmarks/:filePath(*)', (req, res) => {
  try {
    const cfg = loadConfig();
    if (!cfg.bookmarks) cfg.bookmarks = [];
    const filePath = req.params.filePath;
    const bookmarks = cfg.bookmarks.filter(b => b.filePath === filePath);
    res.json({ ok: true, bookmarks });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Add bookmark
router.post('/bookmark', (req, res) => {
  try {
    const cfg = loadConfig();
    if (!cfg.bookmarks) cfg.bookmarks = [];
    const { filePath, fileName, chapter, position, textSnippet, note } = req.body;
    if (!filePath) return res.status(400).json({ ok: false, error: 'filePath required' });

    const bookmark = {
      id: 'bm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      filePath,
      fileName: fileName || '',
      chapter: chapter || '',
      position: position || 0,
      textSnippet: textSnippet || '',
      note: note || '',
      createdAt: new Date().toISOString(),
    };
    cfg.bookmarks.push(bookmark);
    saveConfig(cfg);
    res.json({ ok: true, bookmark });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Update bookmark (note only)
router.put('/bookmark/:id', (req, res) => {
  try {
    const cfg = loadConfig();
    if (!cfg.bookmarks) cfg.bookmarks = [];
    const idx = cfg.bookmarks.findIndex(b => b.id === req.params.id);
    if (idx === -1) return res.status(404).json({ ok: false, error: 'Bookmark not found' });

    if (req.body.note !== undefined) cfg.bookmarks[idx].note = req.body.note;
    saveConfig(cfg);
    res.json({ ok: true, bookmark: cfg.bookmarks[idx] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Delete bookmark
router.delete('/bookmark/:id', (req, res) => {
  try {
    const cfg = loadConfig();
    if (!cfg.bookmarks) cfg.bookmarks = [];
    cfg.bookmarks = cfg.bookmarks.filter(b => b.id !== req.params.id);
    saveConfig(cfg);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============ Import API ============

// Import from URL
router.post('/import/url', (req, res) => {
  try {
    const { url, name: customName } = req.body;
    if (!url) return res.status(400).json({ ok: false, error: 'url required' });

    const novelsDir = path.join(DOWNLOADS_DIR, 'novels');
    if (!fs.existsSync(novelsDir)) fs.mkdirSync(novelsDir, { recursive: true });

    let filename = (customName || path.basename(new URL(url).pathname) || 'novel').replace(/[<>:"\/\\|?*]/g, '_');
    if (!filename.endsWith('.txt')) filename += '.txt';

    let finalPath = path.join(novelsDir, filename);
    let counter = 1;
    while (fs.existsSync(finalPath)) {
      const parsed = path.parse(filename);
      finalPath = path.join(novelsDir, `${parsed.name}_${counter}${parsed.ext}`);
      counter++;
    }

    const client = url.startsWith('https') ? https : http;
    client.get(url, { timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      if (response.statusCode !== 200) {
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
          return res.json({ ok: false, error: 'redirect', redirectUrl: response.headers.location });
        }
        return res.status(400).json({ ok: false, error: `HTTP ${response.statusCode}` });
      }

      const fileStream = fs.createWriteStream(finalPath);
      let totalSize = 0;

      response.pipe(fileStream);
      response.on('data', (chunk) => { totalSize += chunk.length; });
      response.on('end', () => {
        fileStream.close();
        const stat = fs.statSync(finalPath);
        res.json({
          ok: true,
          file: { name: path.basename(finalPath), path: finalPath, size: totalSize, modified: stat.mtime.toISOString() }
        });
      });
      response.on('error', (e) => {
        fileStream.close();
        try { fs.unlinkSync(finalPath); } catch {}
        res.status(500).json({ ok: false, error: e.message });
      });
    }).on('error', (e) => {
      res.status(500).json({ ok: false, error: e.message });
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Import from pasted text
router.post('/import/paste', (req, res) => {
  try {
    const { content, name } = req.body;
    if (!content) return res.status(400).json({ ok: false, error: 'content required' });
    if (!name) return res.status(400).json({ ok: false, error: 'name required' });

    const novelsDir = path.join(DOWNLOADS_DIR, 'novels');
    if (!fs.existsSync(novelsDir)) fs.mkdirSync(novelsDir, { recursive: true });

    let filename = name.replace(/[<>:"\/\\|?*]/g, '_');
    if (!filename.endsWith('.txt')) filename += '.txt';

    let finalPath = path.join(novelsDir, filename);
    let counter = 1;
    while (fs.existsSync(finalPath)) {
      const parsed = path.parse(filename);
      finalPath = path.join(novelsDir, `${parsed.name}_${counter}${parsed.ext}`);
      counter++;
    }

    fs.writeFileSync(finalPath, content, 'utf8');
    const stat = fs.statSync(finalPath);
    res.json({
      ok: true,
      file: { name: path.basename(finalPath), path: finalPath, size: stat.size, modified: stat.mtime.toISOString() }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Search novel sites (simplified)
router.post('/import/search', (req, res) => {
  try {
    const { keyword } = req.body;
    if (!keyword) return res.status(400).json({ ok: false, error: 'keyword required' });

    // We'll use https and native fetch to search
    const searchUrl = `https://www.biquge.com/search?q=${encodeURIComponent(keyword)}`;
    const client = https;
    client.get(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        // Simple parsing - extract links and titles
        const results = [];
        const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
        let match;
        while ((match = linkRegex.exec(data)) !== null) {
          const href = match[1];
          const title = match[2].trim();
          if (title && title.length > 2 && !href.startsWith('javascript') && !href.startsWith('#')) {
            const fullUrl = href.startsWith('http') ? href : `https://www.biquge.com${href.startsWith('/') ? '' : '/'}${href}`;
            results.push({ title: title.replace(/<[^>]+>/g, '').trim(), url: fullUrl });
          }
        }
        // Attempt to search more targeted novel sites
        res.json({ ok: true, source: 'biquge.com', results: results.slice(0, 30) });
      });
      response.on('error', () => {
        // Return mock results for common queries
        res.json({
          ok: true,
          source: 'search',
          results: [
            { title: `搜索结果: ${keyword} - 建议访问笔趣阁/起点查看`, url: `https://www.biquge.com/search.php?q=${encodeURIComponent(keyword)}` }
          ]
        });
      });
    }).on('error', () => {
      res.json({
        ok: true,
        source: 'search',
        results: [
          { title: `搜索结果: ${keyword} - 建议访问笔趣阁/起点查看`, url: `https://www.biquge.com/search.php?q=${encodeURIComponent(keyword)}` }
        ]
      });
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============ Search API ============

// Search within a novel file
router.post('/search', (req, res) => {
  try {
    const { filePath, query } = req.body;
    if (!filePath || !query) return res.status(400).json({ ok: false, error: 'filePath and query required' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ ok: false, error: 'File not found' });

    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.txt' && ext !== '.md') return res.status(400).json({ ok: false, error: 'Unsupported file type' });

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const results = [];
    const q = query.toLowerCase();

    // Detect chapter patterns
    const chapterPattern = /^(第[一二三四五六七八九十百千万\d]+[章节篇回])/;
    let currentChapter = '';

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (chapterPattern.test(trimmed)) {
        currentChapter = trimmed;
      }
      if (line.toLowerCase().includes(q)) {
        // Include context lines
        const start = Math.max(0, idx - 1);
        const end = Math.min(lines.length, idx + 2);
        const context = lines.slice(start, end).join('\n');
        results.push({
          lineNumber: idx + 1,
          line: trimmed.substring(0, 120),
          context: context.substring(0, 300),
          chapter: currentChapter,
        });
      }
    });

    res.json({ ok: true, results, total: results.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
