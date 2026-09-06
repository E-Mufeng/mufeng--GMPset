const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════
// 世界观管理系统 — 实体注册表 + 规则校验 + Markdown导出
// 与 story-state v2 互补：自动提取→手动确认→规则校验
// ═══════════════════════════════════════════════════════

const WRITING_DIR = path.join(__dirname, '..', '..', 'data/writing');

function getWorldFile(projectId) {
  return path.join(WRITING_DIR, `world-${projectId}.json`);
}

function getWorldData(projectId) {
  const f = getWorldFile(projectId);
  if (!fs.existsSync(f)) {
    const d = { characters: {}, locations: {}, items: {} };
    fs.writeFileSync(f, JSON.stringify(d, null, 2));
    return d;
  }
  var raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  // Handle new v2 structure: { world: { characters: [...], ... } }
  var data = raw.world || raw;
  // Convert arrays to dicts (keyed by id) for frontend compatibility
  var frontend = {};
  var cvt = function(arr) {
    if (!Array.isArray(arr)) return arr || {};
    var obj = {};
    arr.forEach(function(item) {
      var key = item.id || item.name || 'unknown';
      obj[key] = item;
    });
    return obj;
  };
  // Return ALL categories for API compatibility
  var ALL_CATS = ['characters','locations','items','classes','skills','equipment','rules','materials','zones','guilds','monsters','timeline','tactics'];
  ALL_CATS.forEach(function(cat) {
    frontend[cat] = cvt(data[cat]);
  });
  return frontend;
}

// Save dict-format data, preserving v2 categories not shown in frontend
function saveWorldData(projectId, data) {
  var f = getWorldFile(projectId);
  var existing = {};
  try {
    var raw = JSON.parse(fs.readFileSync(f, 'utf8'));
    var root = raw.world || raw;
    // Save all existing v2 categories, overwriting frontend-visible ones
    existing = root;
  } catch(e) {}
  // Merge ALL categories from incoming data (frontend or API) into existing
  var ALL_CATS = ['characters','locations','items','classes','skills','equipment','rules','materials','zones','guilds','monsters','timeline','tactics'];
  ALL_CATS.forEach(function(cat) {
    if (data[cat] !== undefined) {
      existing[cat] = data[cat];
    }
  });
  // Write without 'world' wrapper (dict format)
  fs.writeFileSync(f, JSON.stringify(existing, null, 2));
}

// ═══════════════════════════════════════════════════════
// 校验器（内联，不拆文件）— 3条硬编码规则
// ═══════════════════════════════════════════════════════
function validateChapter(worldData, content, chapterNumber) {
  const errors = [];
  const text = content || '';
  const lowerText = text.toLowerCase();

  // 收集所有手动确认的实体（非 autoExtracted）
  const confirmedEntities = [];
  ['characters', 'locations', 'items'].forEach(type => {
    Object.values(worldData[type] || {}).forEach(entity => {
      if (!entity.autoExtracted) {
        confirmedEntities.push({ type, entity });
      }
    });
  });

  // 规则1：已标记死亡的角色的名称不出现在正文中
  confirmedEntities.forEach(({ type, entity }) => {
    if (type !== 'characters') return;
    if (entity.attributes?.status !== '死亡' && entity.attributes?.status !== '已故') return;

    // 检查所有搜索词
    (entity.searchTerms || [entity.name]).forEach(term => {
      if (lowerText.includes(term.toLowerCase())) {
        errors.push({
          rule: 'dead_character',
          severity: 'error',
          message: `「${entity.name}」已标记为「${entity.attributes.status}」，但本章正文中仍出现`,
          chapter: chapterNumber
        });
      }
    });
  });

  // 规则2：职业-武器不匹配（只检查明确标记职业的角色）
  const weaponMap = {
    '牧师': ['巨剑', '太刀', '长枪', '匕首', '剑', '巨斧', '战锤', '盾剑'],
    '剑客': ['十字架', '法杖', '魔杖', '图腾', '权杖'],
    '法师': ['巨剑', '盾牌', '拳套', '匕首', '长弓'],
    '枪手': ['长剑', '法杖', '十字架', '盾牌', '战锤'],
    '战士': ['法杖', '十字架', '图腾'],
    '刺客': ['巨剑', '法杖', '巨斧', '战锤'],
  };

  confirmedEntities.forEach(({ type, entity }) => {
    if (type !== 'characters') return;
    const cls = entity.attributes?.class || entity.attributes?.职业;
    if (!cls || !weaponMap[cls]) return;

    const wrongWeapons = weaponMap[cls];
    wrongWeapons.forEach(weapon => {
      if (lowerText.includes(weapon.toLowerCase())) {
        errors.push({
          rule: 'weapon_mismatch',
          severity: 'warning',
          message: `「${entity.name}」是${cls}，但正文中出现不该使用的武器「${weapon}」`,
          chapter: chapterNumber
        });
      }
    });
  });

  // 规则3：正文中出现的已知角色名称不在注册表中→提示补充
  // 从正文中提取所有疑似角色名（2-4字中文，出现在注册表中的）
  const allRegistered = new Set();
  confirmedEntities.forEach(({ entity }) => {
    (entity.searchTerms || [entity.name]).forEach(t => allRegistered.add(t));
  });

  // 简单的中文人名匹配（连续中文，2-4个字）
  const nameMatches = text.match(/[\u4e00-\u9fff]{2,4}/g) || [];
  const foundNames = [...new Set(nameMatches)];
  const missingInRegistered = foundNames.filter(n =>
    !allRegistered.has(n) &&
    !['但是', '因为', '所以', '虽然', '如果', '然后', '突然', '最后', '只有',
      '没有', '不是', '就是', '什么', '这个', '那个', '一个', '自己', '可以',
      '知道', '看到', '听到', '来到', '回到', '走进', '伸出', '抬起头', '站起来',
      '看过去', '看起来', '说出来'].includes(n)
  );

  // 只提示前5个可能缺失的
  missingInRegistered.slice(0, 5).forEach(name => {
    errors.push({
      rule: 'missing_entity',
      severity: 'info',
      message: `正文中出现「${name}」，但不在世界观实体注册表中，是否要添加到人物/地点？`,
      chapter: chapterNumber
    });
  });

  return errors;
}

// ═══════════════════════════════════════════════════════
// API 路由
// ═══════════════════════════════════════════════════════

// GET /world/:projectId — 获取项目的所有实体数据
router.get('/:projectId', (req, res) => {
  try {
    res.json(getWorldData(req.params.projectId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /world/:projectId/:type — 创建实体 (type=characters|locations|items)
router.post('/:projectId/:type', (req, res) => {
  try {
    const { projectId, type } = req.params;
    if (!['characters', 'locations', 'items', 'classes', 'skills', 'equipment', 'rules', 'materials', 'zones', 'guilds', 'monsters', 'timeline', 'tactics'].includes(type)) {
      return res.status(400).json({ error: '无效实体类型' });
    }

    const data = getWorldData(projectId);
    if (!data[type]) data[type] = {};
    const id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const entity = {
      id,
      type,
      name: req.body.name || '未命名',
      aliases: req.body.aliases || [],
      searchTerms: [req.body.name || '未命名', ...(req.body.aliases || [])],
      attributes: req.body.attributes || {},
      relationships: req.body.relationships || [],
      timeline: req.body.timeline || [],
      notes: req.body.notes || '',
      autoExtracted: req.body.autoExtracted || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    data[type][id] = entity;
    saveWorldData(projectId, data);
    res.json({ success: true, data: entity });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /world/:projectId/:type/:id — 更新实体
router.put('/:projectId/:type/:id', (req, res) => {
  try {
    const { projectId, type, id } = req.params;
    const data = getWorldData(projectId);

    if (!data[type]?.[id]) {
      return res.status(404).json({ error: '实体不存在' });
    }

    const updates = { ...req.body, updatedAt: new Date().toISOString() };
    // 如果修改了名称或别名，刷新搜索词
    if (updates.name || updates.aliases) {
      updates.searchTerms = [
        updates.name || data[type][id].name,
        ...(updates.aliases || data[type][id].aliases || [])
      ];
    }

    data[type][id] = { ...data[type][id], ...updates };
    saveWorldData(projectId, data);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /world/:projectId/:type/:id — 删除实体
router.delete('/:projectId/:type/:id', (req, res) => {
  try {
    const { projectId, type, id } = req.params;
    const data = getWorldData(projectId);
    if (data[type]?.[id]) {
      delete data[type][id];
      saveWorldData(projectId, data);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /world/validate/:projectId — 校验章节文本一致性
router.post('/validate/:projectId', (req, res) => {
  try {
    const errors = validateChapter(
      getWorldData(req.params.projectId),
      req.body.content,
      req.body.chapterNumber
    );
    res.json({ success: true, errors });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /world/export/:projectId — 导出Markdown设定集
router.get('/export/:projectId', (req, res) => {
  try {
    const data = getWorldData(req.params.projectId);
    let md = '# 世界观设定集\n\n';

    const exportSection = (title, items) => {
      const vals = Object.values(items);
      if (!vals.length) return;
      md += `## ${title}\n\n`;
      vals.forEach(entity => {
        md += `### ${entity.name}\n\n`;
        Object.entries(entity.attributes || {}).forEach(([k, v]) => {
          md += `- **${k}**: ${v}\n`;
        });
        if (entity.relationships?.length) {
          md += '\n**关系**:\n';
          entity.relationships.forEach(r => md += `- ${r}\n`);
        }
        if (entity.timeline?.length) {
          md += '\n**经历**:\n';
          entity.timeline.forEach(t => md += `- ${t.time}: ${t.event}\n`);
        }
        if (entity.notes) md += `\n**备注**: ${entity.notes}\n`;
        md += '\n';
      });
    };

    exportSection('人物', data.characters);
    exportSection('地点', data.locations);
    exportSection('物品', data.items);

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="world-setting-${req.params.projectId}.md"`);
    res.send(md);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
