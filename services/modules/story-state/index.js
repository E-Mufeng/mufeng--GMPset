// ========== 世界观管理系统集成 ==========
const fs = require('fs');
const path = require('path');

const WORLD_DATA_DIR = path.join(__dirname, '..', '..', '..', 'data', 'writing');

/**
 * 将story-state提取的事实同步到世界观数据
 * @param {string} projectId 项目ID
 * @param {array} facts 从正文提取的事实数组（{subject, verb, object, chapter}）
 */
function syncExtractedEntities(projectId, facts) {
  try {
    if (!projectId || !facts || !facts.length) return;

    const worldFilePath = path.join(WORLD_DATA_DIR, `world-${projectId}.json`);

    // 读取现有世界观数据
    let worldData;
    if (fs.existsSync(worldFilePath)) {
      worldData = JSON.parse(fs.readFileSync(worldFilePath, 'utf8'));
    } else {
      worldData = { characters: {}, locations: {}, items: {} };
    }

    // 收集所有已存在的搜索词
    const existingSearchTerms = new Set();
    Object.values(worldData).forEach(type => {
      Object.values(type).forEach(entity => {
        (entity.searchTerms || []).forEach(term => {
          existingSearchTerms.add(term.toLowerCase());
        });
      });
    });

    // 从facts提取唯一角色名、地点名、物品名
    const uniqueChars = new Map();
    const uniqueLocs = new Map();
    const uniqueItems = new Map();

    facts.forEach(f => {
      if (!f.subject) return;
      if (f.verb === '到达' && f.object) {
        const key = f.object.trim();
        if (!uniqueLocs.has(key)) uniqueLocs.set(key, []);
        uniqueLocs.get(key).push(f);
      } else if (f.verb === '获得' && f.object) {
        const key = f.object.trim();
        if (!uniqueItems.has(key)) uniqueItems.set(key, []);
        uniqueItems.get(key).push(f);
      }
      // 所有非到达/获得事件的主体视为角色
      if (['进阶','学会','成为','发现','救了','杀了','背叛','打伤','救下','拜师','收徒'].includes(f.verb)) {
        const key = f.subject.trim();
        if (!uniqueChars.has(key)) uniqueChars.set(key, []);
        uniqueChars.get(key).push(f);
      }
    });

    // 同步人物
    for (const [name, events] of uniqueChars) {
      if (!existingSearchTerms.has(name.toLowerCase())) {
        const id = `entity-auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const attributes = {};
        // 收集最新level
        const levelFacts = events.filter(e => e.verb === '进阶').sort((a, b) => b.chapter - a.chapter);
        if (levelFacts.length) attributes.lastLevel = levelFacts[0].object;

        worldData.characters[id] = {
          id,
          type: 'character',
          name,
          searchTerms: [name],
          attributes,
          timeline: events.map(e => ({ chapter: e.chapter, event: `${e.verb}:${e.object}` })),
          autoExtracted: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        console.log(`[story-state] 自动添加新人物: ${name} (项目: ${projectId})`);
      }
    }

    // 同步地点
    for (const [name, events] of uniqueLocs) {
      if (!existingSearchTerms.has(name.toLowerCase())) {
        const id = `entity-auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        worldData.locations[id] = {
          id,
          type: 'location',
          name,
          searchTerms: [name],
          attributes: {},
          timeline: events.map(e => ({ chapter: e.chapter, event: `${e.subject}到达此处` })),
          autoExtracted: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        console.log(`[story-state] 自动添加新地点: ${name} (项目: ${projectId})`);
      }
    }

    // 同步物品
    for (const [name, events] of uniqueItems) {
      if (!existingSearchTerms.has(name.toLowerCase())) {
        const id = `entity-auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        worldData.items[id] = {
          id,
          type: 'item',
          name,
          searchTerms: [name],
          attributes: {},
          timeline: events.map(e => ({ chapter: e.chapter, event: `${e.subject}获得此物` })),
          autoExtracted: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        console.log(`[story-state] 自动添加新物品: ${name} (项目: ${projectId})`);
      }
    }

    // 保存数据
    fs.writeFileSync(worldFilePath, JSON.stringify(worldData, null, 2));
    console.log(`[story-state] 世界数据同步完成 (项目: ${projectId})`);
  } catch (error) {
    // 静默失败，不影响原有功能
    console.error('[story-state] 同步实体失败:', error.message);
  }
} // end syncExtractedEntities

module.exports = { syncExtractedEntities };
