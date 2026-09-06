// ═══════════════════════════════════════════════════════
// 写作引擎 v2 — 结构化输入 → 智能组装 → 自动上下文
// 功能：场景类型检测、知识库技巧匹配、上下文组装、
//       章节DNA追踪、多样性强制、反馈收集
// ═══════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { syncExtractedEntities } = require('../modules/story-state');
const config = require('../config');
// 成本防护层（余额熔断 + token 硬阈值 + 输出钳制）
const guard = require('../guard');

// ─── 全局功能开关（对照实验用）───
const SWITCHES = {
  enableFactFilter: true,      // 事实提取（AI段落中提取角色/关系/事件）
  enableSlideWindow: true,     // 滑动窗口上下文截断
  enableDeduplicate: true,     // 事实去重
  enableContentValidate: true, // 内容合规验证
  enableRetry: true            // API失败自动重试
};
// 允许通过环境变量临时覆盖：SET WRITING_SWITCHES={"enableFactFilter":false}
try { const env = JSON.parse(process.env.WRITING_SWITCHES || '{}'); Object.assign(SWITCHES, env); } catch(e){}

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'writing');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ─── 数据工具 ───
function readJSON(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) { return def; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// ─── 读取知识库技巧 ───
function loadTechniques() {
  return readJSON(path.join(DATA_DIR, 'techniques.json'), []);
}

// ─── 读取风格指南 + 旧genre→新styleId映射 ───
function loadStyleGuide() {
  return readJSON(path.join(DATA_DIR, 'styles.json'), []);
}
const GENRE_TO_STYLE = {
  '玄幻': ['s12','s1'], '修仙': ['s1','s12'], '修真': ['s1','s12'],
  '仙侠': ['s1','s12'], '东方玄幻': ['s12','s1'],
  '都市': ['s2','s7','s8'], '现代': ['s2','s7','s8'],
  '科幻': ['s3','s9'], '未来': ['s3','s9'],
  '奇幻': ['s4','s11'], '西幻': ['s11','s4'], '西方魔幻': ['s11','s4'],
  '悬疑': ['s5'], '推理': ['s5'],
  '历史': ['s6'], '架空': ['s6'],
  '言情': ['s7'], '爱情': ['s7'], '浪漫': ['s7'],
  '校园': ['s8'], '青春': ['s8'],
  '赛博': ['s9'], '蒸汽': ['s10'],
  '游戏': ['s14','s13'], '网游': ['s14'],
  '轻小说': ['s13'],
  '通用': [] // no specific style
};

// 前端拼音值 → 中文名映射
const PINYIN_TO_GENRE = {
  'reXue': '玄幻', 'xuanYi': '悬疑', 'yanQing': '言情',
  'qiangQingXu': '言情', 'shuangWen': '都市',
  'riChang': '都市', 'kaiPai': '都市',
  'keHuan': '科幻', 'zhengZhan': '玄幻',
  'dongZuo': '玄幻', 'tanXian': '奇幻',
  'zhiYu': '都市', 'kongBu': '悬疑',
  'jianShe': '都市', 'jiJing': '都市',
  'keJi': '科幻', 'baoKuai': '都市',
  'xianXia': '修仙', 'qiHuan': '奇幻',
  'xiYou': '西幻', 'kongLing': '轻小说',
  'xiuZhen': '修仙', 'douZhan': '玄幻'
};
function genreToStyleIds(genreName) {
  if (!genreName) return [];
  // Try pinyin → Chinese mapping first
  var cnName = PINYIN_TO_GENRE[genreName];
  var searchName = cnName || genreName;
  for (const [key, ids] of Object.entries(GENRE_TO_STYLE)) {
    if (searchName.includes(key)) return ids;
  }
  return [];
}

// ─── 读取项目级别数据 ───
function getProjFile(id) { return path.join(DATA_DIR, `project-${id}.json`); }
function getChapFile(id) { return path.join(DATA_DIR, `chapters-${id}.json`); }
function getCharFile(id) { return path.join(DATA_DIR, `characters-${id}.json`); }
function getNoteFile(id) { return path.join(DATA_DIR, `notes-${id}.json`); }
function getDNAFile(id) { return path.join(DATA_DIR, `dna-${id}.json`); }
function getPlotFile(id) { return path.join(DATA_DIR, `plots-${id}.json`); }
function getStatsFile(id) { return path.join(DATA_DIR, `stats-${id}.json`); }
function getWorldFile(id) { return path.join(DATA_DIR, `world-${id}.json`); }

// ═══════════════════════════════════════════════════════
// 1. 场景类型检测（关键词规则引擎）
// ═══════════════════════════════════════════════════════
const SCENE_KEYWORDS = {
  '战斗': [
    '打架', '战斗', '对决', 'PK', '冲锋', '厮杀', '搏斗', '进攻', '防守',
    '拳头', '武器', '招式', '能量', '攻击', '闪避', '格挡', '砍', '刺', '踢',
    '异能', '法术', '斗气', '灵力', '剑气', '子弹', '爆炸', '碰撞', '对轰',
    '比武', '争霸', '竞技', '擂台', '混战', '群殴', '单挑'
  ],
  '日常': [
    '吃饭', '聊天', '逛街', '上学', '上班', '宿舍', '食堂', '教室',
    '散步', '日常', '闲聊', '购物', '做饭', '打扫', '休息', '睡觉',
    '聚会', '派对', '约会', '看电影', '喝咖啡', '喝茶', '啤酒',
    '发呆', '路过', '遇到', '遇见', '打招呼', '寒暄'
  ],
  '悬疑': [
    '调查', '线索', '案件', '密室', '尸体', '谜团', '凶手', '秘密',
    '跟踪', '监视', '窃听', '证据', '推理', '嫌疑人', '真相', '破绽',
    '诡异', '奇怪', '异常', '不对劲', '监听', '暗号', '密码', '档案',
    '文件柜', '保险箱', '监视器', '摄像头', '跟踪器'
  ],
  '情感': [
    '哭泣', '流泪', '拥抱', '告白', '分手', '思念', '回忆', '遗憾',
    '悲伤', '温暖', '感动', '心疼', '愧疚', '后悔', '失望', '失落',
    '委屈', '孤独', '寂寞', '守护', '承诺', '背叛', '原谅', '理解'
  ],
  '冲突': [
    '吵架', '争论', '对峙', '争吵', '怒斥', '反驳', '质疑', '反抗',
    '愤怒', '不满', '抱怨', '指责', '讽刺', '嘲笑', '挖苦', '挑拨',
    '背叛', '拆穿', '质问', '摊牌', '摊牌', '翻脸', '决裂'
  ],
  '转折': [
    '发现', '觉醒', '突破', '升级', '进化', '突变', '意外', '突然',
    '反转', '真相', '揭晓', '暴露', '曝光', '揭开', '打开', '进入',
    '传送', '穿越', '重生', '返场', '归来', '重逢', '偶遇'
  ],
  '开篇': [
    '开始', '首次', '第一次', '初见', '新的一天', '清晨', '苏醒',
    '序章', '楔子', '引子', '开篇', '第一章', '第1章', '第一幕'
  ]
};

// 反向映射：scenario → genre → scene_type
function detectSceneType(plot, genre) {
  if (!plot || plot.trim().length === 0) return '通用';

  const lower = plot.toLowerCase();
  const scores = {};
  for (const [type, keywords] of Object.entries(SCENE_KEYWORDS)) {
    let count = 0;
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) count++;
    }
    if (count > 0) scores[type] = count;
  }

  // 没匹配到→判断是否有强叙事要素
  if (Object.keys(scores).length === 0) {
    if (plot.length < 20) return '开篇';
    return '日常'; // 默认归日常
  }

  // 取最高分
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted[0][0];
}

// ═══════════════════════════════════════════════════════
// 2. 技巧匹配 + 多样性强制 + 冲突检测
// ═══════════════════════════════════════════════════════
function matchTechniques(genres, sceneType, recentTechniqueIds) {
  const techniques = loadTechniques();
  if (techniques.length === 0) return [];

  // 标准化genre：把中文名+styleId统一为匹配key
  const styleIds = new Set();
  genres.forEach(g => {
    if (g.startsWith('s')) styleIds.add(g); // already style ID
    else {
      const mapped = genreToStyleIds(g);
      mapped.forEach(id => styleIds.add(id));
    }
  });
  const matchKeys = [...new Set([...genres, ...styleIds])];

  // 第一层：按genre+scene_type匹配
  let candidates = techniques.filter(t => {
    const genreMatch = t.genres.includes('通用') || matchKeys.some(g => t.genres.includes(g));
    const sceneMatch = t.scene_types.includes(sceneType) || t.scene_types.includes('通用');
    return genreMatch && sceneMatch;
  });

  // 如果匹配太少，放宽到genre匹配（忽略scene_type）
  if (candidates.length < 3) {
    candidates = techniques.filter(t => {
      return t.genres.includes('通用') || matchKeys.some(g => t.genres.includes(g));
    });
  }

  // 如果还是太少，拉所有活跃技巧
  if (candidates.length < 3) {
    candidates = techniques.filter(t => t.status === 'active');
  }
  if (candidates.length < 3) {
    candidates = techniques;
  }

  // 按优先级排序
  candidates.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  candidates = candidates.slice(0, 8); // 取top8候选

  // 第二层：冲突检测
  candidates = candidates.filter(c => {
    // 检查与候选列表中其他高优先级技巧的冲突
    const hasConflict = candidates.some(other => {
      if (other.id === c.id) return false;
      if ((other.priority || 0) < (c.priority || 0)) return false; // 低优先级的冲突不管
      return (other.conflicts_with || []).includes(c.id) || (c.conflicts_with || []).includes(other.id);
    });
    return !hasConflict;
  });

  // 第三层：多样性强制 — 避免重复最近的技巧
  const avoidSet = new Set(recentTechniqueIds || []);
  const preferred = candidates.filter(c => !avoidSet.has(c.id));
  const fallback = candidates.filter(c => avoidSet.has(c.id));

  // 优先选非重复的，最多3条
  let selected = preferred.slice(0, 3);
  if (selected.length < 3) {
    // 用fallback补足
    const needed = 3 - selected.length;
    selected = selected.concat(fallback.slice(0, needed));
  }

  // 更新使用计数
  const all = loadTechniques();
  selected.forEach(s => {
    const idx = all.findIndex(t => t.id === s.id);
    if (idx >= 0) {
      all[idx].usage_count = (all[idx].usage_count || 0) + 1;
    }
  });
  writeJSON(path.join(DATA_DIR, 'techniques.json'), all);

  return {
    selected: selected.map(s => ({
      id: s.id,
      instruction: s.instruction,
      source: s.source
    })),
    pool: candidates.map(c => ({
      id: c.id,
      instruction: c.instruction,
      source: c.source
    }))
  };
}

// ─── 世界约束动态组装（从实时世界数据提取） ───
function buildWorldConstraints(world) {
  var parts = [];

  // 荣耀界面规则（静态描述，世界数据中未有）
  parts.push('【荣耀界面规则——必须遵守】\n'
    + '1. 荣耀是第三人称键鼠操作MMO，通过显示器+键盘+鼠标游玩。角色操作→按WASD移动，鼠标点击地面行走/交互。\n'
    + '2. 游戏界面仅包含：血条、蓝条、技能快捷栏（底部）、小地图（右上角）、聊天框（左下角）。\n'
    + '3. 没有：系统弹窗、任务面板、经验浮动文字（“经验+150”）、技能描述弹窗、装备对比窗口、自动寻路。\n'
    + '4. 玩家间通过打字聊天或语音交流。公会/队伍有独立聊天频道。没有NPC对话树。\n'
    + '5. 副本：固定路线清怪打BOSS后结算，无进度存档。\n'
    + '6. 升级：经验累积到阈值自动提升，无升级动画/弹窗。\n'
    + '7. 禁止：技能框弹出、系统提示音（“叮”）、感叹号标记、任务追踪线、自动寻路、第一人称体感。\n'
    + '8. 法术/魔法/咒语/法力/圣光/祈祷/亡灵/冥界等词不得作为游戏内描述。玩家网名可含。');

  // 从zones提取怪物/BOSS名称（动态）
  var zones = world.zones || {};
  var monsters = {};
  var bosses = [];
  var zoneNames = [];
  Object.values(zones).forEach(function(z) {
    var a = z.attributes || {};
    if (a['等级']) zoneNames.push(z.name + '(' + a['等级'] + ')');
    if (a['BOSS']) {
      a['BOSS'].split(/[,，、/]/).forEach(function(b) {
        b = b.trim().replace(/[（(].*[）)]/g, '').trim();
        if (b) bosses.push(b);
      });
    }
    if (a['普通BOSS']) {
      a['普通BOSS'].split(/[,，、/]/).forEach(function(m) {
        m = m.trim();
        if (m) monsters[m] = true;
      });
    }
  });

  if (zoneNames.length > 0) {
    parts.push('【游戏区域】\n可用区域：' + zoneNames.join('、'));
  }
  if (bosses.length > 0 || Object.keys(monsters).length > 0) {
    var allMonsters = Object.keys(monsters);
    var allBosses = bosses;
    parts.push('【怪物/BOSS】\n可用怪物：' + (allMonsters.length > 0 ? allMonsters.join('、') : '野狗、野猪、野猫、哥布林、蜘蛛等')
      + (allBosses.length > 0 ? '\nBOSS级：' + allBosses.join('、') : ''));
  }

  // 从skills提取技能名（按职业分组，取低等级技能为主）
  var skills = world.skills || {};
  var skillsByClass = {};
  Object.values(skills).forEach(function(s) {
    var a = s.attributes || {};
    var cls = a['职业'] || '通用';
    if (!skillsByClass[cls]) skillsByClass[cls] = [];
    if (skillsByClass[cls].length < 8) {
      var lv = (a['等级'] || '?').replace('Lv.', '').replace('Lv', '');
      if (lv == '1' || lv == '5' || lv == '10' || lv == '?') {
        skillsByClass[cls].push(s.name + '(' + (a['等级'] || '?') + (a['CD'] ? ',' + a['CD'] + 'CD' : '') + ')');
      }
    }
  });
  // 如果某些职业技能太少，补充几个中级技能
  Object.values(skills).forEach(function(s) {
    if (Object.values(skillsByClass).every(function(arr) { return arr.length >= 3; })) return;
    var a = s.attributes || {};
    var cls = a['职业'] || '通用';
    if (!skillsByClass[cls]) skillsByClass[cls] = [];
    if (skillsByClass[cls].length < 5) {
      skillsByClass[cls].push(s.name + '(' + (a['等级'] || '?') + (a['CD'] ? ',' + a['CD'] + 'CD' : '') + ')');
    }
  });

  var entries = Object.entries(skillsByClass);
  if (entries.length > 0) {
    var skillText = entries.sort(function(a, b) { return a[0] > b[0] ? 1 : -1; }).map(function(e) {
      return '  ' + e[0] + '：' + e[1].join('、');
    }).join('\n');
    parts.push('【技能参考】（从世界数据动态获取）\n' + skillText);
  }

  // 从classes提取职业名
  var classes = world.classes || {};
  var classNames = Object.values(classes).map(function(c) { return c.name; }).filter(Boolean);
  if (classNames.length > 0) {
    parts.push('【可用职业】' + classNames.join('、'));
  }

  return parts.join('\n\n');
}

// ═══════════════════════════════════════════════════════
// 3. 上下文组装（项目级别）
// ═══════════════════════════════════════════════════════
function buildContext(projectId, selectedCharIds) {
  if (!projectId) return { background: '', recentHistory: '', plotStatus: '', charCards: '', worldSettings: '', worldChars: '' };


  const project = readJSON(getProjFile(projectId), {});
  const chapters = readJSON(getChapFile(projectId), []);
  const characters = readJSON(getCharFile(projectId), []);
  const plotState = readJSON(getPlotFile(projectId), { threads: [], resolved: [] });

  // 项目背景
  const background = project.desc || project.description || '';
  const genre = project.genre || '';
  // 增强背景：优先用 outline 中的第一章方向和硬锚点，其次用项目描述
  var enrichedBg = background;
  if (enrichedBg.length < 10) {
    // 项目描述太简短（如"同人文"），尝试从 outline 提取第一章方向
    try {
      var outlinePath = path.join(DATA_DIR, 'outline-' + projectId + '.md');
      if (fs.existsSync(outlinePath)) {
        var outlineContent = fs.readFileSync(outlinePath, 'utf8');
        // 提取第一章方向和硬锚点
        var firstChap = outlineContent.match(/第一章[^]*?(?:\n\n|$)/);
        var ironRules = outlineContent.match(/### 故事铁律[^]*?(?:\n###|$)/);
        var originalRules = outlineContent.match(/### 原著铁律[^]*?(?:\n###|$)/);
        var bgParts = [];
        if (originalRules) bgParts.push(originalRules[0].substring(0, 600));
        if (ironRules) bgParts.push(ironRules[0].substring(0, 400));
        if (firstChap) bgParts.push('第一章方向：' + firstChap[0].substring(0, 300));
        if (bgParts.length > 0) enrichedBg = bgParts.join('\n\n');
      }
    } catch(e) { console.error('buildContext outline enrich error:', e.message); }
  }
  const bgText = [enrichedBg, genre ? '小说类型：' + genre : ''].filter(Boolean).join('\n');

  // 最近3章摘要
  const sorted = chapters.sort((a, b) => (b.order || 0) - (a.order || 0));
  const recent = sorted.slice(0, 3).reverse();
  const recentText = recent.length > 0
    ? recent.map(c => `第${c.order}章 ${c.title || ''}: ${c.summary || c.content?.substring(0, 50) || '（内容已写）'}`).join('\n')
    : '（新项目，尚未有前文）';

  // 剧情状态
  let plotText = '';
  if (plotState.threads && plotState.threads.length > 0) {
    plotText += '· 活跃线索：' + plotState.threads.map(t => `${t.name}（状态：${t.status || '进行中'}）`).join('、');
  }
  if (plotState.resolved && plotState.resolved.length > 0) {
    plotText += '\n· 已解决：' + plotState.resolved.map(t => t.name).join('、');
  }
  if (plotState.newElements) {
    plotText += '\n· 最近3章新增：' + plotState.newElements;
  }

  // 出场角色卡
  let charText = '';
  if (selectedCharIds && selectedCharIds.length > 0) {
    const selectedChars = characters.filter(c => selectedCharIds.includes(c.id));
    if (selectedChars.length > 0) {
      charText = selectedChars.map(c =>
        `【${c.name}】${c.role}。${c.desc || ''}`
      ).join('\n');
    }
  }

  // ═══ 新增：世界观数据注入 ═══
  const world = readJSON(getWorldFile(projectId), {});
  let worldSettingsText = '';
  let worldCharsText = '';

  if (Object.keys(world).length > 0) {
    // 从世界观提取角色（优先于 characters-xxx.json 的空数据）
    const worldChars = world.characters || {};
    if (Object.keys(worldChars).length > 0 && (characters.length === 0)) {
      // characters-xxx.json 为空时，从 world 取角色
      if (selectedCharIds && selectedCharIds.length > 0) {
        var sel = Object.values(worldChars).filter(function(c) { return selectedCharIds.includes(c.id); });
        if (sel.length > 0) {
          worldCharsText = sel.map(function(c) {
            var attrs = c.attributes || {};
            var descParts = [];
            if (attrs['职业']) descParts.push('职业:' + attrs['职业']);
            if (attrs['打法']) descParts.push('打法:' + attrs['打法']);
            if (attrs['游戏ID']) descParts.push('ID:' + attrs['游戏ID']);
            if (attrs['性格']) descParts.push('性格:' + attrs['性格']);
            return '【' + c.name + '】' + descParts.join(' | ') + '。' + (attrs['现实背景'] || attrs['关键设定'] || '');
          }).join('\n');
        }
      } else {
        // 未选择角色时，默认注入前6个世界角色
        var allVals = Object.values(worldChars);
        // 将主角排前
        allVals.sort(function(a, b) {
          var aIsMain = (a.attributes||{})['身份'] && (a.attributes['身份']).indexOf('主角') >= 0 ? 0 : 1;
          var bIsMain = (b.attributes||{})['身份'] && (b.attributes['身份']).indexOf('主角') >= 0 ? 0 : 1;
          return aIsMain - bIsMain;
        });
        var defaultChars = allVals.slice(0, 6);
        if (defaultChars.length > 0) {
          worldCharsText = defaultChars.map(function(c) {
            var attrs = c.attributes || {};
            var descParts = [];
            if (attrs['职业']) descParts.push('职业:' + attrs['职业']);
            if (attrs['打法']) descParts.push('打法:' + attrs['打法']);
            if (attrs['游戏ID']) descParts.push('ID:' + attrs['游戏ID']);
            if (attrs['性格']) descParts.push('性格:' + attrs['性格']);
            return '【' + c.name + '】' + descParts.join(' | ') + '。' + (attrs['现实背景'] || attrs['关键设定'] || '').substring(0, 80);
          }).join('\n');
        }
      }
    }

        // ─── 剧情时间线（从世界数据提取）───
    var worldTimelineText = '';
    var wTimeline = world.timeline || {};
    var tlKeys = Object.keys(wTimeline).sort();
    if (tlKeys.length > 0) {
      var tlCompact = tlKeys.map(function(k) {
        var e = wTimeline[k];
        return (e.day || '') + ': ' + (e.events || '').substring(0, 100);
      }).filter(Boolean).join('\n');
      // 时间线仅保留开头提示，防止AI被原著信息干扰
      if (tlCompact.length > 200) tlCompact = tlCompact.substring(0, 200) + '...（时间线已精简）';
      worldTimelineText = '【剧情时间线】\n' + tlCompact + '\n（共' + tlKeys.length + '个事件节点）';
    }

    // ─── 全角色名录（从世界数据提取）───
    var worldRosterText = '';
    var wChars = world.characters || {};
    var wcKeys = Object.keys(wChars);
    if (wcKeys.length > 0) {
      var rosterList = Object.values(wChars).map(function(c) {
        var a = c.attributes || {};
        var cls = a['职业'] || '';
        var role = a['身份'] || '';
        var tag = role.indexOf('主角') >= 0 ? '★' : '';
        return tag + c.name + (cls ? '(' + cls + ')' : '');
      });
      worldRosterText = '【全角色名录（' + wcKeys.length + '人）】\n' + rosterList.join('、');
      if (worldRosterText.length > 1500) worldRosterText = worldRosterText.substring(0, 1500) + '...';
    }

    // ─── 活大纲注入（笔直注入到背景中）───
    var worldOutlineText = '';
    var outlineFile3 = path.join(DATA_DIR, 'outline-' + projectId + '.md');
    try {
      if (fs.existsSync(outlineFile3)) {
        worldOutlineText = '【活大纲】\n' + fs.readFileSync(outlineFile3, 'utf8').substring(0, 1500);
      }
    } catch(e) { console.error('buildContext outline file error:', e.message); }

    // 世界观设定摘要（rules + classes + skills 的核心规则）
    // 世界观设定摘要（rules + classes + skills 的核心规则）
    const rules = world.rules || {};
    const rulesList = Object.values(rules);
    if (rulesList.length > 0) {
      // 取前10条核心规则摘要
      const coreRules = rulesList.slice(0, 5).map(r => {
        const attrs = r.attributes || {};
        return `· ${r.name}：${(attrs['说明'] || attrs['概述'] || attrs['规则'] || attrs['内容'] || attrs['core_rule'] || attrs['描述'] || attrs['desc'] || '').substring(0, 80)}`;
      }).join('\n');
      worldSettingsText = `【荣耀游戏核心设定】\n${coreRules}`;
      if (rulesList.length > 10) {
        worldSettingsText += `\n（共${rulesList.length}条规则，以上为主要摘要）`;
      }
    }

    // 职业体系
    const classes = world.classes || {};
    const classesList = Object.values(classes);
    if (classesList.length > 0) {
      const classSummary = classesList.map(c => {
        const a = c.attributes || {};
        return `${c.name}(${a['定位'] || a['描述'] || ''})`;
      }).join('、');
      worldSettingsText += `\n\n【职业体系（${classesList.length}种）】\n${classSummary}`;
    }

    // world constraints: dynamically extracted from live world data
    worldSettingsText += buildWorldConstraints(world);
  }

  return {
    background: bgText,
    recentHistory: recentText,
    plotStatus: plotText,
    charCards: charText,
    worldSettings: worldSettingsText,
    worldChars: worldCharsText,
    worldTimeline: worldTimelineText,
    worldRoster: worldRosterText,
    worldOutline: worldOutlineText,
    storyState: getInjectContext(projectId)
  };
}

// ═══════════════════════════════════════════════════════
// 4. 章节DNA分析
// ═══════════════════════════════════════════════════════
function analyzeDNA(content, chapterOrder, techniqueIds) {
  if (!content) return null;

  const cleanContent = content.replace(/\s/g, '');
  const totalChars = cleanContent.length;
  
  // 统计对话占比（引号内的内容）
  const dialogMatches = content.match(/[""「」『』]([^""「」『』]*?)[""「」『』]/g) || [];
  const dialogChars = dialogMatches.join('').length;
  const dialogRatio = totalChars > 0 ? Math.round(dialogChars / totalChars * 100) : 0;

  // 统计句子（按句号、问号、感叹号切分）
  const sentences = content.split(/[。！？\n]/).filter(s => s.trim().length > 0);
  const avgSentenceLen = sentences.length > 0 ? Math.round(totalChars / sentences.length) : 0;

  // 统计段落数（按空行切分）
  const paragraphs = content.split(/\n\s*\n/);
  const avgParagraph = paragraphs.length > 0 ? Math.round(sentences.length / paragraphs.length) : 0;

  // 粗略检测叙事方式
  let narrative = 'linear';
  if (content.includes('回忆') || content.includes('几年前') || content.includes('那时候')) {
    narrative = 'flashback';
  } else if (content.includes('与此同时') || content.includes('另一边') || content.includes('同一时间')) {
    narrative = 'parallel';
  }

  // 动作场景检测
  const actionKeywords = ['打','踢','冲','撞','砸','斩','刺','砍','挡','躲','闪','跳'];
  let actionCount = 0;
  for (const kw of actionKeywords) {
    const re = new RegExp(kw, 'g');
    const matches = content.match(re);
    if (matches) actionCount += matches.length;
  }

  return {
    chapterOrder,
    totalChars,
    dialogRatio,
    avgSentenceLen,
    avgParagraph,
    narrative,
    actionScore: actionCount,
    generatedAt: new Date().toISOString(),
    techniqueIds: techniqueIds || []
  };
}

// ═══════════════════════════════════════════════════════
// 5. 多样性检查 — 检测连续章节同质化
// ═══════════════════════════════════════════════════════
function checkDiversity(projectId, newDNA) {
  const dnas = readJSON(getDNAFile(projectId), []);
  
  // 取最近5章
  const recent = dnas.slice(-5);
  if (recent.length < 2) return { warnings: [], adjustments: [] };
  
  const warnings = [];
  const adjustments = [];

  // 检查对话比例是否连续趋同
  const dialogRatios = recent.map(d => d.dialogRatio);
  const avgDialog = dialogRatios.reduce((a, b) => a + b, 0) / dialogRatios.length;
  if (avgDialog > 50 && recent.every(d => d.dialogRatio > 45)) {
    warnings.push(`连续${recent.length}章对话占比偏高（平均${Math.round(avgDialog)}%）`);
    adjustments.push('降低对话密度权重');
  }

  // 检查叙事方式是否重复
  const narratives = recent.map(d => d.narrative);
  if (new Set(narratives).size === 1 && recent.length >= 3) {
    warnings.push(`连续${recent.length}章使用同一叙事方式（${narratives[0]}）`);
    adjustments.push('换叙事方式');
  }

  // 检查动作密度
  const actionScores = recent.map(d => d.actionScore);
  const avgAction = actionScores.reduce((a, b) => a + b, 0) / actionScores.length;
  if (avgAction < 3 && recent.length >= 3) {
    warnings.push(`连续${recent.length}章动作场景偏少（平均动作词${Math.round(avgAction)}次）`);
    adjustments.push('增加动作/冲突描写');
  }

  // 检查章节篇幅波动
  const lengths = recent.map(d => d.totalChars);
  if (lengths.length >= 3) {
    const minLen = Math.min(...lengths);
    const maxLen = Math.max(...lengths);
    if (maxLen - minLen < 300 && maxLen > 500) {
      warnings.push(`章节篇幅变化不足（${minLen}-${maxLen}字，差距<300）`);
      adjustments.push('调整本章字数目标');
    }
  }

  return { warnings, adjustments };
}

// ═══════════════════════════════════════════════════════
// 6. Prompt组装器
// ═══════════════════════════════════════════════════════
function assemblePrompt(params) {
  const { persona, stylePrompt, styleTraitsText, context, techniques, sceneType, plot, requirements, wordCount, diversityAdjustments, techniquePool, chapterIndex, lastUsedTechs, genre } = params;

  const parts = [];

  // Layer 1: 基础系统提示（模型人格）
  parts.push(persona.systemPrompt);

  // Layer 2: 写作风格
  if (stylePrompt) parts.push(stylePrompt);

  // Layer 2.5: 风格详细指导（新：来自styles.json的traits）
  if (styleTraitsText) parts.push(styleTraitsText);

  // Layer 3: 场景类型标注
  if (sceneType !== '通用') {
    parts.push('\n【当前场景类型】' + sceneType);
  }

  // Layer 3.5: 小说类型
  if (genre) {
    parts.push('\n【小说类型】' + genre);
  }

  // Layer 4: 写作技巧 — 单章 vs 多章
  if (techniquePool && techniquePool.length >= 3 && chapterIndex !== undefined) {
    // 多章模式：注入全部候选技巧池 + 动态选择
    var techItems = techniquePool.map(function(t, idx) { return '[' + (idx+1) + '] ' + t.instruction; }).join('\n');
    parts.push('\n【写作技巧池·动态选择】\n'
      + '按本章内容自行选择技巧融入写作：\n\n'
      + techItems
      + '\n\n选择规则：'
      + ' 1)每章至少1条最多3条'
      + ' 2)同技巧不宜连用超3章(节奏变化时必须换至少1条)'
      + ' 3)长篇(50章+)应覆盖至少10种不同技巧'
      + ' 4)在内容末尾用【本章侧重:编号】标记所用技巧(如【本章侧重:1,3,5])' + (lastUsedTechs ? '\n\n上章侧重: ' + lastUsedTechs : ''));
  } else if (techniques && techniques.length > 0) {
    // 单章模式：固定注入
    parts.push('\n【写作技巧参考】\n' + techniques.map(function(t) { return '· ' + t.instruction; }).join('\n'));
  }

  // Layer 5: 项目上下文 + 世界观数据
  // ⚠ 顺序非常重要！活大纲/硬锚点必须放最前面，让AI优先看到
  const contextLines = [];
  
  // [1] 活大纲（硬锚点优先，不可违抗的创作铁律）
  if (context.worldOutline) contextLines.push(context.worldOutline);
  
  // [2] 背景设定
  if (context.background) contextLines.push(`【故事背景】${context.background}`);
  
  // [4] 世界设定规则
  if (context.worldSettings) contextLines.push(`【世界设定】\n${context.worldSettings}`);
  
  // [5] 出场角色（详细卡片）
  if (context.worldChars && !context.charCards) contextLines.push(`【出场角色】\n${context.worldChars}`);
  if (context.charCards) contextLines.push(`【出场角色】\n${context.charCards}`);
  
  // [6] 故事备忘
  if (context.storyState) contextLines.push('【故事备忘】\n' + (context.storyState.length > 1000 ? context.storyState.substring(0, 1000) + '...（较旧的事实已折叠）' : context.storyState));
  
  // [7] 前情提要与剧情状态
  if (context.recentHistory) contextLines.push(`【前情提要】\n${context.recentHistory}`);
  if (context.plotStatus) contextLines.push(`【剧情状态】${context.plotStatus}`);
  
  // [8] 强制约束（AI必须遵守）
  // 从 outline 中动态读取约束规则，不硬编码
  var constraints = '';
  if (context.worldOutline && context.worldOutline.indexOf('硬锚点') >= 0) {
    var outlineText = context.worldOutline;
    var ironParts = outlineText.match(/### 原著铁律[^]*?(?:\n###|$)/);
    var storyParts = outlineText.match(/### 故事铁律[^]*?(?:\n###|$)/);
    var combined = [];
    if (ironParts) combined.push('【铁律】\n' + ironParts[0].replace('### 原著铁律','').replace(/\n###.*$/,''));
    if (storyParts) combined.push('【故事铁律】\n' + storyParts[0].replace('### 故事铁律','').replace(/\n###.*$/,''));
    if (combined.length > 0) constraints = combined.join('\n\n');
  }
  if (contextLines.length > 0) {
    parts.push(`\n${contextLines.join('\n\n')}`);
  }

  // Layer 6: 多样性调整（如果有）
  if (diversityAdjustments && diversityAdjustments.length > 0) {
    parts.push(`\n【注意】${diversityAdjustments.join('；')}`);
  }

  // Layer 7: 用户剧情
  const userParts = [];
  if (plot) userParts.push(`本章剧情：${plot}`);
  if (wordCount) userParts.push(`字数要求：${wordCount}字`);
  if (requirements) userParts.push(`额外要求：${requirements}`);

  const systemMsg = parts.join('\n\n');
  const userMsg = userParts.length > 0 ? userParts.join('\n') : '请根据以上内容生成小说正文。';

  return { systemMsg, userMsg };
}

// ═══════════════════════════════════════════════════════
// 7. 后处理 — 自动保存上下文
// ═══════════════════════════════════════════════════════
function updateProjectContext(projectId, chapterOrder, title, content, summary, techniqueIds) {
  if (!projectId) return;

  // 更新章节摘要
  const chapters = readJSON(getChapFile(projectId), []);
  const chapterIdx = chapters.findIndex(c => c.order === chapterOrder);
  if (chapterIdx >= 0) {
    chapters[chapterIdx].summary = summary || content.substring(0, 100);
    chapters[chapterIdx].title = title || chapters[chapterIdx].title;
    writeJSON(getChapFile(projectId), chapters);
  }

  // 分析并保存DNA
  const dna = analyzeDNA(content, chapterOrder, techniqueIds);
  if (dna) {
    const dnas = readJSON(getDNAFile(projectId), []);
    dnas.push(dna);
    writeJSON(getDNAFile(projectId), dnas);
  }

  // 自动检测新线索/新元素（简单关键词）
  const plotState = readJSON(getPlotFile(projectId), { threads: [], resolved: [], newElements: '' });
  
  const newElementKeywords = ['发现', '新', '出现', '进入', '打开'];
  const foundNew = [];
  for (const kw of newElementKeywords) {
    if (content.includes(kw)) {
      // 取kw周围的句子
      const idx = content.indexOf(kw);
      const snippet = content.substring(Math.max(0, idx - 10), idx + 30);
      foundNew.push(snippet.replace(/\n/g, ' ').trim());
    }
  }
  if (foundNew.length > 0) {
    plotState.newElements = foundNew.slice(0, 3).join('；');
  }
  writeJSON(getPlotFile(projectId), plotState);
}

// ═══════════════════════════════════════════════════════
// 8. 避坑检查（负面教训检查）
// ═══════════════════════════════════════════════════════
function checkPitfalls(content) {
  const pitfalls = readJSON(path.join(DATA_DIR, 'pitfalls.json'), []);
  if (pitfalls.length === 0) return [];
  
  const warnings = [];
  for (const p of pitfalls) {
    if (p.check_type === 'contains' && content.includes(p.pattern)) {
      warnings.push(p.warning);
    }
    if (p.check_type === 'regex') {
      try {
        const re = new RegExp(p.pattern, 'g');
        if (re.test(content)) warnings.push(p.warning);
      } catch(e) { console.warn('Invalid pitfall regex:', p.pattern, e.message); }
    }
  }
  return warnings;
}

// ═══════════════════════════════════════════════════════
// API: 引擎生成（结构化输入 → 自动组装 → 调用API）
// ═══════════════════════════════════════════════════════
router.post('/generate', async (req, res) => {
  try {
    const { projectId, plot, characters, style, genre, theme, model, thinkingBudget, requirements, wordCount, chapterCount } = req.body;

    if (!plot) return res.status(400).json({ success: false, error: '请输入本章剧情' });
    // 参数类型校验
    if (wordCount && (isNaN(parseInt(wordCount)) || parseInt(wordCount) < 100)) {
      return res.status(400).json({ success: false, error: '字数参数异常（需≥100的数字）' });
    }
    if (chapterCount && (isNaN(parseInt(chapterCount)) || parseInt(chapterCount) < 1 || parseInt(chapterCount) > 50)) {
      return res.status(400).json({ success: false, error: '章节数参数异常（需1-50的数字）' });
    }

    // ── 多章模式：非1的章节数 → 按上下文续写 ──
    const isMultiChapter = chapterCount && parseInt(chapterCount) > 1;
    const isDualVersion = req.body.dualVersion && (!chapterCount || parseInt(chapterCount) === 1) && model !== 'thinker';

    // ── 1. 场景类型检测 ──
    const sceneType = detectSceneType(plot, genre);

    // ── 2. 加载项目上下文 ──
    const context = buildContext(projectId, characters);

    // ── 3. 加载模型人格 ──
    const MODEL_PERSONAS = {
      'atmosphere': {
        name: '氛围版', emoji: '🌌', desc: '氛围营造、情绪渲染、环境描写优先',
        temp: 0.85, maxTokens: 4000, price: 3,
        systemPrompt: `你是一个擅长氛围描写的网络小说作家。\n【核心写作原则】\n1. 氛围优先：用环境和感官描写营造情绪，而非直白叙述\n2. 五感写作：每段至少涉及2种感官体验\n3. 克制对白：多于描写，少于对话\n4. 情绪外化：角色的心情通过天气/光线/场景细节来传达\n5. 留白艺术：重要的东西不必说透，让读者自己感受\n6. 节奏控制：紧张时短句密集，舒缓时长句舒展\n7. 不用AI万能句式：避免"突然""就在这时""然而""但是""而这时"\n\n【输出要求】\n- 如果需要续写，严格延续前文的氛围基调和叙事节奏\n- 段落之间留空行，每段不超过5句话\n- 直接输出正文，不要开场白`
      },
      'thinker': {
        name: '思考者', emoji: '🧠', desc: '逻辑推理、深度情节',
        temp: 0.7, maxTokens: 5000, price: 12,
        systemPrompt: `你是一个擅长逻辑叙事和深度情节的网络小说作家。\n【核心写作原则】\n1. 因果链清晰：每个情节节点都有明确的因果联系\n2. 动机驱动：角色的每个行动都有合理的心理动因\n3. 伏笔回收：前文的伏笔要在后续适当呼应\n4. 节奏层次：情节推进要有"蓄力-爆发-回落"的节律\n5. 多线叙事：同时推进2-3条叙事线，在关键节点交汇\n6. 不用AI万能句式：避免"突然""就在这时""然而""但是""而这时"\n\n【输出要求】\n- 如果需要续写，严格贴合前文的情节逻辑\n- 段落之间逻辑递进清晰\n- 直接输出正文，不要开场白`
      },
      'delicate': {
        name: '细腻版', emoji: '🪶', desc: '情感细节、心理描写、微表情',
        temp: 0.8, maxTokens: 4000, price: 3,
        systemPrompt: `你是一个擅长细腻描写的网络小说作家。\n【核心写作原则】\n1. 微表情优先：用细微的面部表情和身体语言替代直白的心理描述\n2. 内心独白有节制：每段内心独白不超过50字\n3. 感官细节：用具体细节替代抽象描述\n4. 情感层次：情绪不是非黑即白，描述中间地带\n5. 对话留白：重要的东西在没说出口的话里\n6. 节奏有张有弛：情绪紧张和松弛交替\n7. 不用AI万能句式：避免"突然""就在这时"\n\n【输出要求】\n- 保持前文的情感基调和人物关系稳定性\n- 段落留空行，适当分段\n- 直接输出正文，不要开场白`
      },
      'fantasy': {
        name: '奇想版', emoji: '🎆', desc: '创意脑洞、出人意料',
        temp: 0.95, maxTokens: 4000, price: 3,
        systemPrompt: `你是一个创意无限的网络小说作家。\n【核心写作原则】\n1. 反套路优先：拒绝老套情节，寻找出其不意的叙事角度\n2. 设定新颖：世界观和设定要有独特的记忆点\n3. 出人意料：每500字至少有一个让人"没想到"的展开\n4. 合理创新：创意可以疯狂，但内部逻辑必须自洽\n5. 节奏明快：不沉溺于设定说明\n6. 不用AI万能句式\n\n【输出要求】\n- 直接输出正文，不需要解释创意来源`
      },
      'inspiration': {
        name: '灵光版', emoji: '💡', desc: '灵感迸发、快节奏、强钩子',
        temp: 0.9, maxTokens: 3000, price: 3,
        systemPrompt: `你是一个灵感型网络小说作家，擅长快速抓住读者注意力。\n【核心写作原则】\n1. 开篇即钩子：前100字必须有强烈的吸引力\n2. 快节奏：信息密度高，每段有推进\n3. 强期待感：每段结尾留下想继续看的内容\n4. 简洁有力：用最少的字传达最多的信息\n5. 场景切换快：不在地点描述上浪费笔墨\n6. 对话利落：要有火药味或信息量\n7. 不用AI万能句式\n\n【输出要求】\n- 直接输出正文，不要开场白`
      },
      'free': {
        name: '豆包（免费版）', emoji: '🆓', desc: '基础写作能力',
        temp: 0.7, maxTokens: 2000, price: 0,
        systemPrompt: `你是一个网络小说作者。请根据用户要求写出流畅自然的网络小说内容。要求：\n1. 语言简单直接，不要过度修饰\n2. 段落简短，方便手机阅读\n3. 避免AI常见的句式\n4. 如需续写，遵循前文风格基本保持一致\n5. 直接输出正文，不要开场白`
      }
    };

    const persona = MODEL_PERSONAS[model] || MODEL_PERSONAS['atmosphere'];

    // ── 4. 匹配技巧（读取近3次DNA，避免重复技巧） ──
    const recentDNA = projectId ? readJSON(getDNAFile(projectId), []).slice(-3) : [];
    const usedTechniques = recentDNA.flatMap(d => d.techniqueIds || []).slice(-5); // 取最近5条不重复
    const genres = genre ? genre.split(',').map(s => s.trim()).filter(Boolean) : ['通用'];
    const tech = matchTechniques(genres, sceneType, usedTechniques);
    const techniques = tech.selected;
    const techniquePool = tech.pool;

    // ── 5. 多样性检查 ──
    let diversityAdjustments = [];
    if (projectId) {
      const existingDNA = readJSON(getDNAFile(projectId), []);
      // 用现有DNA做一个预检查
      const preCheck = checkDiversity(projectId, { dialogRatio: 0, narrative: '', actionScore: 0 });
      if (preCheck.adjustments.length > 0) {
        diversityAdjustments = preCheck.adjustments;
      }
    }

    // ── 6. 随机化temperature ──
    const tempVariation = 0.7 + Math.random() * 0.25; // 0.7-0.95随机
    const actualTemp = model === 'thinker' ? 0.7 : tempVariation;

    // ── 7. 组装prompt（新：从styles.json加载风格指导）──
    const styleGuide = loadStyleGuide();
    let styleDesc = '';
    let styleTraitsText = '';
    
    if (style) {
      // 支持多选：逗号分隔的style ID列表（来自前端checkbox多选）
      var styleIds = style.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      var styleParts = [];
      var traitParts = [];
      styleIds.forEach(function(sid) {
        var matched = styleGuide.find(function(s) { return s.id === sid || s.name === sid || s.name.includes(sid); });
        if (matched) {
          styleParts.push(matched.desc);
          if (matched.traits && matched.traits.length > 0) {
            traitParts.push('【' + matched.name + '风格要求】' + matched.traits.slice(0, 4).map(function(t, i) { return (i+1) + '. ' + t; }).join('\n'));
          }
        }
      });
      if (styleParts.length > 0) {
        styleDesc = '\n【写作风格要求】请参考以下风格指导综合创作：\n' + styleParts.join('\n---\n');
      } else {
        styleDesc = style ? '\n【写作风格要求】' + style : '';
      }
      if (traitParts.length > 0) {
        styleTraitsText = '\n【风格详细指导】\n' + traitParts.join('\n');
      }
    }
    
    // 额外：如果项目有genre，自动注入对应的风格前3条指导
    if (!styleTraitsText && genre) {
      const sids = genreToStyleIds(genre);
      for (const sid of sids) {
        const sg = styleGuide.find(s => s.id === sid);
        if (sg && sg.traits && sg.traits.length > 0) {
          styleTraitsText = `\n【${sg.name}风格参考】\n${sg.traits.slice(0, 3).map((t, i) => `${i+1}. ${t}`).join('\n')}`;
          break;
        }
      }
    }

    const prompt = assemblePrompt({
      persona,
      stylePrompt: styleDesc || style || '',
      styleTraitsText,
      context,
      techniques,
      sceneType,
      plot,
      requirements,
      wordCount,
      diversityAdjustments,
      genre
    });

    // ── 8. 调用DeepSeek API ──
    const isReasoner = model === 'thinker';
    
    const apiBody = {
      model: config.DEEPSEEK_CHAT_MODEL || 'deepseek-reasoner',
      messages: [
        { role: 'system', content: prompt.systemMsg },
        { role: 'user', content: prompt.userMsg }
      ],
      stream: false
    };

    if (!isReasoner) {
      apiBody.temperature = actualTemp;
            // 根据字数需求动态调整 max_tokens（wordCount×2字符，保底2000上限12000）
      if (wordCount) {
        var parsedWc = parseInt(wordCount);
        if (!isNaN(parsedWc) && parsedWc > 0) {
          var dynamicTokens = Math.min(Math.max(parsedWc * 2, 2000), 12000);
          apiBody.max_tokens = dynamicTokens;
        }
      } else {
        // max_tokens 已在上面按 wordCount 动态设置
      if (!apiBody.max_tokens) apiBody.max_tokens = persona.maxTokens || 4000;
      }
    } else {
      apiBody.max_tokens = 8000;
      if (thinkingBudget) apiBody.thinking_budget = thinkingBudget;
    }

    // ── 8b. 生成策略：双版本 / 多章续写 ──
    const guard = require('../guard');
    async function callAPI(msg, tempOverride) {
      // ── 成本防护 1：余额熔断（低余额直接拒绝，不发起请求）──
      const gate = await guard.checkBalanceGate();
      if (!gate.ok) {
        throw new Error('BUDGET_BLOCKED: ' + gate.reason);
      }
      const b = JSON.parse(JSON.stringify(apiBody));
      b.messages = msg || b.messages;
      // ── 成本防护 2：输入 token 硬阈值（超限截断）──
      const fitted = guard.fitMessages(b.messages, guard.MAX_INPUT_TOKENS);
      if (fitted.truncated) {
        console.warn('[guard] 输入超限已截断: ≈' + guard.countMessagesTokens(b.messages) + ' → ' + fitted.total + ' tokens');
        b.messages = fitted.messages;
      }
      // ── 成本防护 3：输出钳制（reasoner 上限 8000，普通 6000）──
      b.max_tokens = guard.clampMaxTokens(b.max_tokens, isReasoner ? 8000 : 6000);
      if (!isReasoner) b.temperature = tempOverride || actualTemp;
      var _lastErr = null;
      if (!SWITCHES.enableRetry) {
        // 单次调用，不重试
        const r = await fetch(config.DEEPSEEK_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.DEEPSEEK_API_KEY },
          body: JSON.stringify(b)
        });
        if (!r.ok) throw new Error('API '+r.status+': '+(await r.text()).substring(0,200));
        const j = await r.json();
        guard.recordUsage(b.model, j.usage?.prompt_tokens||0, j.usage?.completion_tokens||0, j.usage?.prompt_cache_hit_tokens||0, 'writing-engine');
        return {
          content: j.choices?.[0]?.message?.content || '',
          thinking: isReasoner ? (j.choices?.[0]?.message?.reasoning_content || null) : null,
          model: j.model || 'deepseek-reasoner',
          usage: j.usage
        };
      }
      for (var _retry = 0; _retry < 2; _retry++) {
        try {
          const r = await fetch(config.DEEPSEEK_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.DEEPSEEK_API_KEY },
            body: JSON.stringify(b)
          });
          if (!r.ok) {
            var _status = r.status;
            var _body = (await r.text()).substring(0,200);
            // 4xx业务错误(欠费/不可达/内容违规): 不重试
            if (_status >= 400 && _status < 500 && _status !== 429) {
              throw new Error('API '+_status+': '+_body);
            }
            // 429限流/5xx服务端: 重试
            _lastErr = new Error('API '+_status+': '+_body);
            if (_retry < 1) {
              var _delay = _status === 429 ? 4000 : 2000;
              await new Promise(function(q) { setTimeout(q, _delay); });
              continue;
            }
            throw _lastErr;
          }
          const j = await r.json();
          guard.recordUsage(b.model, j.usage?.prompt_tokens||0, j.usage?.completion_tokens||0, j.usage?.prompt_cache_hit_tokens||0, 'writing-engine');
          return {
            content: j.choices?.[0]?.message?.content || '',
            thinking: isReasoner ? (j.choices?.[0]?.message?.reasoning_content || null) : null,
            model: j.model || 'deepseek-reasoner',
            usage: j.usage
          };
        } catch(e) { _lastErr = e; if (_retry < 1) { await new Promise(function(q) { setTimeout(q, 2000); }); } }
      }
      throw _lastErr || new Error('API call failed after retry');
    }

    let results = [];
    let allContent = '';

    if (isDualVersion && !isReasoner) {
      // ── 双版本模式：一次生成2个版本供用户挑选 ──
      const [r1, r2] = await Promise.all([
        callAPI(null, 0.75),
        callAPI(null, 0.95)
      ]);
      results = [
        { version: 'A', content: r1.content, temp: 0.75 },
        { version: 'B', content: r2.content, temp: 0.95 }
      ];
      allContent = r1.content + '\n\n---版本B---\n\n' + r2.content;
    } else var nextOrder;
    if (isMultiChapter) {
      // ── 多章续写模式：每章生成后实时更新故事状态+预测方向 ──
      const totalChapters = parseInt(chapterCount) || 2;
      let currentPlot = plot;
      let contextHistory = '';
      let lastUsedTechs = '';
      // 加载已有章节供预测参考
      let tempChapters = readJSON(getChapFile(projectId), []);
      // 预读世界数据和活大纲（供 predictDirection 使用）
      var worldData = readJSON(getWorldFile(projectId), {});
      const outlineFile2 = path.join(DATA_DIR, 'outline-' + projectId + '.md');
      const outlineText = fs.existsSync(outlineFile2) ? fs.readFileSync(outlineFile2, 'utf8').substring(0, 2000) : '';
      // 计算真实章节序号偏移
      var baseOrder = tempChapters.length > 0 ? Math.max.apply(null, tempChapters.map(function(c) { return c.order || 0; })) + 1 : 1;
      for (let i = 0; i < totalChapters; i++) {
        const chActualOrder = baseOrder + i;
        // 多章模式：动态技巧池 -> 注入全部候选技巧，AI 自行根据内容选择
        const hasPool = isMultiChapter && techniquePool && techniquePool.length >= 3;
        const chPrompt = assemblePrompt({
          persona, stylePrompt: styleDesc || style || '',
          styleTraitsText,
          context: {
            ...context,
            recentHistory: contextHistory ? contextHistory + '\n\n---\n\n请基于以上所有(前文+已有章节摘录)继续书写下一章。' : context.recentHistory
          },
          genre,
          techniques: hasPool ? techniquePool : techniques,
          techniquePool: hasPool ? techniquePool : undefined,
          chapterIndex: i,
          lastUsedTechs,
          sceneType,
          plot: i === 0 ? currentPlot : (currentPlot ? '基于原剧情方向继续：' + currentPlot.substring(0, 100) : '延续前文剧情继续发展'),
          requirements: `第${chActualOrder}章。` + (requirements || ''),
          wordCount,
          diversityAdjustments
        });
        const r = await callAPI([
          { role: 'system', content: chPrompt.systemMsg },
          { role: 'user', content: chPrompt.userMsg }
        ], actualTemp);
        // 自动为后续章节提供上下文：累计前几章摘要（最近~3章内容，每章~500字）
        var _chCtx = '第' + chActualOrder + '章摘录：' + r.content.replace(/\n/g, ' ').substring(0, 500);
        contextHistory = contextHistory ? contextHistory.slice(-1500) + '\n\n---\n\n' + _chCtx : _chCtx;
        // 从本章输出提取技巧标记，供下章参考
        var techMatch = r.content.match(/【本章侧重:\s*([^】]+)】/);
        lastUsedTechs = techMatch ? techMatch[1].trim() : '';
        results.push({
          version: 'C' + (i+1),
          chapterOrder: chActualOrder,
          content: r.content,
          temp: 0,
          title: req.body.chapterTitle ? `${req.body.chapterTitle}·${i+1}` : (extractChapterTitle(r.content) || `第${chActualOrder}章`)
        });
        // ── 实时上下文更新：故事状态 + 下章方向 ──
        // 1. 加入临时列表（供预测用）
        tempChapters.push({ order: chActualOrder, title: results[results.length-1].title || '', content: r.content });
        // 2. 立即更新故事状态（正则即刻 + AI异步）
        try {
          autoUpdateStory(projectId, r.content, chActualOrder);
          var injectCtx = getInjectContext(projectId);
          if (injectCtx) context.storyState = injectCtx;
        } catch(e) { console.error('autoUpdateStory loop error:', e); }
        // 3. 预测下章方向（每章一次DeepSeek调用，约3s）
        try {
          var pred = await predictDirection(projectId, tempChapters, worldData, outlineText, genre, style);
          if (pred.success && pred.directions.length > 0) {
            var d = pred.directions[0];
            context.plotStatus = '建议后续方向：' + d.title + '（' + d.summary.substring(0, 120) + '）';
          }
        } catch(e) { console.error('predictDirection loop error:', e); }
        // 增量保存：每生成一章立即写入文件，防止崩溃丢失全部
        // ⚠ 双重写入风险：此处增量保存 + 下方第1269行的 writeJSON 构成双重写入。
        //   多章模式下，循环内增量保存已写入文件，但循环结束后 writeJSON(chapters)
        //   是基于之前的旧 chapters 重新写入，可能导致之前增量写入的章节丢失。
        (function() {
          try {
            var _cur = fs.readFileSync(getChapFile(projectId), 'utf8');
            var _allChs = JSON.parse(_cur);
            var _exit = _allChs.find(function(x) { return x.order === chActualOrder; });
            if (!_exit) {
              _allChs.push({
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                projectId: projectId,
                title: results[results.length-1].title || '第' + chActualOrder + '章',
                content: r.content,
                summary: r.content.replace(/\s/g, '').substring(0, 60) + '...',
                order: chActualOrder,
                wordCount: r.content.replace(/\s/g, '').length,
                techniqueIds: techniques ? techniques.map(function(t) { return t.id; }) : [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
              writeJSON(getChapFile(projectId), _allChs);
              console.log('[增量保存] 第' + chActualOrder + '章已保存');
            }
          } catch(e) { console.error('[增量保存] 失败:', e.message); }
        })();
        allContent += (i > 0 ? '\n\n---下一章---\n\n' : '') + r.content;
      }
    } else {
      // ── 单版本模式（旧行为，用于思考者等推理模型） ──
      const r = await callAPI();
      results = [{ version: 'A', content: r.content, temp: actualTemp }];
      allContent = r.content;
    }

    // ── 9. 后处理 ──
    const content = results.length > 0 ? results[0].content : allContent;
    const summary = allContent.replace(/\s/g, '').substring(0, 80) + '...';
    
    // 从生成内容自动提取章节名
    function extractChapterTitle(text) {
      if (!text) return '';
      var firstLine = text.split('\n').find(function(l) { return l.trim(); });
      if (!firstLine) return '';
      var trimmed = firstLine.trim().replace(/^#+\s*/, '');
      // 匹配「第X章 XXX」模式（中英文数字都支持）
      var chMatch = trimmed.match(/^第[一二三四五六七八九十百千零\d]+章[\s　]*(.+)$/);
      if (chMatch) return chMatch[1].trim();
      // 匹配「第X节」或「第X话」
      var secMatch = trimmed.match(/^第[一二三四五六七八九十百千零\d]+[节话]\s*(.+)$/);
      if (secMatch) return secMatch[1].trim();
      // 匹配纯文本标题（不是章节格式）
      if (trimmed.length < 30 && !trimmed.startsWith('【') && !trimmed.startsWith('“‘') && trimmed.length > 1) {
        return trimmed;
      }
      return '';
    }

    // 保存到项目（多章模式为每个篇章保存独立章节）
    if (projectId && allContent.trim()) {
      const chapters = readJSON(getChapFile(projectId), []);
      
      if (isMultiChapter) {
        // 多章：每章独立保存
        for (const result of results) {
          nextOrder = chapters.length > 0 ? Math.max(...chapters.map(c => c.order)) + 1 : 1;
          const chTitle = extractChapterTitle(result.content) || result.title || `第${nextOrder}章`;
          const chSummary = result.content.replace(/\s/g, '').substring(0, 60) + '...';
          if (result.content.trim()) {
            chapters.push({
              id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
              projectId, title: chTitle, content: result.content, summary: chSummary,
              order: nextOrder, wordCount: result.content.replace(/\s/g, '').length,
              techniqueIds: techniques.map(t => t.id),
              createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
            });
          }
        }
      } else {
        // 单章（含双版本）：只保存版本B（用户可选择版本）
        const targetContent = isDualVersion ? results[1].content : content;
        nextOrder = chapters.length > 0 ? Math.max(...chapters.map(c => c.order)) + 1 : 1;
        // 自动提取标题：优先从内容第一行提取，其次用户提供的标题，最后默认
        const autoTitle = extractChapterTitle(targetContent);
        const title = autoTitle || req.body.chapterTitle || `第${nextOrder}章`;
        // 内容去重：与最近一章对比，内容完全一致则跳过
        var newHash = crypto.createHash('md5').update(targetContent).digest('hex');
        var prevCh = chapters[chapters.length - 1];
        if (prevCh && prevCh.content) {
          var prevHash = crypto.createHash('md5').update(prevCh.content).digest('hex');
          if (newHash === prevHash) {
            console.log('[去重] 章节内容与上一章完全相同，跳过保存');
            return res.json({ success: true, content: allContent, versions: isDualVersion ? results : undefined, isMultiChapter, chapterCount: 1, metadata: { dedupSkipped: true } });
          }
        }
        chapters.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
          projectId, title, content: targetContent, summary,
          order: nextOrder, wordCount: targetContent.replace(/\s/g, '').length,
          techniqueIds: techniques.map(t => t.id),
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        });
      }
      
      // 生成后质量检测 (交叉验证)
      try {
        var _cvContent = isDualVersion ? results[1].content : content;
        var _cvIssues = [];
        var _cvClean = _cvContent.replace(/[\s\n]/g, '');
        // 检测公式化开头
        if (/第[一二三四五六七八九十百千零\d]+天[早上下晚]/g.test(_cvContent.substring(0, 200))) {
          _cvIssues.push('公式化开头');
        }
        // 检测碎片化短句 (>5行连续<5字)
        var _cvLines = _cvContent.split('\n').filter(function(l) { return l.trim(); });
        var _cvShort = 0;
        for (var _cli = 0; _cli < _cvLines.length; _cli++) {
          if (_cvLines[_cli].trim().length < 5 && _cvLines[_cli].trim().length > 0) _cvShort++; else _cvShort = 0;
          if (_cvShort > 5) { _cvIssues.push('碎片化短句'); break; }
        }
        // 检测字数不足
        if (wordCount && _cvClean.length < parseInt(wordCount) * 0.5) {
          _cvIssues.push('字数不足('+_cvClean.length+'/'+wordCount+')');
        }
        // 重复检测: 与前3章内容比较
        var _cvChs = readJSON(getChapFile(projectId), []);
        if (_cvChs.length > 1) {
          var _cvPrev = _cvChs.slice(-3).map(function(c){return (c.content||'').replace(/[\s\n]/g,'').substring(0,100);}).join('');
          var _cvOverlap = 0;
          for (var _oi = 0; _oi < _cvPrev.length - 20; _oi++) {
            var _chunk = _cvPrev.substring(_oi, _oi+20);
            if (_chunk.length === 20 && _cvClean.indexOf(_chunk) >= 0) _cvOverlap++;
          }
          if (_cvOverlap > 3) _cvIssues.push('与前文重复度高');
        }
        if (_cvIssues.length > 0) {
          console.log('[交叉验证]', projectId, '质量警告:', _cvIssues.join(', '));
          // 质量低 → 自动重试（单章节模式，最多1次）
          if (isDualVersion && !isReasoner) {
            console.log('[交叉验证] 质量低，自动重试(提温+0.15)...');
            // 重试时同步更新chapters数组，防止文件保存仍用旧内容
            if (chapters && chapters.length > 0) {
              var _lastCh = chapters[chapters.length - 1];
              var _oldContent = _lastCh.content;
            }
            try {
              var _rt = Math.min(actualTemp + 0.15, 1.0);
              var _rr = await callAPI(null, _rt);
              if (_rr && _rr.content && _rr.content.replace(/\s/g,'').length > 100) {
                var _rc = _rr.content.replace(/\s/g,'');
                var _fracLines = _rr.content.split('\n').filter(function(l){return l.trim().length<5&&l.trim().length>0;});
                if (_rc.length > 200 && _fracLines.length <= 10) {
                  console.log('[交叉验证] 重试结果可用，替换原内容');
                  results = [{ version: 'A', content: _rr.content, temp: _rt }];
                  allContent = _rr.content;
                  // 同步更新chapters数组，与results保持一致性
                  if (_lastCh) {
                    var _newChSummary = _rr.content.replace(/\s/g, '').substring(0, 60) + '...';
                    var _newChTitle = extractChapterTitle(_rr.content) || _lastCh.title || '第' + nextOrder + '章';
                    var _newChWordCount = _rr.content.replace(/\s/g, '').length;
                    _lastCh.content = _rr.content;
                    _lastCh.summary = _newChSummary;
                    _lastCh.title = _newChTitle;
                    _lastCh.wordCount = _newChWordCount;
                    _lastCh.updatedAt = new Date().toISOString();
                  }
                } else {
                  console.log('[交叉验证] 重试结果仍不佳，保留原内容');
                }
              }
            } catch(e) { console.error('[交叉验证] 重试失败:', e.message); }
          }
        }
      } catch(e) { console.error('[交叉验证] 检测失败:', e.message); }

      // ── 内容合规验证：SWITCHES.enableContentValidate ──
      // 若需启用，可在此处插入章节保存前的合规校验逻辑。
      // 独立的 validate API 路由位于 POST /validate/:pid。
      
      writeJSON(getChapFile(projectId), chapters);
      // 自动更新故事状态 — 用真实的章节序号
      try {
        for (let ri = 0; ri < results.length; ri++) {
          const r = results[ri];
          const chOrder = isMultiChapter ? r.chapterOrder : (nextOrder);
          autoUpdateStory(projectId, r.content || "", chOrder);
        }
      } catch(e) { console.error('autoUpdateStory error:', e); }

            // DNA更新（每章独立保存，多章模式下每章都记录）
      for (var di = 0; di < results.length; di++) {
        var _r = results[di];
        var _o = _r.chapterOrder || (chapters.length - results.length + di + 1);
        var _t = _r.title || '新章节';
        var _tc = techniques ? techniques.map(function(t) { return t.id; }) : [];
        updateProjectContext(projectId, _o, _t, _r.content, _r.content.replace(/\s/g, '').substring(0, 60) + '...', _tc);
      }
      // 统计
      const stats = readJSON(getStatsFile(projectId), { projectId, totalWords: 0, chapterCount: 0 });
      const totalChars = results.reduce((s, r) => s + r.content.replace(/\s/g, '').length, 0);
      stats.totalWords = (stats.totalWords || 0) + totalChars;
      stats.chapterCount = (stats.chapterCount || 0) + results.length;
      const today = new Date().toISOString().slice(0, 10);
      if (!stats.daily) stats.daily = {};
      stats.daily[today] = (stats.daily[today] || 0) + totalChars;
      writeJSON(getStatsFile(projectId), stats);

      const projMeta = readJSON(path.join(DATA_DIR, 'projects.json'), []);
      const pIdx = projMeta.findIndex(p => p.id === projectId);
      if (pIdx >= 0) {
        projMeta[pIdx].updatedAt = new Date().toISOString();
        projMeta[pIdx].chapterCount = (projMeta[pIdx].chapterCount || 0) + results.length;
        writeJSON(path.join(DATA_DIR, 'projects.json'), projMeta);
      }
    }

    // 避坑检查
    const pitfallWarnings = checkPitfalls(content);

    // ── 10. 返回结果 ──
    res.json({
      success: true,
      content: allContent,
      versions: isDualVersion ? results : undefined,
      isMultiChapter,
      chapterCount: results.length,
      metadata: {
        model: apiBody?.model || 'deepseek-reasoner',
        persona: persona.name,
        temperature: isReasoner ? null : actualTemp,
        usage: {},
        sceneType,
        techniquesInjected: techniques.map(t => ({ id: t.id, instruction: t.instruction.substring(0, 30) + '...' })),
        contextInfo: {
          hasProjectContext: !!projectId,
          hasCharCards: !!context.charCards,
          contextLayers: getContextLayersUsed(prompt)
        },
        diversity: {
          adjustments: diversityAdjustments,
          temperatureSeed: Math.round(actualTemp * 100)
        },
        pitfallWarnings: pitfallWarnings.length > 0 ? pitfallWarnings : undefined,
        qualityCheck: typeof _cvIssues !== 'undefined' && _cvIssues.length > 0 ? { warnings: _cvIssues, passed: false } : undefined
      }
    });

  } catch (e) {
    console.error('Writing Engine Error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

function getContextLayersUsed(prompt) {
  const layers = ['基础人格'];
  if (prompt.systemMsg.includes('【写作技巧参考】')) layers.push('知识库技巧');
  if (prompt.systemMsg.includes('【故事背景】')) layers.push('项目背景');
  if (prompt.systemMsg.includes('【前情提要】')) layers.push('前文摘要');
  if (prompt.systemMsg.includes('【剧情状态】')) layers.push('剧情状态');
  if (prompt.systemMsg.includes('【出场角色】')) layers.push('角色卡');
  if (prompt.systemMsg.includes('【世界设定】')) layers.push('世界观数据');
  if (prompt.systemMsg.includes('【写作风格要求】')) layers.push('写作风格');
  if (prompt.systemMsg.includes('【当前场景类型】')) layers.push('场景推理');
  if (prompt.systemMsg.includes('【注意】')) layers.push('多样性调整');
  if (prompt.systemMsg.includes('【写作技巧池·动态选择】')) layers.push('动态技巧池');
  return layers;
}

// ═══════════════════════════════════════════════════════
// API: 查询场景检测结果（预览用）
// ═══════════════════════════════════════════════════════
router.post('/detect-scene', (req, res) => {
  const { plot, genre } = req.body;
  if (!plot) return res.json({ sceneType: '通用', matches: [] });

  const sceneType = detectSceneType(plot, genre);
  const genres = genre ? [genre] : ['通用'];
  const techResult = matchTechniques(genres, sceneType, []);
  const techniques = techResult.selected;

  res.json({
    sceneType,
    techniqueCount: techniques.length,
    techniques: techniques.slice(0, 3).map(t => t.instruction),
    sceneKeywords: SCENE_KEYWORDS[sceneType]?.slice(0, 5) || []
  });
});

// ═══════════════════════════════════════════════════════
// API: 项目DNA报告
// ═══════════════════════════════════════════════════════
router.get('/dna/:projectId', (req, res) => {
  const dnas = readJSON(getDNAFile(req.params.projectId), []);
  const recent = dnas.slice(-10);
  
  // 统计
  const avgDialog = recent.length > 0
    ? Math.round(recent.reduce((a, b) => a + (b.dialogRatio || 0), 0) / recent.length)
    : 0;
  const avgSentence = recent.length > 0
    ? Math.round(recent.reduce((a, b) => a + (b.avgSentenceLen || 0), 0) / recent.length)
    : 0;
  const narrativeStats = {};
  recent.forEach(d => {
    narrativeStats[d.narrative] = (narrativeStats[d.narrative] || 0) + 1;
  });

  res.json({
    totalChapters: dnas.length,
    avgDialogRatio: avgDialog,
    avgSentenceLen: avgSentence,
    narrativeStats,
    recent: recent.slice(-5).map(d => ({
      chapter: d.chapterOrder,
      dialog: `${d.dialogRatio}%`,
      sentenceLen: `${d.avgSentenceLen}字`,
      narrative: d.narrative,
      actionScore: d.actionScore,
      chars: d.totalChars
    }))
  });
});

// ═══════════════════════════════════════════════════════
// API: 查询当前活跃剧情状态
// ═══════════════════════════════════════════════════════
router.get('/plots/:projectId', (req, res) => {
  const plotState = readJSON(getPlotFile(req.params.projectId), { threads: [], resolved: [], newElements: '' });
  res.json(plotState);
});

// ═══════════════════════════════════════════════════════
// API: 手动管理剧情状态
// ═══════════════════════════════════════════════════════
router.post('/plots/:projectId', (req, res) => {
  const plotState = readJSON(getPlotFile(req.params.projectId), { threads: [], resolved: [], newElements: '' });
  
  if (req.body.addThread) {
    plotState.threads.push({ id: Date.now().toString(36), name: req.body.addThread, status: '进行中' });
  }
  if (req.body.resolveThread) {
    const idx = plotState.threads.findIndex(t => t.id === req.body.resolveThread);
    if (idx >= 0) {
      const [removed] = plotState.threads.splice(idx, 1);
      plotState.resolved.push(removed);
    }
  }
  if (req.body.removeThread) {
    plotState.threads = plotState.threads.filter(t => t.id !== req.body.removeThread);
  }
  writeJSON(getPlotFile(req.params.projectId), plotState);
  res.json(plotState);
});

// ═══════════════════════════════════════════════════════
// API: 下一章方向预测
// ═══════════════════════════════════════════════════════
// 可复用函数：供路由和多章循环调用
async function predictDirection(pid, chapters, world, outline, genre, style) {
  var sorted = chapters.slice().sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
  var chSum = sorted.length > 0 ? sorted.map(function(c) { return 'Ch' + c.order + ' ' + (c.title||'') + ':' + ((c.content||'').replace(/\n/g,' ').substring(0,100)); }).join('\n') : '新项目';
  var zoneList = Object.values(world.zones||{}).slice(0,5).map(function(z) { return z.name + '(' + ((z.attributes||{})['等级']||'') + ')'; }).join('、');
    var totalCh = chapters.filter(function(c){return c.content;}).length;
  var storyStage = totalCh < 10 ? '开局' : (totalCh < 30 ? '发展中' : (totalCh < 60 ? '中后期' : '收尾'));
  var sys = '你是小说剧作分析师。根据前文+世界观+活大纲，预测后续3个可能的叙事方向。\n故事阶段: '+storyStage+' (第'+totalCh+'章)\n每个方向格式：\nTITLE: (标题)\nSUMMARY: (2-3句话剧情概要)\nMOOD: (情绪/氛围)\nPACE: (节奏：慢/中/快)\n---分隔线---\n3个方向必须各有侧重（如冲突向、日常向、探索向），不要雷同。';
  if (style) sys += '\n风格参考：' + style;
  if (genre) sys += '\n类型参考：' + genre;
  if (zoneList) sys += '\n可用区域：' + zoneList;
  if (outline) sys += '\n活大纲：' + outline;
  var user = '前文摘要：\n' + chSum;
  var apiBody2 = { model: config.DEEPSEEK_CHAT_MODEL || 'deepseek-reasoner', messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], stream: false, temperature: 0.8, max_tokens: 2000 };
  // 方向预测重试（2次尝试，服务端错误有退避）
  var apiRes, _predLastErr;
  // 成本防护：余额熔断（低余额不发起请求）
  var predGate = await guard.checkBalanceGate();
  if (!predGate.ok) {
    console.warn('[predictNextDirection] BUDGET_BLOCKED: ' + predGate.reason + ', 跳过方向预测');
    return { success: false, directions: [], error: 'BUDGET_BLOCKED: ' + predGate.reason };
  }
  if (!SWITCHES.enableRetry) {
    try {
      apiRes = await fetch(config.DEEPSEEK_API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.DEEPSEEK_API_KEY }, body: JSON.stringify(apiBody2) });
      if (!apiRes.ok) _predLastErr = 'API ' + apiRes.status;
    } catch(e) { _predLastErr = e.message; }
  } else {
    for (var _predRetry = 0; _predRetry < 2; _predRetry++) {
      try {
        apiRes = await fetch(config.DEEPSEEK_API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.DEEPSEEK_API_KEY }, body: JSON.stringify(apiBody2) });
        if (apiRes.ok) break;
        _predLastErr = 'API ' + apiRes.status;
        if (_predRetry < 1) { var _pd = apiRes.status === 429 ? 4000 : 2000; await new Promise(function(q) { setTimeout(q, _pd); }); }
      } catch(e) { _predLastErr = e.message; if (_predRetry < 1) await new Promise(function(q) { setTimeout(q, 2000); }); }
    }
  }
  if (!apiRes || !apiRes.ok) return { success: false, directions: [], error: _predLastErr || 'API call failed' };
  var apiJson = await apiRes.json();
  var text = apiJson?.choices?.[0]?.message?.content || '';
  if (!text) return { success: false, directions: [], error: 'Empty response' };
  // 解析多种格式
  var rawText = text;
  var blocks = rawText.split(/---分隔线---/);
  if (blocks.length < 2) blocks = rawText.split(/\n\s*\d+\.\s*/);
  if (blocks.length < 2) blocks = rawText.split(/TITLE:/);
  var directions = [];
  blocks.forEach(function(b) {
    if (!b || b.trim().length < 10) return;
    var clean = b.replace(/\*\*/g, '').trim();
    var t = clean.match(/TITLE[：:]\s*(.+)/);
    if (!t) t = clean.match(/^(目标|方向|标题)[：:]\s*(.+)/);
    if (!t) t = clean.match(/^\s*(.{2,20}?)\s*[\r\n]/);
    var s = clean.match(/SUMMARY[：:]\s*([\s\S]+?)(?=MOOD[：:]|PACE[：:]|$)/i);
    var m = clean.match(/MOOD[：:]\s*(.+)/i);
    var p = clean.match(/PACE[：:]\s*(.+)/i);
    var title = t ? (t[1]||t[2]||'').trim().replace(/^[\s*#]+/, '').replace(/[\s*#]+$/, '') : '';
    var summary = s ? s[1].trim().replace(/\*\*/g, '').substring(0, 200) : b.substring(0, 100).trim();
    if (title) directions.push({ title: title, summary: summary, mood: (m?.[1]||'').replace(/\*\*/g,'').trim(), pace: (p?.[1]||'').replace(/\*\*/g,'').trim() });
  });
  // 去重
  var seen = {};
  directions = directions.filter(function(d) {
    var key = d.title.substring(0, 8);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
  return { success: true, directions: directions.slice(0, 3) };
}

router.post('/predict', async (req, res) => {
  try {
    const { projectId, genre, style } = req.body;
    if (!projectId) return res.status(400).json({ success: false, error: 'projectId required' });
    const chapters = readJSON(getChapFile(projectId), []);
    const world = readJSON(getWorldFile(projectId), {});
    const outlineFile = path.join(DATA_DIR, 'outline-' + projectId + '.md');
    const outline = fs.existsSync(outlineFile) ? fs.readFileSync(outlineFile, 'utf8').substring(0, 2000) : '';
    const result = await predictDirection(projectId, chapters, world, outline, genre, style);
    res.json(result);
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════
// API: 获取知识库技巧列表
// ═══════════════════════════════════════════════════════
router.get('/techniques', (req, res) => {
  const techniques = loadTechniques();
  res.json({
    total: techniques.length,
    techniques: techniques.map(t => ({
      id: t.id,
      instruction: t.instruction,
      source: t.source,
      scene_types: t.scene_types,
      genres: t.genres,
      priority: t.priority,
      usage_count: t.usage_count,
      status: t.status
    }))
  });
});

// ═══════════════════════════════════════════════════════
// API: 获取避坑库
// ═══════════════════════════════════════════════════════
router.get('/pitfalls', (req, res) => {
  res.json(readJSON(path.join(DATA_DIR, 'pitfalls.json'), []));
});

// ═══════════════════════════════════════════════════════
// 故事备忘录 — 角色追踪/伏笔管理/摘要

// Story state v2 — replacement section for writing-engine/index.js
// This file is spliced in by replace_story_state.js

// ═══════════════════════════════════════════════════════
// 故事备忘录 v2 — 全自动：事实时间线 + 状态推导 + AI摘要
// 注入时标注"仅供参考"，发生冲突优先信任用户输入
// ═══════════════════════════════════════════════════════

var STATE_FILE = function(pid) { return path.join(DATA_DIR, 'story-state-' + pid + '.json'); };

function getDefaultState(pid) {
  return {
    projectId: pid, version: 2, lastUpdated: new Date().toISOString(),
    lastChapterProcessed: 0, lastSummaryChapter: 0,
    facts: [],
    state: { characters: {}, relationships: [], locations: {} },
    summary: { storyProgress: '', keyDetails: [], activeThreads: [], recentChanges: '' }
  };
}

function loadStoryState(pid) {
  return readJSON(STATE_FILE(pid), getDefaultState(pid));
}
function saveStoryState(s) {
  s.lastUpdated = new Date().toISOString();
  writeJSON(STATE_FILE(s.projectId), s);
}

// ─── 正则提取函数 ───
var ADV_RE = /(?:突破|进阶|晋升|达到|踏入|跨入)(?:到|为|了)?\s*([^\u3002\uff0c\uff1b\uff01\uff1f\s]{2,20})/g;
var ACQ_RE = /(?:获得|得到|收获|捡到|拿到|抢到|夺得|缴获|收到|领取|拿起|拿走|取走|抓起|举起|拎起|扛起|背起|抱起)(?:了)?\s*([^\u3002\uff0c\uff1b\uff01\uff1f\s]{1,20})/g;
var MOV_RE = /(?:来到|进入|回到|赶到|离开|抵达|前往|走出|飞出|闯入|逃到|潜入|走进|跑进|冲进|穿过|绕过|经过|路过|登上|爬下|跳下|走上|走下|跑上|跑下)(?:了)?\s*([^\u3002\uff0c\uff1b\uff01\uff1f\s]{1,20})/g;
var IDN_RE = /(?:成为|被封为|担任|拜入|加入)(?:了)?\s*([^\u3002\uff0c\uff1b\uff01\uff1f\s]{2,20})/g;
var SKL_RE = /(?:习得|领悟|学会|掌握|修炼|修成|练成|融合)(?:了)?\s*([^\u3002\uff0c\uff1b\uff01\uff1f\s]{2,25})/g;
var DIC_RE = /(?:发现|得知|查明|察觉|意识到)(?:了)?\s*([^\u3002\uff0c]{3,40})/g;
// 以下为正则变量，当前未在 extractFacts 中使用（保留供后续扩展）
// var CRT_RE = /(?:创建|建立|炼制|制作|发明)(?:了)?\s*([^\u3002\uff0c]{2,20})/g;
// var INJ_RE = /(?:受伤|中毒|残废|昏迷|经脉尽断|身负重伤)(?:了)?/g;
var DECL_RE = /([\u4e00-\u9fa5]{2,4})(?:是|为|叫|称)([\u4e00-\u9fa5]{2,4})(?:的|为)(?:兄弟|恋人|师父|弟子|仇敌|盟友|夫君|妻子|义父|义子|世交|同门|恩人)/g;

var REL_EVENTS = [
  { re: /救了\s*([\u4e00-\u9fa5]{2,4})/g, verb: '救了' },
  { re: /杀了\s*([\u4e00-\u9fa5]{2,4})/g, verb: '杀了' },
  { re: /背叛(?:了)?\s*([\u4e00-\u9fa5]{2,4})/g, verb: '背叛' },
  { re: /打伤(?:了)?\s*([\u4e00-\u9fa5]{2,4})/g, verb: '打伤' },
  { re: /救下(?:了)?\s*([\u4e00-\u9fa5]{2,4})/g, verb: '救下' },
  { re: /拜\s*([\u4e00-\u9fa5]{2,4})(?:为师|门下)/g, verb: '拜师' },
  { re: /收\s*([\u4e00-\u9fa5]{2,4})(?:为徒|为弟子)/g, verb: '收徒' },
  { re: /与\s*([\u4e00-\u9fa5]{2,4})(?:结为|反目|断绝|重归于好|联手)/g, verb: '关系变化' },
];

var PRONOUNS_MAP = {"他":1,"她":1,"它":1,"我":1,"你":1,"这":1,"那":1,"谁":1,"某":1,"人":1,"大家":1,"一个":1,"两人":1,"三人":1,"对方":1,"彼此":1,"自己":1,"众人":1,"他们":1,"她们":1,"我们":1,"你们":1,"有人":1};
var NOISE_OBJ = /^(一个|这个|那个|这些|那些|什么|怎么|这样|那样|一点|下来|起来|出来|过来|上去|下去|进来|不到|不了|到了|没有|不是|就是|还是)$/;

function isFactValid(f) {
  if (!f.subject || f.subject.length < 2 || f.subject.length > 4) return false;
  if (PRONOUNS_MAP[f.subject]) return false;
  if (!f.object || f.object.length < 2) return false;
  if (NOISE_OBJ.test(f.object)) return false;
  return true;
}

function findChar(text, pos, range) {
  var ctx = text.substring(Math.max(0, pos - range), pos);
  // 向前找最近的角色名（跳过中间空白和常见中文标点）
  var m = ctx.match(/([一-龥]{2,4})\s*$/) || ctx.match(/([一-龥]{2,4})[，。！？、；：]\s*$/);
  if (!m) return '';
  var name = m[1];
  if (PRONOUNS_MAP[name]) return '';
  return name;
}

function extractFacts(text, chapterOrder) {
  var facts = [];
  var m, charName/*, verbMap*/;

  // verbMap = { re: ADV_RE, verb: '进阶' };  // 未使用，保留以供参考
  ADV_RE.lastIndex = 0;
  while ((m = ADV_RE.exec(text)) !== null) {
    charName = findChar(text, m.index, 60);
    if (charName) { var _f = { subject: charName, verb: '进阶', object: m[1].trim(), chapter: chapterOrder }; if (isFactValid(_f)) facts.push(_f); }
  }

  ACQ_RE.lastIndex = 0;
  while ((m = ACQ_RE.exec(text)) !== null) {
    charName = findChar(text, m.index, 80);
    if (charName) { var _f = { subject: charName, verb: '获得', object: m[1].trim(), chapter: chapterOrder }; if (isFactValid(_f)) facts.push(_f); }
  }

  MOV_RE.lastIndex = 0;
  while ((m = MOV_RE.exec(text)) !== null) {
    charName = findChar(text, m.index, 80);
    if (charName) { var _f = { subject: charName, verb: '到达', object: m[1].trim(), chapter: chapterOrder }; if (isFactValid(_f)) facts.push(_f); }
  }

  IDN_RE.lastIndex = 0;
  while ((m = IDN_RE.exec(text)) !== null) {
    charName = findChar(text, m.index, 60);
    if (charName) { var _f = { subject: charName, verb: '成为', object: m[1].trim(), chapter: chapterOrder }; if (isFactValid(_f)) facts.push(_f); }
  }

  SKL_RE.lastIndex = 0;
  while ((m = SKL_RE.exec(text)) !== null) {
    charName = findChar(text, m.index, 60);
    if (charName) { var _f = { subject: charName, verb: '学会', object: m[1].trim(), chapter: chapterOrder }; if (isFactValid(_f)) facts.push(_f); }
  }

  DIC_RE.lastIndex = 0;
  while ((m = DIC_RE.exec(text)) !== null) {
    charName = findChar(text, m.index, 60);
    if (charName) { var _f = { subject: charName, verb: '发现', object: m[1].trim(), chapter: chapterOrder }; if (isFactValid(_f)) facts.push(_f); }
  }

  // 关系事件
  REL_EVENTS.forEach(function(ev) {
    ev.re.lastIndex = 0;
    while ((m = ev.re.exec(text)) !== null) {
      charName = findChar(text, m.index, 60);
      if (charName) { var _f = { subject: charName, verb: ev.verb, object: m[1].trim(), chapter: chapterOrder }; if (isFactValid(_f)) facts.push(_f); }
    }
  });

  // 声明关系
  DECL_RE.lastIndex = 0;
  while ((m = DECL_RE.exec(text)) !== null) {
    var relMatch = m[0].match(/(?:兄弟|恋人|师父|弟子|仇敌|盟友|夫君|妻子|义父|义子|世交|同门|恩人)/);
    var relStr = m[2].trim() + '(' + (relMatch ? relMatch[0] : '关联') + ')';
    facts.push({ subject: m[1].trim(), verb: '关系', object: relStr, chapter: chapterOrder });
  }

  return facts;
}

// ─── AI提取事实（Option B：替代正则extractFacts） ───
function extractFactsAI(text, chapterOrder) {
  // 与主生成共用 config（API地址/Key自动同步，不会出现主生成换API后fact提取走老地址）
  return new Promise(function(resolve, reject) {
    var prompt = '你是小说事实提取器。从以下章节中提取所有角色相关的客观事实。\n\n事实类型：\n- 进阶：角色等级/段位/实力提升\n- 获得：角色获得的新物品/装备/宠物\n- 到达：角色到达新地点\n- 成为：角色获得新身份/称号\n- 学会：角色学会的新技能/招式\n- 发现：角色发现的信息/秘密/线索\n- 关系：角色之间的关系变化（相遇/组队/敌对/合作等）\n\n规则：\n1. 只提取文本中明确写出的信息，不推断不脑补\n2. 主语必须是角色名\n3. 每个事实独立一行\n4. 格式：主语|动词|宾语\n5. 不要编造不存在的事实\n\n示例：\n陆沉|到达|新手村\n陆沉|学会|召唤术·初级亡灵\n陆沉|获得|骷髅战士\n\n以下是要分析的章节：\n' + text + '\n\n请按格式逐行输出事实（不输出空行和编号）：';

    // 成本防护：余额熔断（低余额不发起请求，直接返回空事实列表）
    guard.checkBalanceGate().then(function(gate) {
      if (!gate.ok) {
        console.warn('[extractFactsAI] BUDGET_BLOCKED: ' + gate.reason + ', 跳过AI事实提取');
        resolve([]);
        return;
      }
      fetch(config.DEEPSEEK_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.DEEPSEEK_API_KEY },
      body: JSON.stringify({
        model: config.DEEPSEEK_CHAT_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是小说事实提取器，只提取文本中明确写出的客观事实，不推断不脑补。按指定格式输出。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 1000
      })
    }).then(function(r) {
      if (!r.ok) { resolve([]); return; }
      return r.json();
    }).then(function(j) {
      if (!j) { resolve([]); return; }
      var content = j.choices?.[0]?.message?.content || '';
      var facts = [];
      content.split('\n').forEach(function(line) {
        line = line.trim();
        if (!line) return;
        var p = line.split('|');
        if (p.length >= 3) {
          facts.push({
            subject: p[0].trim(),
            verb: p[1].trim(),
            object: p[2].trim(),
            chapter: chapterOrder
          });
        }
      });
      resolve(facts);
    }).catch(function(e) { console.error('[extractFactsAI] 提取失败:', e ? e.message : 'unknown'); resolve([]); });
    });
  });
}

// ─── 从facts推导当前状态 ───
function deriveState(facts) {
  var chars = {};
  var relationships = [];

  var byChar = {};
  facts.forEach(function(f) {
    if (!byChar[f.subject]) byChar[f.subject] = [];
    byChar[f.subject].push(f);
  });

  Object.keys(byChar).forEach(function(name) {
    var charFacts = byChar[name];
    var ch = { level: '', location: '', items: [], skills: [], identity: '' };

    charFacts.sort(function(a, b) { return b.chapter - a.chapter; });

    var seenVerb = {};
    charFacts.forEach(function(f) {
      if (seenVerb[f.verb]) return;
      seenVerb[f.verb] = true;
      if (f.verb === '进阶') ch.level = f.object;
      else if (f.verb === '到达') ch.location = f.object;
      else if (f.verb === '获得') ch.items.push(f.object);
      else if (f.verb === '学会') ch.skills.push(f.object);
      else if (f.verb === '成为') ch.identity = f.object;
      else if (f.verb === '关系') relationships.push(f);
    });

    chars[name] = ch;
  });

  return { characters: chars, relationships: relationships };
}

// ─── 全自动更新（存章时触发） ───
function autoUpdateStory(pid, content, chapterOrder) {
  var state = loadStoryState(pid);
  if (chapterOrder <= state.lastChapterProcessed && state.lastChapterProcessed > 0) return state;

  // Step 1: 正则提取（同步，立即生效）
  if (SWITCHES.enableFactFilter) {
    var newFacts = extractFacts(content, chapterOrder);

    newFacts.forEach(function(nf) {
      if (SWITCHES.enableDeduplicate) {
        var exists = state.facts.some(function(f) {
          return f.subject === nf.subject && f.verb === nf.verb &&
                 f.object === nf.object && f.chapter === nf.chapter;
        });
        if (!exists) state.facts.push(nf);
      } else {
        state.facts.push(nf);
      }
    });

    state.state = deriveState(state.facts);
    state.lastChapterProcessed = chapterOrder;

    if (chapterOrder - state.lastSummaryChapter >= 10) {
      state.summary.storyProgress = '__NEEDS_REFRESH__';
    }

    saveStoryState(state);
    syncExtractedEntities(pid, newFacts);

    // Step 2: AI提取（排队串行 + 重试，防竞态 + 防资源耗尽）
    _enqueueAiExtract(pid, content, chapterOrder);
  } else {
    state.state = deriveState(state.facts);
    state.lastChapterProcessed = chapterOrder;

    if (chapterOrder - state.lastSummaryChapter >= 10) {
      state.summary.storyProgress = '__NEEDS_REFRESH__';
    }

    saveStoryState(state);
  }

  return state;
}

// ─── AI提取队列（串行执行，防止并发写入竞态 + 避免API堆积） ───
var _aiQ = [];
var _aiBusy = false;

function _processAiQ() {
  if (_aiBusy || _aiQ.length === 0) return;
  _aiBusy = true;
  var t = _aiQ.shift();

  function _doStep(pid, content, ch, retryLeft) {
    extractFactsAI(content, ch).then(function(aiFacts) {
      if (aiFacts && aiFacts.length > 0) {
        // 防竞态：检查是否有更新的章节已处理
        var cur = loadStoryState(pid);
        if (cur.lastChapterProcessed <= ch) {
          aiFacts.forEach(function(nf) {
            if (SWITCHES.enableDeduplicate) {
              var exists = cur.facts.some(function(f) {
                return f.subject === nf.subject && f.verb === nf.verb &&
                       f.object === nf.object && f.chapter === nf.chapter;
              });
              if (!exists) cur.facts.push(nf);
            } else {
              cur.facts.push(nf);
            }
          });
          cur.state = deriveState(cur.facts);
          saveStoryState(cur);
          syncExtractedEntities(pid, aiFacts);
        }
      }
      _aiBusy = false;
      setTimeout(_processAiQ, 50);
    }).catch(function(e) {
      console.error('[extractFactsAI] 提取失败('+ch+'):', e ? e.message : 'unknown');
      if (SWITCHES.enableRetry && retryLeft > 0) {
        setTimeout(function() { _doStep(pid, content, ch, retryLeft - 1); }, 3000);
      } else {
        console.error('[extractFactsAI] 重试耗尽，跳过章节', ch);
        _aiBusy = false;
        setTimeout(_processAiQ, 50);
      }
    });
  }

  _doStep(t.pid, t.content, t.ch, 1); // 最多重试1次
}

function _enqueueAiExtract(pid, content, ch) {
  _aiQ.push({ pid: pid, content: content, ch: ch });
  _processAiQ();
}

// ─── 注入上下文（生成时用） ───
function getInjectContext(pid) {
  var state = loadStoryState(pid);
  if (!state.facts.length) return '';
  // 滑动窗口: 只保留最近20章facts (避免context膨胀)
  var _maxCh = 0;
  state.facts.forEach(function(f) { if (f.chapter > _maxCh) _maxCh = f.chapter; });
  var _winStart = Math.max(0, _maxCh - 20);
  // filter by window; use local copy to avoid mutating state
  var filteredFacts;
  if (SWITCHES.enableSlideWindow) {
    filteredFacts = state.facts.filter(function(f) { return f.chapter > _winStart; });
  } else {
    filteredFacts = state.facts.slice();
  }

  var parts = [];
  var charNames = Object.keys(state.state.characters);

  if (charNames.length) {
    var recentLimit = state.lastChapterProcessed - 15;
    var recentChars = {};
    filteredFacts.forEach(function(f) {
      if (f.chapter > recentLimit) recentChars[f.subject] = true;
    });

    var sorted = charNames.sort(function(a, b) {
      var aR = recentChars[a] ? 1 : 0;
      var bR = recentChars[b] ? 1 : 0;
      return bR - aR;
    }).slice(0, 8);

    var lines = sorted.map(function(name) {
      var ch = state.state.characters[name];
      var s = name;
      if (ch.level) s += '(' + ch.level + ')';
      if (ch.location) s += '@' + ch.location;
      if (ch.items.length) s += '[' + ch.items.slice(-3).join(',') + ']';
      if (ch.skills.length) s += '{' + ch.skills.slice(-2).join(',') + '}';
      return s;
    });
    parts.push('【角色】' + lines.join(' | '));
  }

  var relFacts = filteredFacts.filter(function(f) {
    return ['救了','杀了','背叛','打伤','救下','拜师','收徒'].indexOf(f.verb) >= 0;
  }).slice(-5);
  if (relFacts.length) {
    parts.push('【事件】' + relFacts.map(function(f) { return f.subject + f.verb + f.object; }).join(' | '));
  }

  var declared = filteredFacts.filter(function(f) { return f.verb === '关系'; }).slice(-3);
  if (declared.length) {
    parts.push('【关系】' + declared.map(function(f) { return f.subject + '\→' + f.object; }).join(' | '));
  }

  var s = state.summary;
  if (s.storyProgress && s.storyProgress !== '__NEEDS_REFRESH__') {
    parts.push('【剧情】' + s.storyProgress.substring(0, 100));
  }
  if (s.keyDetails && s.keyDetails.length) {
    parts.push('【细节】' + s.keyDetails.slice(0, 5).join(' | '));
  }

  if (!parts.length) return '';
  return '⚠ 自动提取仅供参考，有冲突以用户输入为准\n' + parts.join('\n');
}

// ─── AI摘要生成 ───
function summarizeStory(pid, chapters) {
  var state = loadStoryState(pid);
  var texts = chapters.map(function(ch) {
    return '第' + ch.chapterOrder + '章 ' + (ch.title || '') + ': ' + (ch.content || '').substring(0, 400);
  });
  var prompt = '分析以下小说章节，提取结构化剧情摘要。格式：\n【当前剧情】2句话概括\n【关键细节】每章1-2条需要记住的线索/物品/对话\n【活跃支线】未解决的伏笔\n【近期变化】重大转折\n\n' + texts.join('\n\n');
  return new Promise(function(resolve, reject) {
    (async function() {
      // 成本防护：余额熔断（低余额不发起请求）
      var gate = await guard.checkBalanceGate();
      if (!gate.ok) { console.warn('[summarizeStory] BUDGET_BLOCKED: ' + gate.reason + ', 跳过摘要'); resolve(false); return; }
      var _lastErr;
      for (var _retry = 0; _retry < 2; _retry++) {
        try {
          var r = await fetch(config.DEEPSEEK_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.DEEPSEEK_API_KEY },
            body: JSON.stringify({
              model: config.DEEPSEEK_CHAT_MODEL || 'deepseek-reasoner',
              messages: [
                { role: 'system', content: '你是小说剧情分析师，输出结构化摘要。只提取文本中明确存在的信息，不编造。' },
                { role: 'user', content: prompt }
              ],
              temperature: 0.3,
              max_tokens: 600
            }),
            signal: AbortSignal.timeout(20000)
          });
          if (!r.ok) {
            _lastErr = 'API ' + r.status;
            if (_retry < 1) { await new Promise(function(q) { setTimeout(q, _retry === 0 ? 2000 : 4000); }); continue; }
            resolve(false); return;
          }
          var j = await r.json();
          var text = j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : '';
          if (!text) { resolve(false); return; }
          // Parse sections (fixed regex - no double escape)
          var progress = (text.match(/【当前剧情】([\s\S]*?)(?=\n【|$)/) || [])[1] || '';
          var details = (text.match(/【关键细节】([\s\S]*?)(?=\n【|$)/) || [])[1] || '';
          var threads = (text.match(/【活跃支线】([\s\S]*?)(?=\n【|$)/) || [])[1] || '';
          var changes = (text.match(/【近期变化】([\s\S]*?)(?=\n【|$)/) || [])[1] || '';
          state.summary = {
            storyProgress: progress.trim().substring(0, 200),
            keyDetails: details.split('\n').filter(function(l) { return l.trim(); }).map(function(l) { return l.replace(/^-\s*/, '').trim(); }).slice(0, 10),
            activeThreads: threads.split('\n').filter(function(l) { return l.trim(); }).map(function(l) { return l.replace(/^-\s*/, '').trim(); }).slice(0, 5),
            recentChanges: changes.trim().substring(0, 300)
          };
          state.lastSummaryChapter = state.lastChapterProcessed;
          saveStoryState(state);
          resolve(true); return;
        } catch(e) {
          _lastErr = e.message;
          console.error('[summarizeStory] attempt ' + (_retry+1) + ' failed:', e.message);
          if (_retry < 1) await new Promise(function(q) { setTimeout(q, 2000); });
        }
      }
      console.error('[summarizeStory] all attempts failed:', _lastErr);
      resolve(false);
    })();
  });
}
// ─── API ───

router.get('/story-state/:pid', function(req, res) {
  res.json(loadStoryState(req.params.pid));
});

router.post('/story-state/:pid', function(req, res) {
  var state = loadStoryState(req.params.pid);
  var summary = req.body.summary;
  if (summary) {
    if (summary.storyProgress !== undefined) state.summary.storyProgress = summary.storyProgress;
    if (summary.keyDetails !== undefined) state.summary.keyDetails = summary.keyDetails;
    if (summary.activeThreads !== undefined) state.summary.activeThreads = summary.activeThreads;
  }
  saveStoryState(state);
  res.json({ success: true });
});

router.post('/story-state/:pid/update', function(req, res) {
  var cc = req.body.chapterContent;
  if (!cc) return res.json({ success: false, error: 'no content' });
  var state = autoUpdateStory(req.params.pid, cc, req.body.chapterOrder || 0);
  var needsSummary = state.summary.storyProgress === '__NEEDS_REFRESH__' && state.facts.length > 0;
  res.json({ success: true, factCount: state.facts.length, needsSummary: needsSummary });
});

router.post('/story-state/:pid/summarize', function(req, res) {
  var state = loadStoryState(req.params.pid);
  var start = Math.max(1, state.lastSummaryChapter || 0);
  var chapters = [];
  var chFile = path.join(DATA_DIR, 'chapters-' + req.params.pid + '.json');
  var chData = readJSON(chFile, []);
  var sorted = chData.slice().sort(function(a, b) { return a.order - b.order; });
  var recent = sorted.slice(-10);
  recent.forEach(function(ch) {
    chapters.push({ chapterOrder: ch.order, title: ch.title || '第' + ch.order + '章', content: ch.content });
  });
  if (chapters.length === 0) return res.json({ success: false, error: 'no chapters' });

  summarizeStory(req.params.pid, chapters).then(function(ok) {
    var updated = loadStoryState(req.params.pid);
    res.json({ success: ok, summary: updated.summary });
  }).catch(function(e) {
    res.json({ success: false, error: e.message });
  });
});

router.get('/story-state/:pid/inject', function(req, res) {
  res.json({ context: getInjectContext(req.params.pid) });
});

router.get('/story-state/:pid/facts', function(req, res) {
  var state = loadStoryState(req.params.pid);
  var verbIcons = { '进阶': '\→', '获得': '+', '到达': '@', '成为': '=', '学会': '\u2713', '发现': '?', '杀了': '\u2715', '救了': '\u2764', '背叛': '\u2717', '打伤': '\u2694', '拜师': '\u270D', '收徒': '\u270D', '关系变化': '\u21C4', '关系': '\u2194' };
  var timeline = state.facts.map(function(f) {
    return { chapter: f.chapter, icon: verbIcons[f.verb] || '\u2022', text: f.subject + f.verb + f.object };
  });
  res.json(timeline);
});

// ═══════════════════════════════════════════════════════
// API: 章节质量门控（生成后验证）
// ═══════════════════════════════════════════════════════
router.post('/validate/:pid', function(req, res) {
  try {
    var content = req.body.content || '';
    var pid = req.params.pid;
    if (!content) return res.json({ warnings: [], passed: true });
    var world = readJSON(getWorldFile(pid), {});
    var warnings = [];
    var cleanText = content.replace(/[\s\n]/g, '');

    // Check forbidden UI patterns
    var forbidden = [
      ['系统提示','荣耀无系统弹窗'],['任务提示','无任务追踪'],['经验+','不显示经验值'],
      ['获得经验','不显示经验获得'],['升级了','无升级弹窗'],['任务面板','无任务UI'],
      ['自动寻路','无自动寻路'],['技能描述','技能不弹窗'],['装备对比','无自动装备对比'],
      ['圣光','无圣光技能（网名除外）'],['冥界','无冥界设定（网名除外）'],
      ['史莱姆','无史莱姆怪物'],['魔法值','使用蓝条'],['施法','无施法'],
      ['吟唱','无吟唱'],['法力','用法力值'],
    ];
    forbidden.forEach(function(f) {
      if (cleanText.indexOf(f[0]) >= 0) warnings.push({ type:'forbidden', term:f[0], msg:f[1] });
    });

    // Check chapter length
    var wc = content.replace(/\s/g,'').length;
    if (wc > 0) {
      if (wc < 500) warnings.push({ type:'length', msg:'章节过短（'+wc+'字）' });
      else if (wc > 5000) warnings.push({ type:'length', msg:'章节过长（'+wc+'字）' });
      else warnings.push({ type:'length', msg:'字数正常（'+wc+'字）', ok:true });
    }

        // Check dialog ratio
    var q1 = (content.match(/[“‘「"]/g)||[]).length;  // opening quotes
    var q2 = (content.match(/[”’」"]/g)||[]).length;  // closing quotes
    var dlg = q1 + q2;
    var ratio = content.length > 0 ? Math.round(dlg / content.length * 100) : 0;
    if (ratio > 60) warnings.push({ type:'dialog', msg:'对话偏多（'+ratio+'%）' });
    else if (ratio < 10 && content.length > 200) warnings.push({ type:'dialog', msg:'对话偏少（'+ratio+'%）' });
    else warnings.push({ type:'dialog', msg:'对话比例正常（'+ratio+'%）', ok:true });
res.json({ warnings: warnings, passed: warnings.filter(function(w){return !w.ok}).length === 0 });
  } catch(e) {
    res.json({ warnings: [{ type:'error', msg:e.message }], passed: false });
  }
});

// ─── 运行时开关控制（对照实验用）───
router.post('/switches', function(req, res) {
  if (req.body && typeof req.body === 'object') {
    Object.assign(SWITCHES, req.body);
    res.json({ ok: true, switches: SWITCHES });
  } else {
    res.json({ ok: false, error: 'invalid body' });
  }
});

router.get('/switches', function(req, res) {
  res.json(SWITCHES);
});

module.exports = { router: router, autoUpdateStory: autoUpdateStory, getInjectContext: getInjectContext, deriveState: deriveState, loadStoryState: loadStoryState, saveStoryState: saveStoryState };
