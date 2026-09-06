// AI 写作引擎 — 使用 DeepSeek API 真实生成内容
// 包含：模型人格系统（仿星月写作）、写作风格系统、提示词库、数据CRUD
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const { autoUpdateStory, deriveState, loadStoryState, saveStoryState } = require('../writing-engine');
const config = require('../config');

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'writing');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ═══════════════════════════════════════════════════════
// 模型人格系统 — 仿星月写作的5大模型版本
// 每个版本 = 不同的系统提示词 + temperature + max_tokens
// ═══════════════════════════════════════════════════════
const MODEL_PERSONAS = {
  'atmosphere': {
    name: '氛围版',
    emoji: '🌌',
    desc: '氛围营造、情绪渲染、环境描写优先',
    temp: 0.85,
    maxTokens: 4000,
    price: 3, // 星月真实值：3x
    systemPrompt: `你是一个擅长氛围描写的网络小说作家。

【核心写作原则】
1. 氛围优先：用环境和感官描写营造情绪，而非直白叙述
2. 五感写作：每段至少涉及2种感官体验（视觉/听觉/触觉/嗅觉/味觉）
3. 克制对白：多于描写，少于对话，用环境烘托替代角色独白
4. 情绪外化：角色的心情通过天气/光线/场景细节来传达
5. 留白艺术：重要的东西不必说透，让读者自己感受
6. 节奏控制：紧张时短句密集，舒缓时长句舒展
7. 不用AI万能句式：避免"突然""就在这时""然而""但是""而这时"

【输出要求】
- 如果需要续写，严格延续前文的氛围基调和叙事节奏
- 段落之间留空行，每段不超过5句话
- 字数控制在用户要求的范围内`
  },
  'thinker': {
    name: '思考者',
    emoji: '🧠',
    desc: '逻辑推理、因果联系、深度情节',
    temp: 0.7,
    maxTokens: 5000,
    price: 12, // 星月真实值：12x（使用deepseek-reasoner）
    systemPrompt: `你是一个擅长逻辑叙事和深度情节的网络小说作家。

【核心写作原则】
1. 因果链清晰：每个情节节点都有明确的因果联系
2. 动机驱动：角色的每个行动都有合理的心理动因
3. 伏笔回收：前文的伏笔要在后续适当呼应，保持叙事一致性
4. 节奏层次：情节推进要有"蓄力-爆发-回落"的节律
5. 多线叙事：同时推进2-3条叙事线，在关键节点交汇
6. 前期铺垫不过度：留足够的悬念空间，但不说废话
7. 不用AI万能句式：避免"突然""就在这时""然而""但是""而这时"

【输出要求】
- 如果需要续写，严格贴合前文的情节逻辑
- 段落之间逻辑递进清晰
- 字数控制在用户要求的范围内`
  },
  'delicate': {
    name: '细腻版',
    emoji: '🪶',
    desc: '情感细节、心理描写、微表情',
    temp: 0.8,
    maxTokens: 4000,
    price: 3, // 星月真实值：3x
    systemPrompt: `你是一个擅长细腻描写的网络小说作家。

【核心写作原则】
1. 微表情优先：用细微的面部表情和身体语言替代直白的心理描述
2. 内心独白有节制：每段内心独白不超过50字
3. 感官细节：用具体细节（光线透过窗帘的颜色、咖啡杯的温度）替代抽象描述
4. 情感层次：情绪不是非黑即白，描述中间地带和矛盾心理
5. 对话留白：重要的东西在没说出口的话里，而非直接的告白
6. 节奏有张有弛：情绪紧张和松弛交替，保持阅读呼吸感
7. 不用AI万能句式：避免"突然""就在这时""然而""但是""而这时"

【输出要求】
- 如果需要续写，保持前文的情感基调和人物关系稳定性
- 段落留空行，适当分段
- 字数控制在用户要求的范围内`
  },
  'fantasy': {
    name: '奇想版',
    emoji: '🎆',
    desc: '创意脑洞、出人意料、新奇设定',
    temp: 0.95,
    maxTokens: 4000,
    price: 3, // 星月真实值：3x
    systemPrompt: `你是一个创意无限的网络小说作家。

【核心写作原则】
1. 反套路优先：拒绝老套情节，寻找出其不意的叙事角度
2. 设定新颖：世界观和设定要有独特的记忆点
3. 出人意料：每500字至少有一个让人"没想到"的展开
4. 合理创新：创意可以疯狂，但内部逻辑必须自洽
5. 节奏明快：不沉溺于设定说明，用情节展示世界观
6. 突破边界：不要被"常见的写法"限制想象力
7. 不用AI万能句式：避免"突然""就在这时""然而""但是""而这时"

【输出要求】
- 直接输出正文，不需要解释创意来源
- 字数控制在用户要求的范围内`
  },
  'inspiration': {
    name: '灵光版',
    emoji: '💡',
    desc: '灵感迸发、快节奏、强钩子',
    temp: 0.9,
    maxTokens: 3000,
    price: 3, // 星月真实值：3x
    systemPrompt: `你是一个灵感型网络小说作家，擅长快速抓住读者注意力。

【核心写作原则】
1. 开篇即钩子：前100字必须有强烈的吸引力（悬念/冲突/金句）
2. 快节奏：信息密度高，不啰嗦，每段有推进
3. 强期待感：每段结尾留下想继续看的内容
4. 简洁有力：用最少的字传达最多的信息
5. 场景切换快：不在地点描述上浪费笔墨
6. 对话利落：对话要短，要有火药味或信息量
7. 不用AI万能句式：避免"突然""就在这时""然而""但是""而这时"

【输出要求】
- 直接输出正文，不要开场白
- 字数控制在用户要求的范围内`
  },
  'free': {
    name: '豆包（免费版）',
    emoji: '🆓',
    desc: '基础写作能力，节省费用',
    temp: 0.7,
    maxTokens: 2000,
    price: 0,
    systemPrompt: `你是一个网络小说作者。请根据用户要求写出流畅自然的网络小说内容。要求：
1. 语言简单直接，不要过度修饰
2. 段落简短，方便手机阅读
3. 避免AI常见的句式
4. 如需续写，遵循前文风格基本保持一致
5. 直接输出正文，不要开场白`
  }
};

// ═══════════════════════════════════════════════════════
// 写作风格系统 — 仿星月写作
// ═══════════════════════════════════════════════════════
const WRITING_STYLES = [
  { id: 'chendong', name: '辰东', desc: '宏大有气势，热血激昂，擅长神话设定和宏大场面' },
  { id: 'maoni', name: '猫腻', desc: '文笔细腻，江南韵味，擅长人物刻画和情感描写' },
  { id: 'ergen', name: '耳根', desc: '仙侠玄幻，意境深远，文笔带有诗歌韵律感' },
  { id: 'jinyong', name: '金庸', desc: '侠义精神，历史底蕴，人物关系网复杂而真实' },
  { id: 'guyan', name: '古代言情', desc: '古风言情，含蓄优雅，注重情感张力和命运纠葛' },
  { id: 'humor', name: '幽默搞笑', desc: '轻松搞笑，网感强，吐槽风，适合日常和沙雕文' },
  { id: 'conflict', name: '放大矛盾和冲突', desc: '突出矛盾冲突，强化人物性格对立，戏剧性强' },
  { id: 'follow', name: '参考前文风格', desc: '完全遵循前文已建立的写作风格和叙事节奏，不做改变' }
];

// 获取风格system message追加
function getStylePrompt(styleId) {
  const style = WRITING_STYLES.find(s => s.id === styleId);
  if (!style) return '';
  return `\n【写作风格要求】请模仿"${style.name}"的风格来写：${style.desc}\n- 保持该风格的核心特色，但不是抄袭，是学习其精髓\n- 如果是"参考前文风格"，严格遵循前文已有的文风特点`;
}

// ═══════════════════════════════════════════════════════
// 任务路由配置 — 各功能推荐模型的映射
// ═══════════════════════════════════════════════════════
const TASK_MODELS = {
  generate: ['atmosphere', 'thinker', 'delicate', 'fantasy', 'inspiration', 'free'],
  outline: ['thinker', 'atmosphere'],
  detailOutline: ['thinker', 'atmosphere'],
  title: ['fantasy', 'inspiration', 'atmosphere'],
  synopsis: ['atmosphere', 'inspiration', 'fantasy'],
  brainstorm: ['fantasy', 'inspiration', 'thinker'],
  polish: ['delicate', 'free'],
  chat: ['thinker', 'atmosphere'],
  character: ['delicate', 'fantasy'],
};

// ═══════════════════════════════════════════════════════
// 真实提示词库
// ═══════════════════════════════════════════════════════
const PROMPTS = {
    writing: [
        { id: 'pw1', title: '【🌙】祛AI味·番茄剧情框架', desc: '减少描述，强化剧情节奏，适合番茄风', content: `请用番茄小说的风格续写以下内容。\n要求：\n1. 减少景物和情绪描写，节奏要快\n2. 对话推动剧情，不设太多心理活动\n3. 每段不超过3句话，段落间留空行\n4. 前500字要有钩子或小冲突\n5. 去掉AI常见的过渡词如"然而""但是""突然""就在这时"\n6. 多用短句，字数字数1500-2000字` },
        { id: 'pw2', title: '【🔥】爽文节奏·打脸升级', desc: '打脸升级流，节奏明快', content: `请按网络爽文风格续写。\n要求：\n1. 前200字铺垫，快速进入冲突\n2. 配角要有明显的前后反差（看不起→震惊）\n3. 主角展示实力的过程要干脆利落\n4. 通过路人的震惊反应来烘托主角的强大\n5. 每个场景结尾都留有期待感\n6. 字数1500-2000字\n7. 语言通俗易懂，不要文绉绉` },
        { id: 'pw3', title: '【💕】情感细腻·言情', desc: '情感描写丰富，适合言情文', content: `请用细腻的情感风格续写。\n要求：\n1. 用感官描写传达情绪（光线、气味、触感）\n2. 微表情和身体语言代替直白的心理描述\n3. 每处内心独白不超过50字\n4. 环境描写要服务于情感氛围\n5. 对话要节制，留白比说满更动人\n6. 字数1200-1800字` },
        { id: 'pw4', title: '【⚔️】打斗场面·燃系', desc: '热血打斗，场面感强', content: `请描写打斗场面。\n要求：\n1. 清晰的攻防交替节奏\n2. 利用场地环境（墙壁/地面/道具）增加变化\n3. 每个动作都有明确的目的和结果\n4. 力量感和速度感要写得具体\n5. 打斗中的对话要简短有力\n6. 打斗结果要有影响力（受伤/觉悟/转折）\n7. 字数1000-1500字` },
        { id: 'pw5', title: '【🧐】悬疑推理·伏笔', desc: '悬疑氛围，逻辑严密', content: `请按悬疑推理风格续写。\n要求：\n1. 多角度铺设线索（环境/对话/物证）\n2. 真假信息交错，误导读者\n3. 节奏由缓到急，逐层推进\n4. 保持逻辑自洽，前期伏笔后期回收\n5. 结尾留下新的悬念\n6. 不要提前暴露真相\n7. 字数1500-2000字` },
        { id: 'pw6', title: '【🏮】古风仙侠·意境流', desc: '古风韵味，仙侠意境', content: `请用古风仙侠风格续写。\n要求：\n1. 用词雅致但不晦涩，避免生僻字\n2. 意境营造优先于情节推进\n3. 修炼体系和境界设定要连贯\n4. 可以适当引经据典（诗词典故）\n5. 克制使用现代词汇和网络用语\n6. 打斗描写偏重"意境"而非"招式"\n7. 字数1500-2000字` },
        { id: 'pw7', title: '【🤖】科幻设定·硬核', desc: '科幻硬核，技术细节', content: `请用科幻风格续写。\n要求：\n1. 科技设定要有合理的技术逻辑\n2. 技术描述具体但不冗长枯燥\n3. 未来感与人文关怀并重\n4. 不违背已建立的世界观设定\n5. 科技发展对人类社会的影响要有体现\n6. 字数1500-2000字` },
        { id: 'pw8', title: '【🎭】轻小说·对话风', desc: '轻松对话驱动，适合轻小说/日常', content: `请用轻小说风格续写。\n要求：\n1. 对话占60%以上内容\n2. 角色说话要有辨识度（口头禅/语气词）\n3. 叙述视角轻快活泼\n4. 适当加入吐槽和内心os\n5. 场景转换快，避免大段独白\n6. 字数1500-2000字` },
        { id: 'pw9', title: '【📱】短篇爆款·知乎风', desc: '短篇开头吸睛，反转多', content: `请用短篇爆款风格续写（知乎/小红书风）。\n要求：\n1. 开头前100字必须有强吸引力（反常识/悬念/冲突）\n2. 多用前置信息制造期待感\n3. 每500字设置一个小反转\n4. 全文控制在3000-4000字\n5. 结尾要有记忆点或金句\n6. 口语化叙述，代入感强` },
        { id: 'pw10', title: '【📜】史诗·宏大叙事', desc: '多线叙事，场面宏大', content: `请用史诗风格续写。\n要求：\n1. 开篇提供宏观视角（时间/地点/时代背景）\n2. 多线索交错推进\n3. 人物群像刻画，每个角色有自己的动机\n4. 战争/大场面的描写要有层次感\n5. 主题要有深度（命运/选择/代价）\n6. 字数2000-3000字` },
    ],
    outline: [
        { id: 'po1', title: '经典三幕式', desc: '开端→发展→高潮结局', beats: ['1. 第一幕-开端(25%)：建立世界规则，主角的日常生活，触发事件打破平衡', '2. 第二幕-发展前半(25%)：主角做出选择，结识盟友/敌人，第一次冲突尝试', '3. 第二幕-转折点(15%)：重大失败/秘密揭露，主角失去关键支持', '4. 第三幕-高潮(25%)：最终对决，解决核心矛盾', '5. 收尾(10%)：展示新秩序，留下续集空间'] },
        { id: 'po2', title: '网文爽文节奏', desc: '连续打脸升级，停不下来', beats: ['1. 黄金开局(1-3章)：强设定＋小冲突＋能力展示', '2. 小试牛刀(4-8章)：第一次打脸，配角震惊，获得奖励', '3. 新地图(9-15章)：进入新环境，更强对手', '4. 中期质变(16-25章)：境界突破，身份揭露', '5. 小高潮(26-30章)：碾压之前看不起自己的人', '6. 大高潮(31-35章)：生死对决，守护重要的人', '7. 收尾铺垫(36-40章)：更大的阴谋浮现，目标升级'] },
        { id: 'po3', title: '悬疑推理节奏', desc: '层层递进的解谜过程', beats: ['1. 案件发生(1-2章)：发现谜题/命案，信息不对称', '2. 初次调查(3-6章)：多方向收集线索', '3. 第一转折(7-8章)：关键线索推翻初期假设', '4. 深入调查(9-12章)：新方向，新嫌疑人', '5. 第二转折(13-14章)：意料之外的真相关键', '6. 真相揭晓(15-17章)：完整逻辑链呈现', '7. 余波(18章)：事件影响，伏笔后续'] },
        { id: 'po4', title: '英雄之旅', desc: '经典叙事学架构', beats: ['1. 平凡世界：主角的日常生活和困境', '2. 冒险召唤：打破平静的事件', '3. 拒绝召唤：主角犹豫和退缩', '4. 遇见导师：获得指引和礼物', '5. 跨过门槛：踏上征程，不可回头', '6. 考验与盟友：新的伙伴和挑战', '7. 接近核心：准备面对最终目标', '8. 严峻考验：生死关头，最大危机', '9. 获得奖赏：胜利果实，新的领悟', '10. 返回之路：带着改变回归', '11. 复活重生：最后的考验，真正蜕变', '12. 带着宝物回归：拯救家园，故事完结'] },
        { id: 'po5', title: '短篇爆款结构', desc: '知乎/小红书短篇专用', beats: ['1. 强力开头(100字)：反常识陈述或强冲突开场', '2. 背景展开(300字)：快速交代人物和关系', '3. 第一转折(500字)：意外事件打破预期', '4. 冲突升级(800字)：误会加深或矛盾激化', '5. 真相揭露(300字)：反转，原来如此', '6. 情感爆发(300字)：高光时刻或金句', '7. 余味结局(100字)：点到即止，引发共鸣'] },
        { id: 'po6', title: '百万字长篇·分卷式', desc: '多卷纲+总纲，百万字级', beats: ['1. 全书总纲：Logline+核心矛盾+主角成长弧+结局方向', '2. 分卷规划：每卷3-8万字，2-3件核心事件', '3. 卷1卷纲：本卷起止章、核心事件、角色变化、结尾钩子', '4. 卷2卷纲：（以此类推,3-10卷）', '5. 情绪曲线：每卷的情绪走向（起-落-起）', '6. 章纲示范：前3章每章3-5个情节点+结尾钩子'] },
        { id: 'po7', title: '自定义自由结构', desc: '用户自由描述结构', beats: ['1. 用户自定义：完全按用户描述的结构和节奏生成', '2. 输出格式保留用户指定的层级'] },
    ],
    title: [
        { id: 'pt1', title: '【🌙】SSS级爆款番茄书名', desc: '番茄风，书测救星', content: `请生成10个爆款网络小说书名。\n要求：\n1. 符合番茄/起点风格\n2. 书名中要体现核心爽点或类型标签\n3. 对标当下排行榜的热门书名模式\n4. 每个书名配一句推荐理由（为什么这个书名能火）\n5. 覆盖：都市、玄幻、言情至少各2个\n6. 书名要简洁有力，10字以内` },
        { id: 'pt2', title: '【通用爆款】书名生成', desc: '适合各平台的爆款书名', content: `请根据以下梗概生成8个书名。\n要求：\n1. 书名要传达出故事的核心吸引力\n2. 考虑目标读者群体的喜好\n3. 避免过于文雅或拗口\n4. 可参考：反差、悬念、金手指暗示等模式\n5. 每个书名附点评（目标读者和预期表现）` },
        { id: 'pt3', title: '模仿爆款书名生成', desc: '根据已有爆书名产生灵感', content: `请模仿当前流行的网络小说书名模式，生成6个类似风格的书名。\n模式参考：\n- 《xxx：xxxxxxxx》格式\n- 数字+量词+名词 格式\n- 反问/设问句式\n- 反差对比格式\n每个书名附一句话说明它的"卖点"在哪里` },
    ],
    synopsis: [
        { id: 'ps1', title: '【以文成鑫】番茄风简介2.0', desc: '番茄风/起点风简介生成', content: `请根据以下信息生成一个吸引人的小说简介。\n要求：\n1. 前50字必须抓住注意力（悬念/反差/金句）\n2. 交代核心设定但不剧透太多\n3. 留下期待感（读者想知道"接下来呢？"）\n4. 字数250-350字\n5. 针对番茄小说平台风格（网感强，节奏快）` },
        { id: 'ps2', title: '起点风简介模板', desc: '正统网文简介风格', content: `请根据提供的信息生成小说简介。\n要求：\n1. 开篇用一句话概括世界观和主角\n2. 中间段落描述核心冲突和成长线\n3. 结尾用提问或排比句增强期待\n4. 字数200-300字\n5. 风格偏正统网文，信息量大` },
    ],
    brainstorm: [
        { id: 'pb1', title: '脑洞创意生成', desc: '突破思维边界', content: `请根据以下要求生成10个原创小说脑洞/创意。\n要求：\n1. 每个脑洞要包含：一句话简介+核心冲突+目标受众\n2. 脑洞要新颖，避开常见的套路\n3. 要考虑可执行性（写起来顺不顺手）\n4. 覆盖不同题材类型` },
        { id: 'pb2', title: '黄金开篇构思', desc: '前300字抓住读者', content: `请为以下设定构思一个黄金开篇。\n要求：\n1. 前100字必须有强冲击力\n2. 快速建立主角形象（一句话体现性格）\n3. 埋下剧情伏笔\n4. 给出3个不同方向的开篇方案\n5. 每个方案200字左右的正文示范` },
        { id: 'pb3', title: '金手指设计', desc: '独特的金手指系统', content: `请设计3个独特且新颖的金手指/系统设定。\n要求：\n1. 核心机制清晰，一句话能说明"怎么用"\n2. 有明确的成长曲线（不是开局即无敌）\n3. 有潜在的副作用或限制（增加戏剧性）\n4. 与世界观设定呼应\n5. 给出具体的应用场景例子` },
    ],
    polish: [
        { id: 'pp1', title: 'AI文祛除痕迹', desc: '让AI生成的文字更自然', content: `请对以下文本进行修改，要求：\n1. 去除AI写作的常见特征（过于工整、万能句式、过度描写）\n2. 增加口语化和网感\n3. 段落变短，节奏更紧凑\n4. 减少直到、然而、不过、突然等过渡词\n5. 保留原意的同时让文字更"像人写的"\n6. 保持风格一致` },
        { id: 'pp2', title: '扩写润色', desc: '扩展内容，提升文采', content: `请对以下文本进行扩写润色。\n要求：\n1. 在关键场景处增加具体细节（感官描写）\n2. 提升语言的表现力但不过度华丽\n3. 补充角色的微反应和情绪变化\n4. 字数控制在原文的1.5-2倍\n5. 保持原有的风格和叙事节奏` },
    ],
    charDesign: [
        { id: 'pc1', title: '人设生成', desc: '立体的角色设定', content: `请设计一个完整的角色人设。\n输出格式：\n【基本信息】姓名/年龄/性别/外貌特征\n【性格特征】核心性格+3个关键词+一处矛盾（表里不一）\n【背景故事】关键成长事件（为什么成为现在这样）\n【能力设定】专业技能/特殊能力/知识领域\n【人物关系】2-3个关键关系及互动方式\n【金句/标签】一句能代表这个角色的话\n【成长弧线】这个角色在故事中的变化方向` },
        { id: 'pc2', title: '反派设计', desc: '有魅力的反派', content: `请设计一个有魅力的反派角色。\n要求：\n1. 反派的动机要合理化（不单纯是"坏"）\n2. 反派和主角要有某种对应关系\n3. 给出反派的"高光时刻"（令人印象深刻的场景）\n4. 反派的弱点和破绽\n5. 反派在故事中的位置（什么时候出现，什么时候收场）` },
    ]
};

// ─── DeepSeek API 调用 ───
// 密钥/接口/模型均实时从配置读取（data/config.json → 环境变量 → 默认值），
// 不再在模块加载时缓存，使前端 UI 修改无需重启即生效。

function getPromptByKey(key) {
    for (const cat of Object.values(PROMPTS)) {
        const found = cat.find(p => p.id === key);
        if (found) return found;
    }
    return null;
}

function getAllPrompts() {
    const result = [];
    for (const [cat, prompts] of Object.entries(PROMPTS)) {
        prompts.forEach(p => result.push({ ...p, category: cat }));
    }
    return result;
}

// GET /api/writing/ai/models — 获取模型版本列表
router.get('/ai/models', (req, res) => {
    const models = {};
    for (const [key, val] of Object.entries(MODEL_PERSONAS)) {
        models[key] = { name: val.name, emoji: val.emoji, desc: val.desc, temp: val.temp, price: val.price };
    }
    res.json({ success: true, data: { models, taskModels: TASK_MODELS } });
});

// GET /api/writing/ai/styles — 获取写作风格列表（合并旧风格+新styles.json）
router.get('/ai/styles', (req, res) => {
    try {
      const stylesPath = path.join(__dirname, '..', '..', 'data', 'writing', 'styles.json');
      if (fs.existsSync(stylesPath)) {
        const newStyles = JSON.parse(fs.readFileSync(stylesPath, 'utf8'));
        if (newStyles.length > 0) {
          return res.json({ success: true, data: newStyles });
        }
      }
    } catch(e) { /* fallback to old styles */ }
    res.json({ success: true, data: WRITING_STYLES });
});



// GET /api/writing/ai/genre-templates — 获取所有风格模板（含traits）
let GENRE_TEMPLATES = [];
try {
  const fs = require('fs');
  const path = require('path');
  const dataPath = path.join(__dirname, '..', '..', 'data', 'writing', 'styles.json');
  if (fs.existsSync(dataPath)) {
    GENRE_TEMPLATES = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  }
} catch(e) { console.error('Failed to load genre templates:', e.message); }

router.get('/ai/genre-templates', (req, res) => {
    // 热加载
    try {
      const fs = require('fs');
      const path = require('path');
      const dataPath = path.join(__dirname, '..', '..', 'data', 'writing', 'styles.json');
      if (fs.existsSync(dataPath)) {
        GENRE_TEMPLATES = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      }
    } catch(e) {}
    res.json({ success: true, data: GENRE_TEMPLATES });
});
// GET /api/writing/ai/prompts — 获取所有提示词
router.get('/ai/prompts', (req, res) => {
    res.json({ prompts: getAllPrompts() });
});



// GET /api/writing/ai/prompts/:category — 按分类获取
router.get('/ai/prompts/:category', (req, res) => {
    const cat = PROMPTS[req.params.category];
    if (!cat) return res.status(404).json({ error: 'category not found' });
    res.json({ prompts: cat });
});

// ═══════════════════════════════════════════════
// 变量注入 — 将 {变量名} 替换为用户提供的值
// ═══════════════════════════════════════════════
function injectVariables(template, variables) {
    if (!template || !variables) return template;
    let result = template;
    for (const [key, val] of Object.entries(variables)) {
        if (val) {
            const re = new RegExp(`\\{${key}\\}`, 'g');
            result = result.replace(re, val);
        }
    }
    return result;
}

// ═══════════════════════════════════════════════
// 统一DeepSeek调用函数（支持推理模型）
// ═══════════════════════════════════════════════
async function callDeepSeek({ systemMsg, userMsg, modelVersion, persona, thinkingBudget, extraMessages }) {
    const isReasoner = modelVersion === 'thinker';
    const wc = config.getWritingConfig();
    const apiUrl = wc.api || 'https://api.deepseek.com/v1/chat/completions';

    const body = {
        model: isReasoner ? 'deepseek-reasoner' : (wc.model || 'deepseek-chat'),
        messages: [
            { role: 'system', content: systemMsg },
            ...(extraMessages || []),
            { role: 'user', content: userMsg }
        ],
        stream: false
    };
    
    if (!isReasoner) {
        body.temperature = persona?.temp || 0.8;
        body.max_tokens = persona?.maxTokens || 4000;
    } else {
        // 思考者使用推理模型
        body.max_tokens = 8000;
        if (thinkingBudget) {
            body.thinking_budget = thinkingBudget;
        }
    }
    
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + config.getWritingConfig().apiKey
        },
        body: JSON.stringify(body)
    });
    
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`DeepSeek API ${response.status}: ${errText.substring(0, 200)}`);
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // 从reasoner响应中提取thinking内容（如果有）
    let thinking = null;
    if (isReasoner && data.choices?.[0]?.message?.reasoning_content) {
        thinking = data.choices[0].message.reasoning_content;
    }
    
    return { content, thinking, usage: data.usage, model: isReasoner ? 'deepseek-reasoner' : (wc.model || 'deepseek-chat') };
}

// ─── 世界观自动注入 ───
function buildWorldContext(projectId) {
  if (!projectId) return '';
  try {
    var worldFile = path.join(DATA_DIR, 'world-' + projectId + '.json');
    if (!fs.existsSync(worldFile)) return '';
    var world = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
    var toArray = function(o) { return Array.isArray(o) ? o : Object.values(o || {}); };
    var sections = [];
    
    // 1. Characters - full personality + relationships
    var chars = toArray(world.characters).filter(function(c) { return !c.autoExtracted; });
    if (chars.length > 0) {
      var txt = '=== 角色 ===\n';
      chars.forEach(function(c) {
        txt += '- ' + c.name;
        var a = c.attributes || {};
        if (a.identity) txt += ' [' + a.identity + ']';
        if (a.personality) txt += ' 性格: ' + a.personality;
        if (a.current_status) txt += ' 状态: ' + a.current_status;
        if (a.speech_style) txt += ' 说话: ' + a.speech_style;
        if (a.relationships) txt += ' 关系: ' + a.relationships;
        if (a.source) txt += ' (' + a.source + ')';
        txt += '\n';
      });
      sections.push(txt);
    }
    
    // 2. Zones / Maps
    var zones = toArray(world.zones);
    if (zones.length > 0) {
      var txt = '=== 地图/场景 ===\n';
      zones.forEach(function(z) {
        txt += '- ' + z.name;
        var a = z.attributes || {};
        if (a.desc || a.描述) txt += ': ' + (a.desc || a.描述);
        if (a.level_range) txt += ' (等级' + a.level_range + ')';
        txt += '\n';
      });
      sections.push(txt);
    }
    
    // 3. Monsters
    var monsters = toArray(world.monsters);
    if (monsters.length > 0) {
      var txt = '=== 怪物 ===\n';
      monsters.forEach(function(m) {
        txt += '- ' + m.name;
        var a = m.attributes || {};
        if (a.boss_type) txt += ' [' + a.boss_type + ']';
        if (a.appearance) txt += ' 外观: ' + a.appearance;
        if (a.drops) txt += ' 掉落: ' + a.drops;
        if (a.spawn_zone) txt += ' 出没: ' + a.spawn_zone;
        txt += '\n';
      });
      sections.push(txt);
    }
    
    // 4. Equipment
    var equip = toArray(world.equipment);
    if (equip.length > 0) {
      var txt = '=== 装备 ===\n';
      equip.forEach(function(e) {
        txt += '- ' + e.name;
        var a = e.attributes || {};
        if (a.type) txt += ' (' + a.type + ')';
        if (a.stats) txt += ' 属性: ' + a.stats;
        if (a.owner) txt += ' 使用者: ' + a.owner;
        txt += '\n';
      });
      sections.push(txt);
    }
    
    // 5. Skills
    var skills = toArray(world.skills);
    if (skills.length > 0) {
      var txt = '=== 技能 ===\n';
      skills.forEach(function(s) {
        txt += '- ' + s.name;
        var a = s.attributes || {};
        if (a.class) txt += ' (' + a.class + ')';
        if (a.level_required) txt += ' 需求等级' + a.level_required;
        txt += '\n';
      });
      sections.push(txt);
    }
    
    // 6. Rules
    var rules = toArray(world.rules);
    if (rules.length > 0) {
      var txt = '=== 游戏机制 ===\n';
      rules.forEach(function(r) {
        txt += '- ' + r.name;
        var a = r.attributes || {};
        var core = a.core_rule || a.核心规则 || '';
        if (core) txt += ': ' + core;
        txt += '\n';
      });
      sections.push(txt);
    }
    
    // 7. Guilds
    var guilds = toArray(world.guilds);
    if (guilds.length > 0) {
      var txt = '=== 公会 ===\n';
      guilds.forEach(function(g) {
        txt += '- ' + g.name;
        var a = g.attributes || {};
        if (a.leader) txt += ' 会长: ' + a.leader;
        txt += '\n';
      });
      sections.push(txt);
    }
    
    // 8. Timeline (current stage context)
    var timeline = toArray(world.timeline);
    if (timeline.length > 0) {
      var txt = '=== 故事时间线 ===\n';
      timeline.forEach(function(t) {
        var a = t.attributes || {};
        txt += '- ' + (a.day || t.day || '') + ': ' + (a.events || t.events || '') + ' (' + (t.type || a.type || '') + ')\n';
      });
      sections.push(txt);
    }
    
    // 9. Tactics
    var tactics = toArray(world.tactics);
    if (tactics.length > 0) {
      var txt = '=== 战斗技巧 ===\n';
      tactics.forEach(function(tac) {
        txt += '- ' + tac.name;
        var a = tac.attributes || {};
        if (a.desc) txt += ': ' + a.desc;
        txt += '\n';
      });
      sections.push(txt);
    }
    
    // 10. Items, Materials, Classes, Locations
    var items = toArray(world.items);
    if (items.length > 0) {
      var txt = '=== 道具/物品 ===\n';
      items.forEach(function(i) {
        txt += '- ' + i.name;
        var a = i.attributes || {};
        if (a.item_type) txt += ' (' + a.item_type + ')';
        if (a.effect) txt += ': ' + a.effect;
        txt += '\n';
      });
      sections.push(txt);
    }
    
    var materials = toArray(world.materials);
    if (materials.length > 0) {
      var txt = '=== 材料 ===\n';
      materials.forEach(function(m) {
        txt += '- ' + m.name;
        var a = m.attributes || {};
        if (a.source) txt += ' 来源: ' + a.source;
        txt += '\n';
      });
      sections.push(txt);
    }
    
    var classes = toArray(world.classes);
    if (classes.length > 0) {
      var txt = '=== 职业 ===\n';
      classes.forEach(function(c) {
        txt += '- ' + c.name;
        var a = c.attributes || {};
        if (a.role) txt += ' [' + a.role + ']';
        txt += '\n';
      });
      sections.push(txt);
    }
    
    var locs = toArray(world.locations);
    if (locs.length > 0) {
      var txt = '=== 地点 ===\n';
      locs.forEach(function(l) {
        txt += '- ' + l.name;
        var a = l.attributes || {};
        if (a.desc) txt += ': ' + a.desc;
        txt += '\n';
      });
      sections.push(txt);
    }
    
    if (sections.length === 0) return '';
    
    var ctx = '\n【以下为本次写作需严格遵守的世界观设定】\n\n';
    sections.forEach(function(s) { ctx += s + '\n'; });
    ctx += '注意：以上设定不可违反。角色属性、关系、当前状态、游戏机制均在此定义，写作时须严格对齐。\n';
    ctx += '尤其注意：时间线与原著事件同步。Day 1 = 第十区开服日。陆沉的故事和原著故事共享同一日历。\n';
    return ctx;
  } catch(e) {
    console.error('World context injection failed:', e.message);
    return '';
  }
}

// POST /api/writing/ai/generate — 调用AI生成内容
// 新增参数：modelVersion, style, variables(变量注入), thinkingBudget, projectId
router.post('/ai/generate', async (req, res) => {
    const { promptId, userInput, extra, mode, modelVersion, style, variables, thinkingBudget, projectId } = req.body;
    
    const prompt = promptId ? getPromptByKey(promptId) : null;
    const persona = MODEL_PERSONAS[modelVersion] || MODEL_PERSONAS['atmosphere'];
    const stylePrompt = getStylePrompt(style);
    
    let systemMsg = persona.systemPrompt;
    let userMsg = '';
    
    if (stylePrompt) systemMsg += stylePrompt;
    
    // 注入世界观设定
    var worldCtx = buildWorldContext(projectId);
    if (worldCtx) systemMsg += worldCtx;
    
    // 注入变量到prompt内容
    let promptContent = prompt?.content || '';
    if (variables) {
        promptContent = injectVariables(promptContent, variables);
        if (userInput) userInput = injectVariables(userInput, variables);
    }
    
    if (mode === 'title') {
        systemMsg = `你是一个爆款网络小说书名策划专家。\n${stylePrompt || ''}\n【核心要求】1. 直接输出书名列表，不要加开场白或总结 2. 每行一个书名+推荐理由 3. 语言简洁有网感，不要AI式的工整句式 4. 书名要有冲击力，一眼就能让读者想点进去`;
        userMsg = promptContent || '请生成8个爆款网络小说书名，每个配一句话推荐理由。';
        if (userInput) userMsg += `\n\n核心灵感/梗概：${userInput}`;
        if (extra) userMsg += `\n\n补充要求：${extra}`;
    } else if (mode === 'synopsis') {
        systemMsg = `你是一个小说简介撰写专家。\n${stylePrompt || ''}\n【核心要求】1. 直接输出简介正文 2. 语言有真实网文感，避免万能句式 3. 结尾留钩子`;
        userMsg = promptContent || '请根据提供的信息生成小说简介。';
        if (userInput) userMsg += `\n\n书名/梗概：${userInput}`;
        if (extra) userMsg += `\n\n补充要求：${extra}`;
    } else if (mode === 'brainstorm') {
        systemMsg = `你是一个创意策划专家，擅长为网络小说构思新颖的创意和设定。\n${stylePrompt || ''}`;
        userMsg = promptContent || '请生成创意脑洞。';
        if (userInput) userMsg += `\n\n要求/方向：${userInput}`;
        if (extra) userMsg += `\n\n补充要求：${extra}`;
    } else if (mode === 'polish') {
        systemMsg = `你是一个专业的小说编辑和润色专家。\n${stylePrompt || ''}`;
        userMsg = promptContent || '请对以下文本进行修改润色。';
        if (userInput) userMsg += `\n\n待处理文本：${userInput}`;
        if (extra) userMsg += `\n\n额外要求：${extra}`;
    } else if (mode === 'character') {
        systemMsg = `你是一个专业的小说角色设计专家。\n${stylePrompt || ''}`;
        userMsg = promptContent || '请设计一个完整的角色人设。';
        if (userInput) userMsg += `\n\n角色方向/灵感：${userInput}`;
        if (extra) userMsg += `\n\n额外要求：${extra}`;
    } else {
        // Default: AI写作
        systemMsg += `\n提示词指令：${promptContent || '请根据剧情要点创作高质量的网文内容。'}`;
        userMsg = userInput ? `剧情要点：${userInput}` : '请写一段小说内容。';
        if (extra) userMsg += `\n\n额外要求：${extra}`;
        userMsg += `\n\n请直接输出正文内容，不要加开场白。`;
    }

    try {
        const result = await callDeepSeek({ systemMsg, userMsg, modelVersion, persona, thinkingBudget });
        
        res.json({ 
            success: true, 
            content: result.content,
            thinking: result.thinking,
            model: result.model,
            modelKey: modelVersion,
            persona: persona.name,
            price: persona.price,
            temperature: persona.temp,
            style: style || null,
            usage: result.usage,
            prompt: prompt?.title || '自定义',
            isReasoner: modelVersion === 'thinker'
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/writing/ai/outline — 生成大纲（三层体系）
router.post('/ai/outline', async (req, res) => {
    const { templateId, userInput, modelVersion, style } = req.body;
    if (!userInput) return res.status(400).json({ success: false, error: 'story content required' });
    
    const persona = MODEL_PERSONAS[modelVersion] || MODEL_PERSONAS['thinker'];
    const stylePrompt = getStylePrompt(style);
    
    let beatsContent = '';
    for (const o of PROMPTS.outline) {
        if (o.id === templateId) {
            beatsContent = o.beats.map((b,i) => `${i+1}. ${b}`).join('\n');
            break;
        }
    }
    
    const systemMsg = `你是一名资深网文编辑，有10年起点的签约作者辅导经验。
为用户创作的小说生成【三层大纲体系】。${stylePrompt || ''}

## 输出要求（严格遵循以下结构）

### 📋 总纲（全书蓝图）
- 一句话核心（Logline）
- 核心矛盾
- 主角成长弧
- 字数规划：根据用户输入预估，分X卷

### 📋 卷纲（每卷分述）
每卷包含：卷名、起止章节数、核心事件(2-3件)、角色变化、结尾钩子

### 📋 章纲（前X章示范）
每章包含：章名、场景概述、核心冲突、结尾钩子

## 结构模板参考
${beatsContent || '按用户故事核心生成合适的结构'}

## 重要原则
- 每章结尾必须有钩子
- 确保情节密度，避免注水
- 伏笔要前后照应
- 支持10万字到300万字规模`;
    
    try {
        const result = await callDeepSeek({
            systemMsg,
            userMsg: `## 用户故事核心\n${userInput}\n\n请基于以上核心按三层大纲体系生成完整的大纲。`,
            modelVersion: modelVersion || 'thinker',
            persona
        });
        res.json({ success: true, content: result.content, persona: persona.name, model: result.model });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/writing/ai/detail-outline — 生成细纲
router.post('/ai/detail-outline', async (req, res) => {
    const { userInput, chapterCount, modelVersion, style } = req.body;
    if (!userInput) return res.status(400).json({ success: false, error: 'outline content required' });
    
    const persona = MODEL_PERSONAS[modelVersion] || MODEL_PERSONAS['thinker'];
    const stylePrompt = getStylePrompt(style);
    const count = chapterCount || 5;

    const systemMsg = `你是一名资深网文细纲策划师。
${stylePrompt || ''}

## 任务
根据用户提供的粗纲/大纲，拆解为${count}章细纲，每章包含3-5个场景。

## 输出格式
第1章：「章节名」
├── 场景1：「场景名」（约XXX字）
│   ├── 地点/时间
│   ├── 出场角色
│   ├── 核心冲突
│   └── 情绪走向（↗↘↗↘）
├── 场景2：「场景名」（约XXX字）
│   ├── ……
└── 结尾钩子：……

第2章：「章节名」
├── 场景1：……

……（以此类推，共${count}章）

## 原则
- 每章3-5个场景，每个场景200-500字概要
- 场景间有明确的叙事推进
- 每章结尾必须有钩子
- 确保情节密度，不注水
- 情绪曲线要有起伏`;
    
    try {
        const result = await callDeepSeek({
            systemMsg,
            userMsg: `## 用户输入的大纲/粗纲\n${userInput}\n\n请拆解为${count}章细纲，每章包含3-5个场景。`,
            modelVersion: modelVersion || 'thinker',
            persona
        });
        res.json({ success: true, content: result.content, persona: persona.name, model: result.model });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/writing/ai/chat — 自由对话式AI辅助
router.post('/ai/chat', async (req, res) => {
    const { message, context, modelVersion, style } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    const persona = MODEL_PERSONAS[modelVersion] || MODEL_PERSONAS['thinker'];
    const stylePrompt = getStylePrompt(style);
    
    let systemMsg = `你是一个专业的写作助手。帮助用户解决写作中的各种问题，包括：人物塑造、情节设计、对话优化、写作技巧等。回答要具体、可操作，避免空泛的建议。`;
    if (stylePrompt) systemMsg += `\n\n当前写作风格设定：${stylePrompt}`;

    try {
        const result = await callDeepSeek({
            systemMsg,
            userMsg: message,
            modelVersion: modelVersion || 'thinker',
            persona,
            extraMessages: context ? [{ role: 'user', content: context }] : []
        });
        res.json({ success: true, content: result.content, persona: persona.name, model: result.model });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ═══════════════════════════════════════════════
// 多轮工作流：冲突升级
// ═══════════════════════════════════════════════
router.post('/ai/upgrade-conflict', async (req, res) => {
    const { text, style, modelVersion, thinkingBudget } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });
    
    const systemMsg = `你是一个专业的小说冲突升级专家。你的任务是阅读一段小说正文，在不改变原有剧情框架和人设的前提下，做以下升级：\n\n1. 加强核心矛盾：让冲突更加尖锐，角色之间的立场更加对立\n2. 增加情绪张力：通过对话和内心活动放大情感冲突\n3. 提升期待感：在冲突中埋下更强的悬念和期待\n4. 保持节奏：不刻意拖长，升级后的段落长度控制在原文的1.2-1.5倍\n5. 不要改变原文的核心走向和结局\n\n直接输出升级后的正文，不需要解释改动的地方。`;
    
    const userMsg = `请对以下正文进行冲突升级：\n\n${text}`;
    
    try {
        const result = await callDeepSeek({ systemMsg, userMsg, modelVersion, persona: modelVersion === 'thinker' ? MODEL_PERSONAS['thinker'] : MODEL_PERSONAS['atmosphere'], thinkingBudget });
        res.json({ success: true, content: result.content, model: result.model, usage: result.usage });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/writing/ai/polish-ai — 去AI味润色
router.post('/ai/polish-ai', async (req, res) => {
    const { text, style } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });
    
    const stylePrompt = getStylePrompt(style);
    
    const systemMsg = `你是一个小说润色专家，专门去除AI写作痕迹。${stylePrompt || ''}\n\n【去除AI味规则】\n1. 删除「突然」「就在这时」「然而」「不禁」「不由得」「仿佛」「似乎」「只见」等AI万能过渡词\n2. 缩减从属描写：将「xxx，yyy地看着他」改为「xxx看着他」\n3. 去掉多余的形容词和副词\n4. 把长句拆成短句（15字以内一句最佳）\n5. 增加口语化和角色语言特色\n6. 不要增加原文没有的内容，不扩写\n7. 不改动原文的核心情节、对话意思、人物关系\n8. 原文的段落结构和断句风格尽量保留\n\n直接输出润色后的正文，不需要说明改了什么。`;
    
    const userMsg = `请去除以下正文的AI味：\n\n${text}`;
    
    try {
        const result = await callDeepSeek({ systemMsg, userMsg, modelVersion: 'delicate', persona: MODEL_PERSONAS['delicate'] });
        res.json({ success: true, content: result.content, model: result.model, usage: result.usage });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ═══════════════════════════════════════════════
// 多模型对比生成 — 用2个模型同时生成，返回对比结果
// ═══════════════════════════════════════════════
router.post('/ai/compare', async (req, res) => {
    const { userInput, extra, style, model1, model2, thinkingBudget1, thinkingBudget2 } = req.body;
    if (!userInput) return res.status(400).json({ error: 'userInput required' });
    
    const p1 = MODEL_PERSONAS[model1] || MODEL_PERSONAS['atmosphere'];
    const p2 = MODEL_PERSONAS[model2] || MODEL_PERSONAS['fantasy'];
    
    const stylePrompt = getStylePrompt(style);
    const systemMsg = `你是一个专业的小说作家。${stylePrompt || ''}\n直接输出正文，不要开场白和总结。`;
    const userMsg = `${userInput}\n\n${extra ? `补充要求：${extra}` : ''}`;
    
    try {
        const [r1, r2] = await Promise.all([
            callDeepSeek({ systemMsg, userMsg, modelVersion: model1, persona: p1, thinkingBudget: thinkingBudget1 }),
            callDeepSeek({ systemMsg, userMsg, modelVersion: model2, persona: p2, thinkingBudget: thinkingBudget2 })
        ]);
        
        res.json({
            success: true,
            results: [
                { model: model1, modelName: p1.name, content: r1.content, thinking: r1.thinking, modelApi: r1.model, usage: r1.usage, price: p1.price },
                { model: model2, modelName: p2.name, content: r2.content, thinking: r2.thinking, modelApi: r2.model, usage: r2.usage, price: p2.price }
            ]
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ═══════════════════════════════════════════════
// 专家写作技巧
// ═══════════════════════════════════════════════
const EXPERT_TIPS = [
    {
        id: 1, category: '通用',
        title: '多模型多版本融合',
        content: '用不同模型（氛围版/奇想版/灵光版）多次生成相同内容，手动筛选不同版本的亮点，再将选中的部分融合成最终版本。不同模型擅长不同的方面：氛围版重描写，奇想版重创意，灵光版重节奏。',
        author: '星月大神崔神'
    },
    {
        id: 2, category: '通用',
        title: '生成前加指令限制',
        content: '在输入框最下方用括号加入额外指令，如：(本章侧重情绪铺垫，节奏放慢) 或 (文字精简，快速推进剧情)。将需求讲清楚，生成效果会明显不同。',
        author: '星月大神wzc'
    },
    {
        id: 3, category: '写作技巧',
        title: '细腻版+奇想版配合',
        content: '细腻版成文质量高但对话死板缺少感情。先用细腻版生成正文框架，再将剧情放在奇想版重新生成对话部分，对话的感情会更充沛。最后手动融合两版。',
        author: '星月大神abc'
    },
    {
        id: 4, category: '写作技巧',
        title: '思考者拆书+创意',
        content: '思考者适合拆书（消耗低）和脑洞创意生成。需要拆解对标作品时优先用思考者，因为它能推理出作者的设计意图和结构模式。',
        author: '星月官方'
    },
    {
        id: 5, category: '写作技巧',
        title: '使用角色卡防止人设崩塌',
        content: '创建角色卡（人设设定），在提示词中引用，可以防止AI写偏角色。角色卡包含：性格关键词、口头禅、行为模式、典型反应。',
        author: '星月官方'
    },
    {
        id: 6, category: '审稿',
        title: '脑洞生成器是写作老师',
        content: '脑洞生成器不仅仅是生成创意，它会把核心梗、长线期待、短线期待都解释给你听。一定要认真阅读每一段输出，从中学习爆款结构。',
        author: '星月大神丰老师'
    },
    {
        id: 7, category: '工作流',
        title: '长篇剧情崩塌救星',
        content: '长篇剧情写偏了，先做全局总结（完整的故事线回顾），让AI理解当前剧情走到哪了，再让AI基于总结做下一步推进，而不是直接续写。',
        author: '签约创作者米丢'
    },
    {
        id: 8, category: '工作流',
        title: '三阶段写作法',
        content: '第一阶段：写细纲（情节点列表）。第二阶段：用灵光和智慧两种模型各出一版正文。第三阶段：用AB融合提示词将两版融合，保留各自的亮点。',
        author: '月上'
    },
    {
        id: 9, category: '工作流',
        title: '凌沫自用流程',
        content: '先用「针对剧情内容进行冲突升级叠加」的提示词优化剧情，出正文后可直发或追问修改。再用「原稿润色，不乱加内容不扩写」进行全文润色，让正文更流畅自然。',
        author: '凌沫'
    },
    {
        id: 10, category: '模型选择',
        title: '温度设置建议',
        content: '温度最好不要超过1。稳定的质量在0.7-0.85之间。创意性内容可以用0.9-1.0。超过1.0的内容容易逻辑混乱。',
        author: '星月官方'
    },
    {
        id: 11, category: '写作技巧',
        title: '节奏感训练',
        content: '如果不理解节奏问题，通过对标书的章纲和你的大纲做对比，就能发现差距在哪。持续做这个练习，对节奏的认知会明显提升。',
        author: 'FurukawaYui'
    }
];

// GET /api/writing/ai/expert-tips — 获取专家技巧
router.get('/ai/expert-tips', (req, res) => {
    const { category } = req.query;
    let result = EXPERT_TIPS;
    if (category && category !== 'all') {
        result = EXPERT_TIPS.filter(t => t.category === category);
    }
    // Group by category
    const grouped = {};
    result.forEach(t => {
        if (!grouped[t.category]) grouped[t.category] = [];
        grouped[t.category].push(t);
    });
    res.json({ success: true, data: result, grouped });
});

// GET /api/writing/ai/variables — 获取可用变量列表（提示词模板引擎用）
router.get('/ai/variables', (req, res) => {
    res.json({
        success: true,
        variables: [
            { name: '题材', desc: '故事类型（玄幻/都市/言情/仙侠等）', example: '都市异能' },
            { name: '金手指', desc: '主角的特殊能力或外挂', example: '抽奖系统' },
            { name: '核心梗', desc: '故事的核心卖点一句话', example: '被家族抛弃后觉醒神级天赋' },
            { name: '灵感', desc: '创作灵感或主要情节方向', example: '重生到高考前' },
            { name: '人物设定', desc: '主角/配角的基本设定', example: '冷酷总裁×呆萌设计师' },
            { name: '脑洞', desc: '独特的创意设定', example: '全世界变成游戏世界' },
            { name: '世界观', desc: '故事发生的世界规则', example: '灵气复苏，人人可以修炼' },
            { name: '主角', desc: '主角姓名和基础信息', example: '林逸，普通大学生' },
            { name: '配角', desc: '配角设定', example: '校花闺蜜、富二代反派' },
            { name: '风格要求', desc: '写作风格要求', example: '节奏快，打脸爽' },
            { name: '期待感', desc: '读者期待的看点', example: '主角展现实力打脸嘲笑他的人' },
            { name: '冲突设计', desc: '核心矛盾', example: '贫富差距/阶级对立' },
            { name: '成长线', desc: '主角的成长路径', example: '从废柴到大神' },
            { name: '伏笔', desc: '需要埋伏的线索', example: '主角身世之谜' },
            { name: '情绪走向', desc: '情感基调', example: '先虐后甜' },
            { name: '节奏控制', desc: '节奏快慢', example: '前松后紧，层层递进' },
            { name: '字数限制', desc: '生成文字的字数要求', example: '1500字' },
            { name: '补充要求', desc: '其他特殊要求', example: '多用短句，少用成语' },
            { name: '故事背景', desc: '时代和地点设定', example: '2024年的上海' },
            { name: '关键道具', desc: '重要的物品或工具', example: '神秘的黑色令牌' },
            { name: '配角', desc: '其他角色', example: '神秘的导师、忠诚的伙伴' },
            { name: '情感基调', desc: '整体情感氛围', example: '热血中带着温情' },
        ]
    });
});

// ─── 数据持久化辅助 ───
const PROJ_FILE = path.join(DATA_DIR, 'projects.json');

function readJSON(file, def) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch(e) { return def; }
}
function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function getProjFile(id) { return path.join(DATA_DIR, `project-${id}.json`); }
function getChapFile(id) { return path.join(DATA_DIR, `chapters-${id}.json`); }
function getCharFile(id) { return path.join(DATA_DIR, `characters-${id}.json`); }
function getNoteFile(id) { return path.join(DATA_DIR, `notes-${id}.json`); }
function getStatsFile(id) { return path.join(DATA_DIR, `stats-${id}.json`); }

// ─── 项目管理 ───

// GET /projects — 列出所有项目
router.get('/projects', (req, res) => {
    const projects = readJSON(PROJ_FILE, []);
    const mapped = projects.map(function(p) {
        var world = readJSON(path.join(DATA_DIR, 'world-' + p.id + '.json'), {});
        var charCount = world.characters ? Object.keys(world.characters).length : 0;
        var stats = readJSON(path.join(DATA_DIR, 'stats-' + p.id + '.json'), {});
        return {
            id: p.id,
            name: p.name,
            description: p.description || p.desc || '',
            chapterCount: typeof stats.chapterCount === 'number' ? stats.chapterCount : (p.chapterCount || 0),
            wordCount: typeof stats.totalWords === 'number' ? stats.totalWords : (p.wordCount || p.words || 0),
            charCount: charCount
        };
    });
    res.json({ success: true, data: mapped });
});

// POST /project — 创建项目
router.post('/project', (req, res) => {
    const projects = readJSON(PROJ_FILE, []);
    const proj = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: req.body.name || '未命名作品',
        type: req.body.type || 'novel',
        desc: req.body.desc || '',
        description: req.body.desc || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    projects.push(proj);
    writeJSON(PROJ_FILE, projects);
    writeJSON(getChapFile(proj.id), []);
    writeJSON(getCharFile(proj.id), []);
    writeJSON(getNoteFile(proj.id), []);
    const stats = { projectId: proj.id, totalWords: 0, chapterCount: 0, streak: 0, daily: {} };
    writeJSON(getStatsFile(proj.id), stats);
    res.json({ success: true, data: proj });
});

// PUT /project/:id — 更新项目
router.put('/project/:id', (req, res) => {
    const projects = readJSON(PROJ_FILE, []);
    const idx = projects.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: '项目未找到' });
    projects[idx] = { ...projects[idx], ...req.body, updatedAt: new Date().toISOString() };
    writeJSON(PROJ_FILE, projects);
    res.json({ success: true, data: projects[idx] });
});

// DELETE /project/:id — 删除项目
router.delete('/project/:id', (req, res) => {
    const projects = readJSON(PROJ_FILE, []);
    const idx = projects.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: '项目未找到' });
    projects.splice(idx, 1);
    writeJSON(PROJ_FILE, projects);
    try { fs.unlinkSync(getChapFile(req.params.id)); } catch(e) {}
    try { fs.unlinkSync(getCharFile(req.params.id)); } catch(e) {}
    try { fs.unlinkSync(getNoteFile(req.params.id)); } catch(e) {}
    try { fs.unlinkSync(getStatsFile(req.params.id)); } catch(e) {}
    try { fs.unlinkSync(getSnapshotFile(req.params.id)); } catch(e) {}
    try { fs.unlinkSync(path.join(DATA_DIR, `world-${req.params.id}.json`)); } catch(e) {}
    try { fs.unlinkSync(path.join(DATA_DIR, `story-state-${req.params.id}.json`)); } catch(e) {}
    try { fs.unlinkSync(path.join(DATA_DIR, `plots-${req.params.id}.json`)); } catch(e) {}
    try { fs.unlinkSync(path.join(DATA_DIR, `dna-${req.params.id}.json`)); } catch(e) {}
    try { fs.unlinkSync(path.join(DATA_DIR, `outline-${req.params.id}.md`)); } catch(e) {}
});

// ─── 章节管理 ───

// GET /chapters/:projectId
router.get('/chapters/:projectId', (req, res) => {
    const chapters = readJSON(getChapFile(req.params.projectId), []);
    res.json({ success: true, data: chapters });
});

// POST /chapter
router.post('/chapter', (req, res) => {
    const { projectId, title, content, outline, order } = req.body;
    const chapters = readJSON(getChapFile(projectId), []);
    const chapter = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
        projectId,
        title: title || '新章节',
        content: content || '',
        outline: outline || '',
        order: order || chapters.length + 1,
        wordCount: (content || '').replace(/\s/g, '').length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    chapters.push(chapter);
    writeJSON(getChapFile(projectId), chapters);
    // Auto-update story state (memo)
    try { autoUpdateStory(projectId, chapter.content || '', chapter.order); } catch(e) { console.error('Story state update failed:', e.message); }
    res.json({ success: true, data: chapter });
});

// POST /chapter/:projectId (alias — reads projectId from URL param)
router.post('/chapter/:projectId', (req, res) => {
    const { title, content, outline, order } = req.body;
    const projectId = req.params.projectId;
    if (!projectId) return res.status(400).json({ success: false, error: 'projectId required' });
    const chapters = readJSON(getChapFile(projectId), []);
    const chapter = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
        projectId,
        title: title || '\u65b0\u7ae0\u8282',
        content: content || '',
        outline: outline || '',
        order: order || chapters.length + 1,
        wordCount: (content || '').replace(/\s/g, '').length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    chapters.push(chapter);
    writeJSON(getChapFile(projectId), chapters);
    try { autoUpdateStory(projectId, chapter.content || '', chapter.order); } catch(e) {}
    res.json({ success: true, data: chapter });
});

// PUT /chapter/:id
router.put('/chapter/:id', (req, res) => {
    const { projectId, content } = req.body;
    const chapters = readJSON(getChapFile(projectId), []);
    const idx = chapters.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: '章节未找到' });
    chapters[idx] = { ...chapters[idx], ...req.body, updatedAt: new Date().toISOString() };
    if (content !== undefined) chapters[idx].wordCount = content.replace(/\s/g, '').length;
    writeJSON(getChapFile(projectId), chapters);
    // Auto-update story state (memo)
    try { autoUpdateStory(projectId, chapters[idx].content || '', chapters[idx].order); } catch(e) { console.error('Story state update failed:', e.message); }
    res.json({ success: true, data: chapters[idx] });
});

// DELETE /chapter/:id — 删除章节（级联清理统计+故事状态）
router.delete('/chapter/:id', (req, res) => {
    const { projectId } = req.body;
    const chapters = readJSON(getChapFile(projectId), []);
    const idx = chapters.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: '章节未找到' });
    var deletedOrder = chapters[idx].order || (idx + 1);
    chapters.splice(idx, 1);
    writeJSON(getChapFile(projectId), chapters);
    
    // 级联1: 更新统计
    try {
        var stats = readJSON(getStatsFile(projectId), { projectId: projectId, totalWords: 0, chapterCount: 0, streak: 0, daily: {} });
        stats.chapterCount = chapters.length;
        stats.totalWords = chapters.reduce(function(sum, c) { return sum + ((c.content||'').replace(/\s/g,'').length || (c.wordCount||0)); }, 0);
        writeJSON(getStatsFile(projectId), stats);
    } catch(e) { console.error('Stats update failed:', e); }
    
    // 级联2: 清理故事状态（移除该章节提取的事实）
    try {
        var state = loadStoryState(projectId);
        var before = state.facts.length;
        state.facts = (state.facts || []).filter(function(f) { return f.chapter !== deletedOrder; });
        var removed = before - state.facts.length;
        state.state = deriveState(state.facts);
        var maxCh = 0;
        state.facts.forEach(function(f) { if (f.chapter > maxCh) maxCh = f.chapter; });
        state.lastChapterProcessed = maxCh;
        if (state.lastSummaryChapter > maxCh) state.lastSummaryChapter = maxCh;
        saveStoryState(state);
        if (removed > 0) console.log('Cleaned', removed, 'facts from deleted chapter', deletedOrder);
    } catch(e) { console.error('Story state cleanup failed:', e); }
    
    // 级联3: 清理DNA分析（移除该章节的DNA条目）
    try {
        var dnaFile = path.join(DATA_DIR, 'dna-' + projectId + '.json');
        if (fs.existsSync(dnaFile)) {
            var dnas = JSON.parse(fs.readFileSync(dnaFile, 'utf8'));
            var beforeDna = dnas.length;
            dnas = (dnas || []).filter(function(d) { return d.chapterOrder !== deletedOrder; });
            var removedDna = beforeDna - dnas.length;
            fs.writeFileSync(dnaFile, JSON.stringify(dnas, null, 2), 'utf8');
            if (removedDna > 0) console.log('Cleaned', removedDna, 'DNA entries from deleted chapter', deletedOrder);
        }
    } catch(e) { console.error('DNA cleanup failed:', e); }

    // 级联4: 同步 projects.json
    try {
        var projs = readJSON(PROJ_FILE, []);
        var pIdx = projs.findIndex(function(p) { return p.id === projectId; });
        if (pIdx >= 0) {
            projs[pIdx].chapterCount = chapters.length;
            projs[pIdx].wordCount = stats.totalWords;
            writeJSON(PROJ_FILE, projs);
        }
    } catch(e) { console.error('Project sync failed:', e); }

    res.json({ success: true });
});

// ─── 人物管理 ───

// GET /characters/:projectId
router.get('/characters/:projectId', (req, res) => {
    const characters = readJSON(getCharFile(req.params.projectId), []);
    res.json({ success: true, data: characters });
});

// POST /character
router.post('/character', (req, res) => {
    const { projectId, name, role, desc, rich } = req.body;
    const characters = readJSON(getCharFile(projectId), []);
    const character = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
        projectId,
        name: name || '未命名',
        role: role || '配角',
        desc: desc || '',
        rich: rich || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    characters.push(character);
    writeJSON(getCharFile(projectId), characters);
    res.json({ success: true, data: character });
});

// PUT /character/:id
router.put('/character/:id', (req, res) => {
    const { projectId } = req.body;
    const characters = readJSON(getCharFile(projectId), []);
    const idx = characters.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: '人物未找到' });
    characters[idx] = { ...characters[idx], ...req.body, updatedAt: new Date().toISOString() };
    writeJSON(getCharFile(projectId), characters);
    res.json({ success: true, data: characters[idx] });
});

// DELETE /character/:id
router.delete('/character/:id', (req, res) => {
    const { projectId } = req.body;
    const characters = readJSON(getCharFile(projectId), []);
    const idx = characters.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: '人物未找到' });
    characters.splice(idx, 1);
    writeJSON(getCharFile(projectId), characters);
    res.json({ success: true });
});

// ─── 笔记管理 ───

// GET /notes/:projectId
router.get('/notes/:projectId', (req, res) => {
    const notes = readJSON(getNoteFile(req.params.projectId), []);
    res.json({ success: true, data: notes });
});

// POST /note
router.post('/note', (req, res) => {
    const { projectId, title, content, category, tags } = req.body;
    const notes = readJSON(getNoteFile(projectId), []);
    const note = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
        projectId,
        title: title || '新笔记',
        content: content || '',
        category: category || '世界观',
        tags: tags || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    notes.push(note);
    writeJSON(getNoteFile(projectId), notes);
    res.json({ success: true, data: note });
});

// PUT /note/:id
router.put('/note/:id', (req, res) => {
    const { projectId } = req.body;
    const notes = readJSON(getNoteFile(projectId), []);
    const idx = notes.findIndex(n => n.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: '笔记未找到' });
    notes[idx] = { ...notes[idx], ...req.body, updatedAt: new Date().toISOString() };
    writeJSON(getNoteFile(projectId), notes);
    res.json({ success: true, data: notes[idx] });
});

// DELETE /note/:id
router.delete('/note/:id', (req, res) => {
    const { projectId } = req.body;
    const notes = readJSON(getNoteFile(projectId), []);
    const idx = notes.findIndex(n => n.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: '笔记未找到' });
    notes.splice(idx, 1);
    writeJSON(getNoteFile(projectId), notes);
    res.json({ success: true });
});

// ─── 写作统计 ───

// GET /stats/:projectId
router.get('/stats/:projectId', (req, res) => {
    const stats = readJSON(getStatsFile(req.params.projectId), { projectId: req.params.projectId, totalWords: 0, chapterCount: 0, streak: 0, daily: {} });
    const chapters = readJSON(getChapFile(req.params.projectId), []);
    stats.chapterCount = chapters.length;
    stats.totalWords = chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);
    writeJSON(getStatsFile(req.params.projectId), stats);
    res.json({ success: true, data: stats });
});

// ═══════════════════════════════════════════════
// 1. 章节快照（版本历史）
// ─── 大纲管理 ───

// GET /outline/:projectId
router.get('/outline/:projectId', (req, res) => {
    const outlineFile = path.join(DATA_DIR, 'outline-' + req.params.projectId + '.md');
    try {
        if (fs.existsSync(outlineFile)) {
            const content = fs.readFileSync(outlineFile, 'utf8');
            return res.json({ success: true, data: { content } });
        }
    } catch(e) {}
    res.json({ success: true, data: { content: '' } });
});

// POST /outline/:projectId — 保存大纲
router.post('/outline/:projectId', (req, res) => {
    const outlineFile = path.join(DATA_DIR, 'outline-' + req.params.projectId + '.md');
    try {
        fs.writeFileSync(outlineFile, req.body.content || '', 'utf8');
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ═══════════════════════════════════════════════

function getSnapshotFile(projectId) {
    return path.join(DATA_DIR, `snapshots-${projectId}.json`);
}

// POST /api/writing/snapshot/:chapterId — 创建快照
router.post('/snapshot/:chapterId', (req, res) => {
    const { projectId, title, content } = req.body;
    const chapterId = req.params.chapterId;
    if (!projectId || !chapterId) return res.status(400).json({ success: false, error: 'projectId and chapterId required' });
    
    const snapshots = readJSON(getSnapshotFile(projectId), []);
    const chapterSnapshots = snapshots.filter(s => s.chapterId === req.params.chapterId);
    const version = chapterSnapshots.length + 1;
    
    const snapshot = {
        snapshotId: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        chapterId: req.params.chapterId,
        projectId,
        version,
        title: title || '无标题',
        content: content || '',
        timestamp: new Date().toISOString(),
        wordCount: (content || '').replace(/\s/g, '').length
    };
    
    snapshots.push(snapshot);
    writeJSON(getSnapshotFile(projectId), snapshots);
    res.json({ success: true, data: snapshot });
});


// GET /snapshot/:snapshotId — 读取单个快照内容
router.get('/snapshot/:snapshotId', (req, res) => {
    try {
        const projects = readJSON(PROJ_FILE, []);
        for (const proj of projects) {
            const snapshots = readJSON(getSnapshotFile(proj.id), []);
            const s = snapshots.find(snap => snap.snapshotId === req.params.snapshotId);
            if (s) return res.json({ success: true, data: s });
        }
        res.status(404).json({ success: false, error: '快照未找到' });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});
// GET /api/writing/snapshots/:chapterId — 列出章节快照
router.get('/snapshots/:chapterId', (req, res) => {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ success: false, error: 'projectId query param required' });
    
    const snapshots = readJSON(getSnapshotFile(projectId), []);
    const chapterSnapshots = snapshots
        .filter(s => s.chapterId === req.params.chapterId)
        .sort((a, b) => b.version - a.version);
    
    res.json({ success: true, data: chapterSnapshots });
});

// POST /api/writing/snapshot/:snapshotId/restore — 还原快照
router.post('/snapshot/:snapshotId/restore', (req, res) => {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ success: false, error: 'projectId required' });
    
    const snapshots = readJSON(getSnapshotFile(projectId), []);
    const snapshot = snapshots.find(s => s.snapshotId === req.params.snapshotId);
    if (!snapshot) return res.status(404).json({ success: false, error: '快照未找到' });
    
    // Update the chapter with snapshot content
    const chapters = readJSON(getChapFile(projectId), []);
    const idx = chapters.findIndex(c => c.id === snapshot.chapterId);
    if (idx === -1) return res.status(404).json({ success: false, error: '章节未找到' });
    
    chapters[idx].title = snapshot.title;
    chapters[idx].content = snapshot.content;
    chapters[idx].wordCount = snapshot.wordCount;
    chapters[idx].updatedAt = new Date().toISOString();
    writeJSON(getChapFile(projectId), chapters);
    
    res.json({ success: true, data: { chapter: chapters[idx], snapshot } });
});

// DELETE /api/writing/snapshot/:snapshotId — 删除快照
router.delete('/snapshot/:snapshotId', (req, res) => {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ success: false, error: 'projectId required' });
    
    const snapshots = readJSON(getSnapshotFile(projectId), []);
    const idx = snapshots.findIndex(s => s.snapshotId === req.params.snapshotId);
    if (idx === -1) return res.status(404).json({ success: false, error: '快照未找到' });
    
    snapshots.splice(idx, 1);
    writeJSON(getSnapshotFile(projectId), snapshots);
    res.json({ success: true });
});

// ═══════════════════════════════════════════════
// 2. AI Beta Reader（一致性检查）
// ═══════════════════════════════════════════════

// POST /api/writing/beta-read — 分析章节一致性
router.post('/beta-read', async (req, res) => {
    const { projectId, content } = req.body;
    if (!content) return res.status(400).json({ success: false, error: 'content required' });
    
    const warnings = [];
    
    // 检查1：角色名匹配（如果提供了projectId）
    if (projectId) {
        const characters = readJSON(getCharFile(projectId), []);
        if (characters.length > 0) {
            const charNames = characters.map(c => c.name);
            // 检查角色名是否在内容中出现
            const extraNames = [];
            // 中文角色名检测：找所有出现的人名
            for (const c of characters) {
                const escapedName = c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const re = new RegExp(escapedName, 'g');
                let count = 0;
                let match;
                while ((match = re.exec(content)) !== null) count++;
                if (count > 0) {
                    // Check if this character is referenced properly
                    // (already OK, they appear in the text)
                }
            }
        }
    }
    
    // 检查2：重复短语（相同词出现3次以上）
    // 提取所有中文字符（2字及以上），统计频率
    const wordFrequency = {};
    // 正则匹配中文字符串（2-8个字符）
    const cnWordRegex = /[\u4e00-\u9fff]{2,8}/g;
    let match;
    const allMatches = [];
    while ((match = cnWordRegex.exec(content)) !== null) {
        allMatches.push({ word: match[0], index: match.index });
    }
    
    // Count frequency of each phrase (3+ char)}
    for (const { word, index } of allMatches) {
        if (word.length >= 3) {
            if (!wordFrequency[word]) wordFrequency[word] = [];
            wordFrequency[word].push(index);
        }
    }
    
    // Check for overly repeated phrases (5+ times) — limit to top 3
    const stopWords = ['但是', '然而', '突然', '不过', '虽然', '因为', '所以', '如果', '可以', '没有', '什么', '一个', '这个', '那个', '他们', '我们', '你们', '自己', '知道', '感觉', '看着', '说着', '想着', '就是', '不是', '还是', '或者', '而且', '并且', '然后', '最后', '开始', '已经', '起来', '出来', '过来', '进去', '下去'];
    const repeatedWarnings = [];
    for (const [word, positions] of Object.entries(wordFrequency)) {
        if (positions.length >= 5 && !stopWords.includes(word)) {
            repeatedWarnings.push({
                type: 'repeated_phrase',
                detail: `"${word}" 出现了 ${positions.length} 次（${positions.slice(0, 3).map(p => Math.floor(p / 100) + 1).join('、')}句附近），建议替换部分表达`,
                position: positions[0],
                count: positions.length
            });
        }
    }
    repeatedWarnings.sort((a, b) => b.count - a.count);
    warnings.push(...repeatedWarnings.slice(0, 3));
    
    // 检查3：时间线一致性（日期/时间引用）
    const timePatterns = [
        /(星期[一二三四五六日天])/g,
        /(\d{4})年(\d{1,2})月(\d{1,2})日/g,
        /(\d{1,2})月(\d{1,2})日/g,
        /(上午|下午|早上|晚上|中午|傍晚|清晨|深夜)(\d{1,2})[：:]?(\d{2})/g,
        /(\d{1,2})[：:](\d{2})/g,
        /(昨天|今天|明天|后天|前天)/g,
        /([昨今明后前]天)(上午|下午|晚上|早上|中午)/g
    ];
    
    const timeRefs = [];
    for (const pattern of timePatterns) {
        let m;
        while ((m = pattern.exec(content)) !== null) {
            timeRefs.push({ text: m[0], index: m.index });
        }
    }
    
    // 检查同一个时间词出现多次表示时间跳跃
    const timeWords = timeRefs.map(t => t.text);
    // Check for transitions like "第二天" appearing multiple times
    const dayTransitions = content.match(/(第[一二三四五六七八九十百]+天|第二天|第三天)/g);
    if (dayTransitions && dayTransitions.length > 3) {
        warnings.push({
            type: 'timeline_skip',
            detail: `过多的时间跳跃词（${dayTransitions.length}处），注意时间线连贯性`,
            position: content.indexOf(dayTransitions[0])
        });
    }
    
    // 检查4：矛盾陈述
    const contradictionPairs = [
        { patterns: [/已经毕业/, /回到教室|还在上学|上课铃/], name: '毕业·上学矛盾' },
        { patterns: [/已经死了|已经去世/, /复活|还活着/], name: '死亡·活着矛盾' },
        { patterns: [/晴天|阳光明媚/, /乌云密布|下着大雨|倾盆大雨/], name: '天气矛盾' },
        { patterns: [/关上门|关上了门|把门关上/, /推门而入|推开门|打开门/], name: '门状态矛盾' },
        { patterns: [/不会说话|沉默寡言|一言不发|哑巴/, /开口说道|回答道|张了张嘴/], name: '沉默·说话矛盾' }
    ];
    
    for (const pair of contradictionPairs) {
        const first = pair.patterns[0];
        const second = pair.patterns[1];
        const firstMatch = content.match(first);
        const secondMatch = content.match(second);
        if (firstMatch && secondMatch) {
            warnings.push({
                type: 'contradiction',
                detail: `可能存在矛盾：${pair.name}——"${firstMatch[0]}" 和 "${secondMatch[0]}" 同时出现`,
                position: Math.min(firstMatch.index, secondMatch.index)
            });
        }
    }
    
    // 检查5："已经"开头表示过去时的段落和"现在"开头的段落在同一段落
    const paragraphs = content.split(/\n\s*\n/);
    for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i];
        if (para.length < 10) continue;
        // Check for time contradictions within same paragraph
        const pastIndicators = (para.match(/已经|曾经|过去|之前|刚才/g) || []).length;
        const presentIndicators = (para.match(/现在|此时|此刻|这时/g) || []).length;
        if (pastIndicators >= 2 && presentIndicators >= 2) {
            warnings.push({
                type: 'time_confusion',
                detail: `第 ${i + 1} 段同时出现过多过去时（${pastIndicators}处）和现在时（${presentIndicators}处）标识，可能存在时间混淆`,
                position: paragraphs.slice(0, i).join('\n\n').length
            });
        }
    }
    
    // 限制最多10个警告
    const limited = warnings.slice(0, 10);
    
    res.json({ success: true, data: { warnings: limited, total: limited.length } });
});

// POST /api/writing/beta-read/deep — AI深度语义检查
router.post('/beta-read/deep', async (req, res) => {
    const { projectId, content } = req.body;
    if (!content) return res.status(400).json({ success: false, error: 'content required' });
    
    try {
        const prompt = '你是一个专业的小说Beta读编辑。请分析以下章节内容，找出可能的逻辑矛盾、情节漏洞、角色行为不一致、时间线错误等问题。\n\n要求：\n1. 只列出确实存在的问题，不要编造\n2. 简洁，每条问题用一句话描述\n3. 标注问题所在的大致位置（第几句或场景）\n4. 格式：每行一个「问题类型: 描述」\n\n章节内容：\n' + content;

        const wc = config.getWritingConfig();
        const response = await fetch(wc.api, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + wc.apiKey },
            body: JSON.stringify({
                model: wc.model,
                messages: [
                    { role: 'system', content: '你是一个专业的小说内容审稿人，擅长发现小说中的逻辑问题和剧情漏洞。直接给出问题列表，不要额外解释。' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 1024
            })
        });
        
        const data = await response.json();
        const result = data.choices?.[0]?.message?.content || '分析失败';
        
        // Track token usage
        const usage = data.usage || {};
        readJSON(path.join(DATA_DIR, 'deepseek-usage.json'), []);
        
        res.json({ success: true, data: { analysis: result, usage: usage } });
    } catch(e) {
        res.json({ success: false, error: 'AI检查失败: ' + e.message });
    }
});

// ═══════════════════════════════════════════════
// 3. Ollama 离线模式
// ═══════════════════════════════════════════════

const OLLAMA_BASE = 'http://localhost:11434';

// GET /api/writing/ollama/status — 检查ollama是否可用
router.get('/ollama/status', async (req, res) => {
    try {
        // Try to detect if Ollama is installed (existence check)
        let installed = false;
        try {
            const { execSync } = require('child_process');
            const result = execSync('where ollama 2>nul || echo not_found', { encoding: 'utf8', timeout: 3000 });
            installed = !result.includes('not_found') && result.trim().length > 0 && !result.includes('Could not find');
        } catch {}

        const response = await fetch(`${OLLAMA_BASE}/api/tags`, {
            signal: AbortSignal.timeout(3000)
        });
        if (!response.ok) {
            return res.json({ success: true, data: { available: false, installed, error: 'ollama响应异常' } });
        }
        const data = await response.json();
        const models = (data.models || []).map(m => m.name);
        // Prefer deepseek-based models
        const deepseekModel = models.find(m => m.toLowerCase().includes('deepseek'));
        // Also look for qwen, llama, etc.
        const preferredOrder = ['deepseek', 'qwen', 'yi', 'gemma', 'llama', 'mistral'];
        let recommended = deepseekModel || null;
        if (!recommended) {
            for (const prefix of preferredOrder) {
                const found = models.find(m => m.toLowerCase().includes(prefix));
                if (found) { recommended = found; break; }
            }
        }
        if (!recommended && models.length > 0) {
            recommended = models[0];
        }
        
        res.json({
            success: true,
            data: {
                available: true,
                installed: true,
                models,
                recommended,
                count: models.length
            }
        });
    } catch (e) {
        res.json({ success: true, data: { available: false, installed: true, error: e.message } });
    }
});

// POST /api/writing/ollama/start — 启动Ollama服务
router.post('/ollama/start', async (req, res) => {
    try {
        const { execSync, spawn } = require('child_process');
        // Check if already running
        try {
            const check = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
            if (check.ok) {
                return res.json({ success: true, data: { started: true, message: 'Ollama已在运行' } });
            }
        } catch {}
        // Try to start Ollama
        spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' });
        res.json({ success: true, data: { started: true, message: 'Ollama启动命令已发送' } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/writing/ollama/generate — 调用ollama生成
router.post('/ollama/generate', async (req, res) => {
    const { model, systemMsg, userMsg, temperature, maxTokens } = req.body;
    if (!model || !userMsg) return res.status(400).json({ success: false, error: 'model and userMsg required' });
    
    try {
        const messages = [];
        if (systemMsg) messages.push({ role: 'system', content: systemMsg });
        messages.push({ role: 'user', content: userMsg });
        
        const body = {
            model,
            messages,
            stream: false,
            options: {
                temperature: temperature || 0.7,
                num_predict: maxTokens || 4096
            }
        };
        
        const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(120000)
        });
        
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Ollama API ${response.status}: ${errText.substring(0, 200)}`);
        }
        
        const data = await response.json();
        const content = data.message?.content || '';
        
        res.json({
            success: true,
            data: {
                content,
                model,
                done: data.done,
                totalDuration: data.total_duration
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ═══════════════════════════════════════════════
// 4. 灵感捕获
// ═══════════════════════════════════════════════

const INSPIRATION_FILE = path.join(DATA_DIR, 'inspirations.json');

// GET /api/writing/inspirations — 获取所有灵感
router.get('/inspirations', (req, res) => {
    const inspirations = readJSON(INSPIRATION_FILE, []);
    // Sort by timestamp descending
    inspirations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    // Optional projectId filter
    const { projectId } = req.query;
    const filtered = projectId ? inspirations.filter(i => i.projectId === projectId) : inspirations;
    res.json({ success: true, data: filtered });
});

// POST /api/writing/inspiration — 保存灵感
router.post('/inspiration', (req, res) => {
    const { projectId, content, source, tags } = req.body;
    if (!content) return res.status(400).json({ success: false, error: 'content required' });
    
    const inspirations = readJSON(INSPIRATION_FILE, []);
    const inspiration = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        projectId: projectId || null,
        content,
        source: source || 'manual',
        tags: tags || [],
        timestamp: new Date().toISOString()
    };
    inspirations.push(inspiration);
    writeJSON(INSPIRATION_FILE, inspirations);
    res.json({ success: true, data: inspiration });
});

// DELETE /api/writing/inspiration/:id — 删除灵感
router.delete('/inspiration/:id', (req, res) => {
    const inspirations = readJSON(INSPIRATION_FILE, []);
    const idx = inspirations.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: '灵感未找到' });
    inspirations.splice(idx, 1);
    writeJSON(INSPIRATION_FILE, inspirations);
    res.json({ success: true });
});

// ═══════════════════════════════════════════════
// 创意工具箱历史记录
// ═══════════════════════════════════════════════

const TOOLBOX_HISTORY_FILE = path.join(DATA_DIR, 'toolbox-history.json');

// GET /api/writing/toolbox-history — 获取历史
router.get('/toolbox-history', (req, res) => {
    const { projectId, type } = req.query;
    const all = readJSON(TOOLBOX_HISTORY_FILE, {});
    let records = [];
    if (projectId && all[projectId]) {
        records = all[projectId];
    } else {
        for (const pid of Object.keys(all)) {
            records = records.concat(all[pid].map(r => ({ ...r, projectId: pid })));
        }
    }
    if (type) records = records.filter(r => r.type === type);
    records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json({ success: true, data: records.slice(0, 200) });
});

// POST /api/writing/toolbox-history — 保存历史
router.post('/toolbox-history', (req, res) => {
    const { projectId, type, input, output, title } = req.body;
    if (!type || !output) return res.status(400).json({ success: false, error: 'type and output required' });
    
    const all = readJSON(TOOLBOX_HISTORY_FILE, {});
    const pid = projectId || '_global';
    if (!all[pid]) all[pid] = [];
    
    all[pid].push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        type,
        input: input || '',
        output,
        title: title || type,
        timestamp: new Date().toISOString(),
        favorite: false
    });
    
    // 只保留最近500条每个项目
    if (all[pid].length > 500) all[pid] = all[pid].slice(-500);
    
    writeJSON(TOOLBOX_HISTORY_FILE, all);
    res.json({ success: true });
});

// DELETE /api/writing/toolbox-history/:id — 删除单条历史
router.delete('/toolbox-history/:id', (req, res) => {
    const all = readJSON(TOOLBOX_HISTORY_FILE, {});
    let deleted = false;
    for (const pid of Object.keys(all)) {
        const idx = all[pid].findIndex(r => r.id === req.params.id);
        if (idx !== -1) {
            all[pid].splice(idx, 1);
            deleted = true;
            break;
        }
    }
    if (!deleted) return res.status(404).json({ success: false, error: 'record not found' });
    writeJSON(TOOLBOX_HISTORY_FILE, all);
    res.json({ success: true });
});

// DELETE /api/writing/toolbox-history — 清空整个项目历史
router.delete('/toolbox-history/all', (req, res) => {
    const { projectId } = req.body;
    const all = readJSON(TOOLBOX_HISTORY_FILE, {});
    if (projectId) {
        delete all[projectId];
    } else {
        // 清空全部
        writeJSON(TOOLBOX_HISTORY_FILE, {});
        return res.json({ success: true });
    }
    writeJSON(TOOLBOX_HISTORY_FILE, all);
    res.json({ success: true });
});

// GET /api/writing/balance — 检查DeepSeek API余额
router.get('/balance', async (req, res) => {
    try {
        const wc = config.getWritingConfig();
        const response = await fetch(wc.balanceApi, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + wc.apiKey }
        });
        if (!response.ok) {
            // 如果API返回错误（比如key失效），返回余额0
            return res.json({ success: true, data: { total_balance: '0', has_balance: false } });
        }
        const data = await response.json();
        // DeepSeek 新版API返回格式: { balance_infos: [{ total_balance: "3.91" }] }
        let balance = 0;
        if (data.balance_infos && data.balance_infos[0] && data.balance_infos[0].total_balance) {
            balance = parseFloat(data.balance_infos[0].total_balance);
        } else {
            balance = parseFloat(data.balance_available || data.total_balance || '0');
        }
        res.json({ success: true, data: { total_balance: String(balance), has_balance: balance > 0 } });
    } catch(e) {
        res.json({ success: true, data: { total_balance: '0', has_balance: false, error: e.message } });
    }
});

// ═══════════════════════════════════════════════════════
// 批量章节操作
// ═══════════════════════════════════════════════════════


// GET /chapter/:id — 读取单个章节
router.get('/chapter/:id', (req, res) => {
    try {
        const projects = readJSON(PROJ_FILE, []);
        // We need to search all project chapter files for this chapter ID
        for (const proj of projects) {
            const chapters = readJSON(getChapFile(proj.id), []);
            const ch = chapters.find(c => c.id === req.params.id);
            if (ch) return res.json({ success: true, data: ch });
        }
        res.status(404).json({ success: false, error: '章节未找到' });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});
// POST /chapters/batch-move — 批量转移章节到目标项目
router.post('/chapters/batch-move', (req, res) => {
    const { chapterIds, fromProjectId, toProjectId } = req.body;
    if (!chapterIds || !chapterIds.length || !fromProjectId || !toProjectId) {
        return res.status(400).json({ success: false, error: '缺少参数：chapterIds/fromProjectId/toProjectId' });
    }
    
    const fromChapters = readJSON(getChapFile(fromProjectId), []);
    const toChapters = readJSON(getChapFile(toProjectId), []);
    
    const moving = fromChapters.filter(c => chapterIds.includes(c.id));
    if (!moving.length) {
        return res.json({ success: false, error: '未找到指定章节' });
    }
    
    // 从源项目移除
    const remaining = fromChapters.filter(c => !chapterIds.includes(c.id));
    
    // 计算目标项目当前最大章节号
    const maxOrder = toChapters.length > 0 ? Math.max(...toChapters.map(c => c.order || 0)) : 0;
    
    // 追加到目标项目（调整order）
    moving.forEach((c, i) => {
        c.order = maxOrder + i + 1;
        c.projectId = toProjectId;
    });
    toChapters.push(...moving);
    
    writeJSON(getChapFile(fromProjectId), remaining);
    writeJSON(getChapFile(toProjectId), toChapters);
    
    // 更新元数据
    try {
        const projects = readJSON(PROJ_FILE, []);
        const fpIdx = projects.findIndex(p => p.id === fromProjectId);
        const tpIdx = projects.findIndex(p => p.id === toProjectId);
        if (fpIdx >= 0) {
            projects[fpIdx].chapterCount = remaining.length;
            projects[fpIdx].updatedAt = new Date().toISOString();
        }
        if (tpIdx >= 0) {
            projects[tpIdx].chapterCount = (projects[tpIdx]?.chapterCount || 0) + moving.length;
            projects[tpIdx].updatedAt = new Date().toISOString();
        }
        writeJSON(PROJ_FILE, projects);
    } catch(e) {}
    
    res.json({ success: true, moved: moving.length, fromRemaining: remaining.length });
});

// POST /chapters/batch-to-new — 批量创建新项目并移入章节
router.post('/chapters/batch-to-new', (req, res) => {
    const { chapterIds, fromProjectId, newProjectName } = req.body;
    if (!chapterIds || !chapterIds.length || !fromProjectId) {
        return res.status(400).json({ success: false, error: '缺少参数：chapterIds/fromProjectId' });
    }
    
    // 创建新项目
    const projects = readJSON(PROJ_FILE, []);
    const newProj = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: newProjectName || '转移作品',
        type: 'novel',
        desc: '',
        description: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    projects.push(newProj);
    writeJSON(PROJ_FILE, projects);
    
    // 初始化目标文件
    writeJSON(getChapFile(newProj.id), []);
    writeJSON(getCharFile(newProj.id), []);
    writeJSON(getNoteFile(newProj.id), []);
    const stats = { projectId: newProj.id, totalWords: 0, chapterCount: 0, streak: 0, daily: {} };
    writeJSON(getStatsFile(newProj.id), stats);
    
    // 转移章节——复用 batch-move 逻辑
    const fromChaps = readJSON(getChapFile(fromProjectId), []);
    const toChaps = [];
    const moving = fromChaps.filter(c => chapterIds.includes(c.id));
    const remaining = fromChaps.filter(c => !chapterIds.includes(c.id));
    moving.forEach((c, i) => {
        c.order = i + 1;
        c.projectId = newProj.id;
    });
    toChaps.push(...moving);
    writeJSON(getChapFile(fromProjectId), remaining);
    writeJSON(getChapFile(newProj.id), toChaps);
    
    // 更新源项目元数据
    try {
        const projIdx = projects.findIndex(p => p.id === fromProjectId);
        if (projIdx >= 0) {
            projects[projIdx].chapterCount = remaining.length;
            projects[projIdx].updatedAt = new Date().toISOString();
        }
        writeJSON(PROJ_FILE, projects);
    } catch(e) {}
    
    res.json({ success: true, moved: moving.length, newProject: newProj });
})

// POST /chapters/batch-delete — 批量删除章节
router.post('/chapters/batch-delete', (req, res) => {
    const { chapterIds, projectId } = req.body;
    if (!chapterIds || !chapterIds.length || !projectId) {
        return res.status(400).json({ success: false, error: '缺少参数：chapterIds/projectId' });
    }
    
    const chapters = readJSON(getChapFile(projectId), []);
    const deletedCount = chapterIds.length;
    const remaining = chapters.filter(c => !chapterIds.includes(c.id));
    writeJSON(getChapFile(projectId), remaining);
    
    // 更新元数据
    try {
        const projects = readJSON(PROJ_FILE, []);
        const pIdx = projects.findIndex(p => p.id === projectId);
        if (pIdx >= 0) {
            projects[pIdx].chapterCount = remaining.length;
            projects[pIdx].updatedAt = new Date().toISOString();
        }
        writeJSON(PROJ_FILE, projects);
    } catch(e) {
        console.error('批量删除更新元数据失败:', e.message);
    }
    
    // 更新stats
    try {
        const statsPath = getStatsFile(projectId);
        const stats = readJSON(statsPath, {});
        stats.chapterCount = remaining.length;
        stats.totalWordCount = remaining.reduce(function(sum, c) { return sum + (c.content || '').replace(/\s/g,'').length; }, 0);
        stats.updatedAt = new Date().toISOString();
        writeJSON(statsPath, stats);
    } catch(e) {
        console.error('批量删除更新统计失败:', e.message);
    }
    
    res.json({ success: true, deleted: deletedCount, remaining: remaining.length });
});

module.exports = router;

module.exports = router;
