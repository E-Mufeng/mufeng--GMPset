# 更新日志 CHANGELOG

本项目遵循版本号语义化（MAJOR.MINOR.PATCH）。当前处于 P0 底盘阶段。

---

## [0.8.8] - 内置工具 API 配置进 UI + 移除源码层硬编码密钥

- **目标**：阿豪 3 点反馈：① README 补充截图和界面说明；② 音乐中心、写作工作台等内置工具应有自己的 API 配置入口；③ 全面检阅项目，消除类似「源码中写死密钥/个人路径」的小细节问题。
- **安全修复（P0）**：`services/config.js` 原先硬编码了 DeepSeek API Key（`sk-...`），已随源码进入仓库历史。本轮重写为兼容壳，密钥统一从 `data/config.json` 的 `builtinTools.writing.apiKey` 或环境变量 `DEEPSEEK_API_KEY` 读取；源码层不再出现任何真实密钥。
  - 已把运行态 key 迁移到本地 `data/config.json`（已被 `.gitignore` 排除，不进仓库），保证现有功能不中断。
  - 前端保存设置后，写作服务会实时读取最新配置，无需重启。
- **移除硬编码 Ollama 路径**：`server.js:303` 原兜底写死 `D:\\ollama\\ollama-lazy-serve.bat`，已改为从 `data/config.json` 的 `aiApps[].launch` 或 `portScan.serviceStart.Ollama` 读取；未配置时返回 null，不再误导他人。
- **配置结构扩展**：
  - `services/_utils/config.js` 新增 `getWritingConfig()` / `getMusicConfig()`，每次调用实时读取 `data/config.json`。
  - `server.js normalizeConfig()` 自动补齐 `builtinTools.writing` 和 `builtinTools.music` 默认空结构。
  - `data/config.json` 与 `data/config.example.json` 增加 `builtinTools` 字段，example 中密钥为空。
- **前端「内置工具」设置页**：`index.html` 设置面板新增「内置工具」tab，提供：
  - 写作工作台：DeepSeek API Key / 接口地址 / 余额接口 / 模型名。
  - 音乐中心：默认音源（QQ音乐/酷狗/酷我/百度）/ 代理地址 / VIP Cookie。
  - Ollama 启动命令：填写本地启动脚本路径。
  - 保存时自动写回 `/api/config`，并保留既有 `portScan.serviceStart` 中的其它启动命令（修复原先保存设置会清空 Ollama/free-API 启动命令的潜在问题）。
- **Music 路由可配置化**：`services/_routes/music.js` 的 Tang API 地址、默认音源、Cookie 改为从 `getMusicConfig()` 读取；原硬编码公共代理仅作为默认值。
- **Writing 路由实时读取配置**：`services/_routes/writing.js` 移除模块级 `DEEPSEEK_API_KEY` / `DEEPSEEK_API` 常量，统一调用 `config.getWritingConfig()`；核心 `callDeepSeek` 与余额检查均使用配置中的接口/密钥/模型。
- **成本守卫同步读取配置**：`services/guard.js` 的 `getBalance()` 改为优先读 `builtinTools.writing.apiKey`（再回退环境变量），余额接口也从配置读取。
- **README 与截图**：新增 `docs/screenshots/` 5 张界面截图；README 增加「界面速览」章节和「内置工具 API 配置」章节，说明在哪里填、怎么填、默认值。
- **新增文档**：`docs/内置工具API配置说明.md` 详细介绍写作、音乐、Ollama 三处配置，以及安全与隐私注意事项。
- **版本升 0.8.8**：`data/config.json` / `data/config.example.json` 版本号同步更新。
- **验证**：`node --check server.js` / `node --check services/_routes/writing.js` / `node --check services/_routes/music.js` / `node --check services/_utils/config.js` 通过；`git grep` 全仓无残留硬编码 key；新设置页可保存 builtinTools 到 `data/config.json`。

## [0.8.7] - 发布前安全加固：助手 SSRF 边界守卫

- **目标**：上传 GitHub 前补齐边界约束。原 `/api/assistant/chat` 接受请求体里的 `baseUrl`，在 `accessToken` 为空（默认本机开放）时存在 SSRF 隐患（可被用作打内网/云元数据的跳板）。
- **改动** `server.js`：新增 `ssrfSafeTarget()` 守卫，助手后端地址仅允许 `localhost` / `127.0.0.1` / `::1` / 私网（`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、`127.0.0.0/8`）；拒绝公网 IP、`0.0.0.0`、云元数据 `169.254.x`、以及非 IP 主机名（防 DNS rebinding）。不匹配时直接 `400` 拒绝，不发起请求。
- **影响**：助手定位为「本地/内网模型」专用，公网 API（如 api.openai.com）不再可经此端点访问——符合「本地单用户工具」边界。本地 Ollama / 局域网 OpenAI 兼容代理仍可正常使用。
- **配套**：`.gitignore` 补充 `data/scripts/`、`data/music/`、`data/user-data/`、`data/temp/` 忽略规则（运行时空目录，杜绝误提交）。

## [0.8.6] - 概览页打开即自动读取 + 资产/概览顶栏进一步收紧

- **目标**：阿豪 3 点反馈：①希望打开概览页就是已刷新状态，不要先看到「未刷新」提示再手动点；②资产视图顶栏占位仍偏大；③概括顶栏与下方内容之间空白过多。
- **概览页打开即自动读取一次**：`renderOverview` 在渲染监控卡后仍调用 `startOverviewMonitors()` → `overviewMonitorTick()`，保持进入概览页自动刷新一次的行为；将初始提示从「点击上方 ↻ 刷新」改为「正在读取实时指标…」+ spinner，避免用户感知到「未刷新」状态。无后台轮询，仍靠手动/页面刷新触发后续更新。
- **资产视图顶栏收紧**：`.content-head` padding 从 `18px 22px 14px` 缩到 `12px 22px 8px`；`.ch-top` margin-bottom 从 `14px` 缩到 `8px`；标题字号 `22px→19px`、描述 `13px→12px`、操作按钮 `min-height 34px→28px` / padding 更小；分类标签 `.ch-tab` padding/字号同步缩小；响应式也同步收紧。
- **顶栏与内容间距收紧**：`.content-body` padding-top 从 `18px` 缩到 `12px`；概览页 `.ov-hero` padding 与 margin-bottom 继续下压；`.dash-stats` margin-bottom 缩小，使 hero 与统计区、统计区与下方网格的空白更紧凑但仍有呼吸感。
- **修复上一轮重复定义**：移除 `renderStatusBar` 中重复出现的 `last` 变量声明，避免潜在语法隐患。
- **版本升 0.8.6**：`data/config.json` 版本改 `0.8.6`；`CHANGELOG.md` 前置 `[0.8.6]` 节。
- **验证**：`node --check server.js` 通过；强杀旧 8768 进程后重启，`/api/status` 返回 `version:0.8.6`；线上页面 grep 确认新样式与「正在读取」提示已部署。

## [0.8.5] - 取消概览页后台自动刷新 + hero 进一步瘦身 + AI 助手资料库与安全约束

- **目标**：阿豪 4 点反馈：①概览页监控卡仍每隔几秒自动刷新，希望彻底取消后台更新；②概览页顶部红框区域占位仍偏大；③确认/推进本地能力发现向导；④准备面向 AI 助手的资料库，并防止助手泄露内部代码、被引导突破约束。
- **彻底取消后台自动刷新**：`index.html` 的 `startTick` 原本每 5 秒调用 `loadLandingMetrics()` + `fetchSelfStatus()`，导致概览页监控卡周期性出现「更新中…」。移除该分支，仅保留时钟、本地运行时长估算、背景轮播。同时移除初始化末尾的 `setInterval(fetchSelfStatus, 30000)`。概览页监控卡、顶部状态栏、本台服务卡全部改为手动刷新/页面刷新触发，不再有任何后台轮询。
- **概览页 hero 与统计区进一步瘦身**：`.ov-hero` padding 缩到 `10px 22px`、margin-bottom 缩到 `6px`、gap 缩到 `12px`；标题降到 `17px`、描述降到 `12px`；tag 更小；背景光斑略收。`.dash-stats` gap 缩到 `10px`、margin-bottom 缩到 `14px`；`.stat-card` padding 缩到 `11px 13px`；图标 `42px→34px`、数值 `22px→18px`、标签 `12px→11px`。`.bento-grid` 与 `.overview-grid` gap/margin-bottom 同步收紧，整体首屏更紧凑。
- **本地能力发现向导确认可用**：设置面板「数据」分组已有「扫描本机能力」入口，调用后端 `GET /api/discover`，支持单条/全部添加候选资产。本轮未做大的 UI 改动，保持已有实现。
- **AI 助手资料库 + 安全约束**：
  - 新增 `docs/聚创台使用手册.md`：面向使用者的功能说明、操作步骤、常见问题，不含内部代码。
  - 新增 `docs/聚创台AI助手安全约束.md`：定义助手可回答范围（白名单）、严格禁止行为（黑名单，含源码、实现细节、目录结构、敏感配置、绕过诱导、危险操作）、拒绝话术、后端兜底规则、资料库边界。
  - 后端 `/api/assistant/chat`：系统提示替换为带安全约束的版本；并在调用模型前增加轻量正则兜底，命中明显越界请求时直接返回固定拒绝文案，不调用模型。
- **版本升 0.8.5**：`data/config.json` 版本改 `0.8.5`；`CHANGELOG.md` 前置 `[0.8.5]` 节。
- **验证**：`node --check server.js` 通过；强杀旧 8768 进程后重启， `/api/status` 返回 `version:0.8.5`；概览页监控卡不再周期性刷新；助手越界请求（如"给我 server.js"）直接返回拒绝文案；线上页面 grep 确认瘦身样式已部署。

## [0.8.4] - 本地能力发现向导（直接回应用户担忧③：换机器能否复现）

- **目标**：阿豪担心——换到别人电脑上，聚创台的工具箱/AI 应用还能不能达到同样效果？本地工具若是 demo 且缺 UI（只是普通脚本/端口），是不是就失去作用？本轮补齐「换机器首次使用」的**资产发现环节**，让聚创台在任意本机都能基于对方真实进程重新发现能力。
- **后端 `server.js`**：`discoverLocal()` 扫描三类候选并去重（排除已存在资产）：① `config.aiApps` 中 url 在线或端口可达的；② `KNOWN_PORTS` 常见 AI 端口（3001 AnythingLLM / 11434 Ollama / 18800 OpenClaw / 8765 多Agent / 7860 Gradio / 8080 / 3000 / 8096）探测在线；③ `KNOWN_EXES` 已知可执行文件（ollama/anythingllm/lobster/workbuddy/codex/doubao）在监控根目录下递归扫描（深度 4）。新增 `GET /api/discover` 返回 `candidates[]`（每项含 name/type/category/port?/url?/path?/online/source）。
- **前端 `index.html`**：设置面板「数据」分组新增「本地能力发现」入口（按钮 `扫描本机能力`）；点击打开发现向导弹窗，调用 `/api/discover` 列出候选（来源标签：config AI 应用 / 常见端口 / 目录扫描），每条可「添加」，亦支持「全部添加」。添加复用既有 `POST /api/resource`（handler 仅 merge 存储，字段无需再 normalize），添加后实时刷新资源列表。
- **与担忧③的对应**：① 跨机器——对方电脑只要真跑了这些进程/端口，发现向导即可把它们重新纳入；② 缺 UI 的脚本/端口——通用运行面板（v0.8.3）已能让脚本类资产在详情页直接「执行一次」看输出、端口类「探测端口」确认监听，聚创台作为「本地统一入口」不因缺 UI 而失效；缺失条目显示离线而非报错，首次使用用发现向导补齐即可。
- **验证**：`node --check server.js` 通过；重启后 `GET /api/discover` 返回本机候选（Ollama/AnythingLLM 等若在线则入列）；设置面板「数据」页可见入口；弹窗列出候选并支持添加/全部添加；无头截图确认。

## [0.8.3] - 概览页监控卡手动刷新 + hero 瘦身 + 通用运行面板

- **目标**：针对阿豪最新截图反馈：①「系统监控/仪表盘」显示「暂不可达」像损坏，怀疑后台刷新过快；② hero 占区太大；③ 担心脚本/端口没 UI 时工具箱/AI 应用失去作用。
- **手动刷新**：`index.html` 概览页两个 mini 监控卡（系统监控、仪表盘）改为手动刷新。默认不再 `setInterval` 5 秒轮询；进入概览页时自动读取一次，之后由用户点击卡片右上角刷新按钮触发；刷新时按钮旋转、状态徽章显示「更新中…」，成功显示「已更新」，失败/未运行显示灰色「未运行」并给出重试按钮，不再红色「暂不可达」。
- **hero 瘦身**：`.ov-hero` 内边距由 `22px 26px` 缩至 `14px 22px`；标题由 `24px` 缩至 `20px`；描述与 tag 间距同步收紧；背景光斑也相应缩小，整体更紧凑。
- **通用运行面板**：
  - 后端 `server.js` 新增 `POST /api/run-once`：对 script/file/tool 类型资产执行一次脚本，捕获 stdout/stderr，30 秒超时自动杀，返回 `{ok, exitCode, output, durationMs}`。仅允许执行监控根目录/项目根目录下的脚本，防任意命令执行。
  - 后端新增 `GET /api/probe-port?port=`：探测本地端口是否监听，返回 `{online}`。
  - 前端资产详情页新增「通用运行面板」：脚本类资产可查看命令、点击「执行一次」并在下方 `<pre>` 看输出；端口类资产可点击「探测端口」确认服务是否真在监听。
- **验证**：
  - `/api/run-once` 实测 `hub/server.js` 返回其启动日志，30 秒超时后自动结束并给出输出。
  - `/api/probe-port?port=8768` 返回 `online:true`；`port=9999` 返回 `online:false`。
  - 无头 Chrome 截图 `C:\Users\<你的用户>\verify-0863-overview2.png` 显示 hero 更紧凑、监控卡正常显示数据、刷新按钮可见。

## [0.8.2] - 概括页 hero 上移 + 工具控制台内部化（去 8081）

- **目标**：根据阿豪截图反馈，修复两个内部体验问题：①概括页 hero 横幅与顶部操作栏重复/错位；②工具箱内部能力仍提示依赖外部 :8081 端口。
- **概括页 hero 上移整合**：`index.html` 在 `contentHead` 内新增 `#overviewHero` 容器；CSS 以 `.content-head.is-overview` 隐藏原 `ch-top`、显示 `#overviewHero`；`renderOverviewHeader` 返回 `.ov-hero` 并渲染到 `#overviewHero`；分区切换逻辑负责 `is-overview` 类与离开 overview 时清空容器；`#overviewHero` 独立事件委托处理 `reload/scanAll/addAsset`。效果：顶部操作栏直接显示「聚创台概括 + 刷新/重新扫描全盘/手动添加资产」，不再在内容区重复出现。
- **工具控制台内部化**：`makePortRenderer.bind` 改 fused 模块 base 强制为 `''`（相对路径 → 当前 8768 主进程），不再读取 `baseUrl`；清理前端误导文案（「工具箱服务未运行（:8081）」→「外部模块未运行」，加载提示强调已融合）；服务状态卡「工具控制台」改为 `port:'内部' ok:true`；`ovFetch` 自动补 `X-Access-Token`。
- **彻底去 8081 残留（同轮收口）**：`data/config.json` `toolbox.baseUrl` 由 `"http://127.0.0.1:8081"` 改 `""`；`server.js` `toolboxStatus()` 在 baseUrl 为空时直接返回 `{running:true,baseUrl:""}`，不再探测 8081。重启后 `/api/toolbox/status` 返回 `{"running":true,"baseUrl":""}`，与当前 8768 主进程一致。顺手清空 `toolbox.startCmd`（原指向 `<你的AI工作区>/novel-engine/toolbox/start-toolbox-desktop.bat`，已废弃），避免遗留外部启动入口。
- **验证**：启动零异常；`/api/status` 200；内部端点 `/api/tools/monitor/quick`、`/api/system/info`、`/api/system/disk`、`/api/system/proxy/status` 均 200；端口 `8081` 当前未监听（FREE），仅 `8768` 监听；无头 Chrome 截图 `#workbench` 可见 hero 已整合到顶部，`#tools` 可见全部能力卡片为「内嵌」标签、无 8081 依赖提示；最终截图 `C:\Users\<你的用户>\verify-final.png` 确认重启后状态一致。
- **顺手修复概览页「系统状态」卡一直显示「正在读取…」**：`#workbench` 自动进入工作台时，`loadLandingMetrics()` 异步拉取指标，概览页先以 `state.metrics=null` 渲染且完成后未重新刷新。在 `loadLandingMetrics()` 成功分支末尾补 `if(state.entered && state.view==='grid') render();`，指标到达后立即刷新概览视图。截图 `C:\Users\<你的用户>\verify-metrics-fix.png` 确认系统状态卡正常展示 CPU/内存/C盘/D盘 数据与进度条。

## [0.8.1] - 悬浮 AI 小助手（Phase 4：项目级之后的增强）
- **目标**：界面右下角悬浮框，点击展开问答/对话/解疑，作为聚创台内置助手。
- **后端**：`server.js` 新增 `/api/assistant/chat`（POST），代理到本地模型——默认 Ollama `http://127.0.0.1:11434/api/chat`，亦可切 OpenAI 兼容 `/v1/chat/completions`（AnythingLLM/free-API/OpenClaw 等）；前端面板可配置 provider/baseUrl/model 并存本浏览器。
- **容错**：本地模型未启动或地址错误时返回 `offline:true` 友好提示，不崩；内置 system 提示限定为聚创台助手角色。
- **前端**：`assistant-fab` 悬浮按钮 + `assistant-panel`（消息流/输入/设置/清空/收起），沿用既有主题与交互态；Enter 发送、Shift+Enter 换行。

## [0.8.0] - 项目级收口（Phase 0–3：去桩·身份·韧性·可升级）
- **定位确认**：本地单用户「文件/脚本/端口管理便利工具」，内部附带众多小功能；可上架 GitHub 公开但非完全开源。
- **Phase 0 去桩+接AI**：内嵌容错（离线/被拦截显示降级提示，不再白屏）；`aiApps` 已含 10 条本地 AI 栈（AnythingLLM/多Agent/OpenClaw/free-API 可内嵌 + 豆包/Codex/WorkBuddy/Claude/ChatGPT 桌面端 + Ollama 服务）。
- **Phase 1 身份与首启**：`/api/about` 端点 + 侧栏「关于」模态（是什么/五大分区/如何扩展 config）+ 一次性首启引导条。
- **Phase 2 韧性+运行态**：启动自检日志（挂载前缀数/版本/绑定/令牌）；`/api/status` 统一健康端点（运行时长/挂载工具数/各守卫）；toolApp 故障隔离错误中间件（单工具异常返回结构化 500，不拖垮 8768）。
- **Phase 3 可升级+配置治理**：`/api/changelog` 端点（解析最新版本）+ 设置「更新日志」模态（运行版 vs CHANGELOG 最新版对比）；`normalizeConfig` 加载后补齐关键结构并告警缺失字段。
- 验证：10 工具融合路由全 200；`/api/status`、`/api/about`、`/api/changelog` 均可用；异常请求不拖垮服务。

## [0.7.6] - 2026-09-06 · 安全状态可视化自检（脱离 demo 收口）
- **目标**：把已落地的 F1/F2/F3/P2 加固做成可在设置面板一眼核对、可审计的状态，而非仅停留在代码层。
- **后端**：`server.js` 新增只读端点 `/api/security/status`（受 accessKey 保护），返回 `{host, https, cors:'same-origin', csp, fileGuard, ssrfGuard, tokenEnabled}`。
- **前端**：`index.html` 设置面板「数据」tab 加「安全状态」组，含「刷新状态」按钮（`data-action=refreshSec`）→ `fetchSecStatus()` 调 `/api/security/status` 渲染 CORS/CSP/文件根/SSRF/令牌/绑定/传输层逐项 ✓/—。
- 验证：端点返回各防护 true、`tokenEnabled=false`（当前无感）；root/toolbox/music/files 全 200 无回归；前端 `refreshSec`/`secStatus` 已写入。
- 注：HTTPS / CSP 去 `unsafe-inline` / 多用户账号三项仍按需暂缓（过度工程或需暴露非信任网络才做），见 0.7.5 说明。

---

## [0.7.5] - 2026-09-06 · 安全加固（脱离 demo 范畴：F1/F2/F3/P2）

- **目标**：阿豪要求「让项目脱离 demo 范畴，继续」——落实审计报告 P0/P1/P2 修复，消除高危越权面并补认证能力。
- **F1 任意文件读/列（High）**：`server.js` 内 `/api/files/list`、`/api/files/read`（真正生效分支，因 `_routes/files.js` 未注册该路径）补 `isSafeTarget` 校验（越根→403）；并增强 `isSafeTarget` 用 `fs.realpathSync` 解析真实路径防 symlink 逃逸。验证：PoC 越根 `C:/Windows`、越根 `MEMORY.md` 由 200 变 403；受管根内（Desktop、`<项目目录>` 含中文路径）仍 200。
- **F3 CORS 宽松 + 缺 CSP（Medium）**：`send/sendText` 写死的 `Access-Control-Allow-Origin: '*'` 收紧为同源白名单（默认 `http://127.0.0.1:8768`/`http://localhost:8768`，可 `config.allowedOrigins` 扩展）；跨源不回显 ACAO → 浏览器阻跨站读取。全响应注入 `Content-Security-Policy`（`frame-ancestors 'self'`、`base-uri 'self'`、`object-src 'none'`，script/img/connect 按实际用法放行，保留 unsafe-inline/eval 兼容内联前端）。
- **F2 SSRF + 服务端写（High/Med）**：`reading-room.js /download` 加 `assertSafeUrl`——仅 http/https、拒 localhost/0.0.0.0、IP 字面量直判私有网段、域名经 `dns.lookup` 解析后逐地址判私有（127/10/172.16-31/192.168/169.254/组播/链路本地/保留），并限下载 50MB。验证：`file://` 协议、环回、私有网段、169.254 元数据均被拦截。
- **P2 轻量访问令牌（无认证→可配置）**：`config.json` 加 `accessToken`（默认空=本机无感）；`server.js` 加 `accessKeyOK` 中间件（设令牌后 `/api/*` 与 `/reading-downloads` 需 `X-Access-Token`/`?token=`/`Bearer`，否则 401）；`assets/tb-shim.js` 自动从 `localStorage('jct_token')` 携带令牌；并补**设置页令牌入口**（`index.html` 设置面板「数据」tab → 「访问安全」组，输入存 localStorage 即时生效，使认证能力真正可用）。默认空 token 全 API 仍 200（不破坏日常体验），启用后未带即 401。P2 端到端实证：设 token 后无 token→401、正确/Bearer→200、首页仍公开 200。
- 改动文件：`server.js`、`services/_routes/reading-room.js`、`data/config.json`、`assets/tb-shim.js`；4 处 `node --check` 通过。
- 验证与零回归：重启 8768（后台 `JyNZkt`），10 融合路由 + 主服务路由全 200；F1/F2/F3/P2 均经 PoC 实证闭合；无回归。报告见 `docs/聚创台安全加固报告_2026-09-06.md`。
- **定位更新**：加固后达「本地可信的生产级个人工具」级别（消除全部高危越权面 + 同源隔离/CSP/可配置认证）。注：「脱离 demo」指本地/受信局域网范畴；若开放到非信任网络须先设 `accessToken` + 启用 HTTPS（当前 HTTP 明文，未达公网级）。

---

## [0.7.4] - 2026-09-05 · 8 工具融合进 8768 主进程（真·单端口，消除 cmd 弹窗）

- **根因（阿豪反馈"每次打开聚创台弹一堆 cmd"）**：8 工具各是 `.bat`→`node mount.js` 独立进程，各自开一个 cmd 窗口；融合进 8768 主进程是治本方案。阿豪明确"最近这 8 个全部"融合。
- **机制（server.js 主服务是 raw `http.createServer`，非 express app）**：在 server.js 内新建 express 子应用 `toolApp`，`app.use(prefix, router)` 挂载 10 个 `services/_routes` 路由模块（sysmon/dashboard 共享 system.js；tools/dashboard 共享 tools.js+extra-tools.js），覆盖 sysmon→/api/system、dashboard/tools→/api/tools、reading-room→/api/reading-room、files→/api/files、writing→/api/writing + /api/writing/engine + /api/world、scripts→/api/scripts、music→/api/music，并挂 /reading-downloads 静态（←data/downloads）。主服务 raw handler 对共享前缀委托 `return toolApp(req,res)`。
- **共享前缀叶子路由迁移动（避免委托后失灵）**：主服务原 `/api/system/metrics`、`/api/tools/launch|stop|log`、整组 `/api/files/*`（文件管理器）一并迁至 toolApp 重新注册（复用 server.js 既有函数 getSystemMetrics/launchToolScript/stopToolScript/tailToolLog/getFileRoots/fileList/fileRead/isSafeTarget/TRASH_DIR）。
- **backendPort patch**：mount.js 原补丁逻辑移植进 server.js——`loadConfig` 注入 `c.backendPort = CONFIG.port(8768)`，使 music 的 `/download` 自回源 `playurl` 指向主端口（同一进程内自洽）。
- **错误隔离**：各工具路由异常由 server.js 顶层 `uncaughtException`/`unhandledRejection` 兜底（只记日志不退出，保证常驻）+ toolApp 末尾错误中间件返回 500，单工具异常不拖垮主进程。
- **前端同源化（index.html）**：`SYSMON`/`DASH` 硬编码 `8801/8802` 改同源 `''`（相对 8768）；8 模块 config.json 去 `port/baseUrl/url` + 加 `fused:true` → 渲染器 `base=''` 经 tb-shim 把相对 `/api/*` 打到 8768；左栏 fused 模块显示常驻绿点（无端口故不探 health、不显启停按钮——音乐渲染器本就由 `t.cmd&&t.baseUrl` 守卫）。assets 脚本无写死 880x（仅 system-tools.js 的 18081 代理 PAC 端口，无关）。
- **消除弹窗**：融合验证后，按端口 8801–8809 精准定位 PID 并强杀 8 个独立进程（cmd 窗口随之关闭），保留 8768。start.bat 本就只启 8768，故后续重启不再拉起独立工具、不再弹 cmd。
- 验证：node --check 通过；重启 8768 新代码，[fuse] 10 路由全挂载无报错；/api/system/info、/api/system/metrics、/api/tools/monitor/quick、/api/files/list、/api/writing/projects、/api/reading-room/categories、/api/scripts/list、/api/music/playlists、/api/world、/reading-downloads 全 200；迁移 POST 路由（/api/tools/stop、/api/files/write）body 解析正常；/api/toolbox/meta 的 8 模块 `fused:true` 且无 port；8 独立端口全 closed；主服务 /api/config、/api/resources 不受委托影响。
- **本地重扫（2026-09-05 23:49）**：全端口监听复核——`8768`（node server.js）为唯一存活的聚创台服务、关键端点全 200；`8801–8809` 全部不在监听列表（融合稳固）；`8765 / 8767 / 18800 / 8081 / 18081` 均未监听（多 agent 编排 workbench、OpenClaw 网关、旧 toolbox、DevHub 当前未运行，与本次融合无关）。本地并行运行的还有代理栈（verge-mihomo:1053/7897、clash-verge:33331、FlClashHelperService:47890）与桌面 AI 应用（WorkBuddy、豆包 49853、微信 16580、About 浏览器）。
- 双形态收尾（阿豪拍板「仅调试用」）：8 个 `services/*/start-*.bat` 保留不删，但已在文件头加 `[DEBUG-ONLY]` 标记（说明已融合进 8768、正常启动勿用、仅独立调试/回退）。start.bat 仍只启 8768，绝不会拉起这些 bat，确保单形态常驻。
- **死代码清理（本会话收尾）**：经逐行核对——toolApp 迁移版逐行复刻且引用同一批主服务函数（功能等价）、FUSE 委托块在 raw handler 手工分支之前、FUSE_PREFIXES 完整覆盖 `/api/files`、`/api/system`、`/api/tools`——删除 server.js 原 3 块因委托优先而不可达的手工处理：`/api/files/*`（roots/list/read/write/mkdir/rename/delete/trash/restore/register 共 10 分支）、`/api/system/metrics`、`/api/tools/launch|stop|log`，并在删「本地文件管理」段注释处补「开机自启/工具箱」段注释（保持风格一致）。文件由 2082→1952 行；保留的 `/api/self/open`、`/api/self/startup`、`/api/toolbox/*` 已确认不在 FUSE 前缀内、未受影响。重启 8768 新代码验证：10 路由全挂载无报错；GET /api/system/metrics、/api/files/list、/api/files/roots、/api/tools/log、/api/writing/projects、/api/reading-room/categories、/api/scripts/list、/api/music/playlists、/api/world/testproj、/api/toolbox/meta 全 200；POST /api/tools/launch（返回「未找到该工具」）、/api/tools/stop（ok:false）、/api/files/write（express.json 真实写入成功）、/api/self/startup 均正常——**零回归**。

---

## [0.7.3] - 2026-09-05 · 工具控制台 UI 收敛（去误导 + 真实运行态 + 分类对齐）

- **背景**：阿豪确认「工具箱(:8081)大概率停用」，按既定设计收敛而非重构。重评估（docs/工具控制台UI重评估-2026-09-05.md）确认「点了没反应」非代码缺失——机制/渲染器(13)/前端资源/assets 托管均健全，根因是 UI 状态模型停留在已废弃的 `:8081` 工具箱架构。
- **去误导横幅**：`index.html` welcome banner 基于 `toolboxStatus()` 探测 `:8081`（常态未运行）弹「工具箱服务未运行，点此启动」——误导（8 工具实际在 8801–8809 独立跑）。移除 banner；`renderWebApp` 兜底空态由「工具箱服务未运行/:8081」改中性「模块暂不可用」；`toolboxStart` 拉 novel-engine bat 的误导入口随之失效（无 UI 触发）。
- **左栏真实运行态**：`tsg-item` 加 `<span class="tsg-dot">` 绿/灰点；`renderToolsPage` 末尾对含 `port` 的模块调 `refreshToolDot(id, port)` 探各自端口 `/api/health`（mount.js 已 `cors()`，跨域放行；失败静默灰点，不误导）；新增 CSS `.tsg-dot/.tsg-dot.on`。消除「点了没反应」体感（运行态真实可见）。
- **分类对齐项目规范**：`config.json.toolbox.modules[].group` + `scripts[].group` 共 17 处由自创分组（监测与媒体/创作与阅读/学习助手/实用工具/本地脚本工具）改为项目既定 8 类标签：`{"端口服务":7,"工具·文件":5,"脚本":5}`（共 17 项）。
- **未动项（按铁律，避免为将停用工具箱过度执行）**：不重构集中启停（方案 C）；scripts 4 个 cmd 仍指向 novel-engine 旧路径但保留 `available` 保护（缺失即显示「（缺失）」不崩）；`server.js /api/toolbox/status` 仍探测 :8081 但前端不再依赖其 banner（留作兼容）。
- 验证：重启 8768（新代码）；served index.html 误导文案残留 0；`/api/toolbox/meta` groups 计数正确；8 工具 8801–8809 health 全 200（左栏绿点将亮）。

---

## [0.7.2] - 2026-09-05 · 音乐搜索限流容错

- **音乐搜索抗限流加固**：`services/_routes/music.js` 的 `GET /api/music/search` 此前无重试、无缓存、无限流容错——一旦 4 个 @meting/core 平台 + 第三方 tang API 集体限流/区域拦截，即偶发返回空结果（用户反馈「偶发空结果」）。
  - 新增内存搜索缓存（`searchCache`，TTL 10min，上限 300 条）：成功结果命中即缓存。
  - 单源失败重试（`withRetry`，meting.search / tangSearch 各重试 2 次、间隔 500ms），缓解瞬时限流。
  - 全失败回退：当本次所有源都失败时，返回最近缓存结果（`cached:true` + `notice` 提示）；无缓存则明确告知「当前所有音源暂不可达，请稍后重试」。
  - 增强 `meting.search` 健壮性：单平台异常 try/catch 降级为 `[]`，不再因个别平台解析异常拖累整体（配合 `Promise.allSettled` 隔离）。
- 验证：`node --check` 通过；重启 8805 实测「周杰伦」返回 60 首（4 平台 + tang 全 fulfilled，`cached:false`）；回退决策独立单测 3 场景全过（全失败+有缓存→返回缓存、全失败+无缓存→明确告知、正常→实时结果）。

## [0.7.1] - 2026-09-05 · learning-quiz 移除与替代

- **移除 learning-quiz**：阿豪决策不再内置刷题系统。清除全部相关文件与配置：
  - 删除 `services/_routes/learning-quiz.js`、`services/learning-quiz/`（启动器）、`data/learning-quiz/`（6.7M 应用副本）、`data/script-manager/manifests/learning-quiz-start.manifest.json`、`data/logs/mount-learning-quiz.log`、`data/logs/tools/learning-quiz.log`。
  - 配置去引用：`index.html`（APP_USAGE + 渲染器）、`data/config.json`（modules + scripts 两条）、`server.js`（路由分类 + 新增 `/workbench/` 静态路由）、`services/_mount/mount.js`（注释）、`data/registry.json`（旧 novel-engine 外部条目）、`data/descriptions.json`、`README.md`。
  - `prototype:true` 占位计数保持 0（learning-quiz 已在 P3 收口时去占位）。
- **替代件**：以本地自包含 HTML `1个月Python-Agent学习工作台.html`（位于 `<你的用户目录>/WorkBuddy/自学准备/`）替代。
  - 复制为 `<项目目录>/workbenches/python-agent-desk.html`（零依赖、单文件、本地存储不上公网）。
  - 主服务新增 `GET /workbench/*` 静态路由（仅放行 `.html` + 防目录穿越），实测返回 `200 / text/html`、穿越攻击 `404`。
  - `data/config.json` 新增模块 `python-agent-desk`（group「学习助手」），`index.html` 新增 `TOOL_RENDERERS['python-agent-desk']` 以全高 iframe 内嵌该 HTML（同源自 http，无跨域问题）。
  - 进入「工具箱 → 学习助手 → Python-Agent 学习工作台」即可在站内直接打开，无需外部浏览器。

## [0.7.0] - 2026-09-05 · Phase0 AI 代理主线（已完成）

> 状态：Phase0 全部子任务（后端 + 前端 + 旧入口收敛）已落地并验证；版本号由 v0.6.0 升 v0.7.0。聚创台进入「AI 应用统一工作台」形态，8 工具占位保持原型态待 P3 副线对接。

### Phase0-1 已完成（后端）
- `data/config.json` 新增顶层 `aiApps` 注册表（10 个本地 AI 应用：anythingllm / multi-agent / openclaw / free-api / ollama + 豆包 / Codex / WorkBuddy / Claude / ChatGPT），每条含 `embed`(是否可内嵌 http) / `kind`(web 内嵌 / service 服务 / desktop 桌面客户端) / `launch`(启动命令)。
- `server.js` 新增 `GET /api/ai-apps`（列表）+ `GET /api/ai-apps/status`（在线探测，对 `url` 做 HEAD 探测返回 online 标志）。
- 新增 `POST /api/ai-apps/launch`：服务类应用（ollama）按 `launch` 字段唤起启动脚本；桌面客户端返回引导提示；web 类返回可打开地址。
- 验证：`/api/ai-apps` 返回 10 条；`/api/ai-apps/status` 正确返回 `{id,online,embed,kind}`；launch 对 service/desktop/web 三类均返回正确 mode。

### Phase0-2 / Phase0-3 已完成（前端 · 方案 A：独立一级模块）
- sidebar 新增一级入口「AI 应用」（位于「工具箱」与「文件管理」之间）。
- `loadAiApps()` 拉取 `/api/ai-apps` + `/api/ai-apps/status`；进入该分区时启动 12s 轮询实时刷新在线状态（内嵌预览时不刷新，避免打断）。
- 新增 `renderAiApps()` 统一面板：按 `group` 分组的卡片网格，每张卡含图标、名称、描述、kind 标签（Web 内嵌 / 本地服务 / 桌面客户端）、在线状态点（绿/红）。
- 卡片操作：web 可内嵌应用 → 「内嵌打开」(iframe 内嵌，复用 `showEmbed`) + 「浏览器」；服务类 → 「启动」；桌面客户端 → 仅状态展示 + 说明提示（不空白、不报错）。
- 顶部汇总「N 个应用 / M 个在线 / K 个离线」，含「刷新状态」按钮。
- 主脚本通过 `node --check` 语法校验。

### Phase0 收尾（旧入口收敛）
- 移除 `toolbox.externals`（AnythingLLM / 多 Agent / OpenClaw 三个 AI 应用）：其数据已完整收归顶层 `aiApps` 注册表，并在「AI 应用」一级模块呈现，旧 `externals` 在「工具箱」页的重复渲染已删除。
- `server.js` 的 `toolboxMeta` 不再输出 `externals`；`index.html` 的 `renderToolsPage` 联合渲染与 `openTool` 的 `external` 分支同步清理。
- 验证：`/api/toolbox/meta` 的 `externals=0`（原 3 条），`aiApps` 仍为 10 条，无功能回退。

## P3 副线（进行中）· 8 工具后端对接

> 策略：分批推进。首批落地 3 个轻量工具（sysmon / scripts / files），打通「移植真实路由 + 前端去占位 + 验证真实端点」端到端范式；中型（tools / reading-room / dashboard）已完成；重型（writing）已完成；仅剩 learning-quiz（上游为 Python/Tkinter 桌面应用，非 Web 后端，需另定方向）。

### P3 首批已完成（sysmon / scripts / files）
- 后端：`services/_routes/{system,scripts,files}.js` 用 novel-engine 真实路由覆盖原 stub。
  - `system.js`：纯 Node 内置模块（express/child_process/os/fs），零外部依赖，直接可用。
  - `scripts.js`：硬编码 `<你的novel-engine目录>/script-manager/...` 改为本地 `data/script-manager/{manifests,scripts}`（相对 `__dirname` 计算），其余纯内置。
  - `files.js`：`require('../utils/...')` 改为 `../_utils/...`；新增依赖 `multer`+`pdf-lib`+`sharp`（npm 安装，33 包）；新增 `services/_utils/exec.js` 提供 `execCmd`。
- 前端去占位：`index.html` 中 sysmon/scripts/files 三个渲染器移除 `prototype:true` 标志，激活真实 UI（#tb-host 渲染真实内容、调用 `window[init].init()`）。三个前端资源（system-tools.js / scripts-manager.js / file-tools.js）原本已带 `window.X = X` 挂接，无需补。
- 验证（真实端点，非 stub）：
  - sysmon 8801 `/api/system/info` 返回真实主机名/CPU/内存；`/api/system/disk` 返回 2 块磁盘。
  - scripts 8809 `/api/scripts/list` 正常返回（当前 0 条，因 `data/script-manager/manifests` 暂无 manifest 数据，后端已通，待补数据）。
  - files 8806 `/api/files/pdf/compress` 返回正确校验（`请上传PDF文件`），sharp/multer 加载正常。
- `index.html` 的 `prototype:true` 计数由 8 降为 5（剩余 dashboard/tools/reading-room/learning-quiz/writing 仍为占位）。

### P3 中型批次已完成（tools / reading-room / dashboard）
- 后端：`services/_routes/{tools,reading-room,extra-tools}.js` 用 novel-engine 真实路由覆盖原 stub，并将 `__dirname` 一级相对路径（`../data`、`../downloads`、`../scripts`）统一改为两级（`../..` → 项目根 `data/`），确保读写落在 `<项目目录>/data` 下，零外部依赖（仅 Node 内置 + express）。
  - `tools.js`：网络（ping/tracert/dns/port/http）、文本（json/base64/regex/timestamp/url/hash/password/stats）、系统（info/processes/network/env/services/gpu）、GitHub 下载等真实能力。
  - `extra-tools.js`：代码片段（snippets）、实验室（lab）、监控（monitor/quick/disks/top/connections）、进程终止、环境/服务操作等；以 `/api/tools` 前缀与 tools 共用 8803 与 8802(dashboard)。
  - `reading-room.js`：分类/文件/内容/下载/扫描/书架/书签/导入/搜索等真实能力；挂载静态目录 `/reading-downloads` ← `data/downloads`（8804）。
  - `dashboard.js` 死桩删除：dashboard(8802) 通过 `.bat` 的 `MOUNT_ROUTES=system,tools,extra-tools` 聚合三路由，已在 8802 暴露 `/api/system` 与 `/api/tools`。
- 前端去占位：`index.html` 中 dashboard/tools/reading-room 三个渲染器移除 `prototype:true`；其前端资源（system-dashboard.js→`window.sysDash`、tools.js→`window.toolManager`、reading-room/reading-room-entry.js→`window.readingRoom`）原本已自挂接，无需补。
- 顺带补齐 scripts 数据：复制 novel-engine 的 18 个 manifest（`data/script-manager/manifests/`），其 `entry_point`/`work_dir` 仍指向本机存在的 `<你的novel-engine目录>/script-manager/scripts/...`，故 scripts 工具现展示 18 条真实可运行条目（8809 `/api/scripts/list` 验证返回 18 条）。
- 验证（真实端点，非 stub）：
  - tools 8803 `/api/tools/system/info` 返回真实主机 `chenxs`/i5-11260H/内存磁盘；`/api/tools/monitor/quick` 返回实时 CPU/内存。
  - reading-room 8804 `/api/reading-room/categories` 返回真实分类（大A/东方财富网等）。
  - dashboard 8802 `/api/system/info` 与 `/api/tools/monitor/quick` 均返回真实数据。
  - scripts 8809 `/api/scripts/list` 返回 18 条真实条目。
- `index.html` 的 `prototype:true` 计数由 5 降为 2（剩余 learning-quiz / writing 仍为占位）。

### P3 重型批次已完成（writing · 零新依赖）

- 后端：从 novel-engine 移植写作子系统 7 文件，全部纯 Node 内置 + express，**零新 npm 依赖**：
  - 路由 `services/_routes/{writing,writing-engine,world}.js`（writing 挂 `/api/writing`、引擎 `/api/writing/engine`、世界设定 `/api/world`）。
  - 引擎模块 `services/writing-engine/index.js` + 子模块 `services/modules/story-state/index.js` + 配置 `services/config.js`(DeepSeek key) + 守卫 `services/guard.js`(熔断/用量)。
  - 桥接文件 `services/_routes/writing-engine.js`：因 novel-engine 将引擎作为模块（导出 `.router`）而非独立路由文件，聚创台补此桥接经 `mount.js` 挂载。
  - 参考数据 `data/writing/{styles,techniques,ai-models,pitfalls}.json`。
- 路径修正：`writing.js`/`writing-engine/index.js` 的 `DATA_DIR` 由 `__dirname/../data` 改为 `../..` 两级 → `<项目目录>/data`；`world.js` 的 `WRITING_DIR` 改为 `data/writing`；`story-state` 的 `WORLD_DATA_DIR` 多退一级；`guard.js` 的 `BASE` 由 `<你的novel-engine目录>` 改为项目根、`USAGE_FILE` 改到 `data/user-data/token-usage.json`（原硬编码 `toolbox/backend/...` 不存在）。
- 挂载修正：`writing.bat` 的 `MOUNT_PATHS` 由 `/api/writing,/api/writing/engine,/api/writing/world` 改为 `/api/writing,/api/writing/engine,/api/world`，对齐前端实际调用的 `/api/world/*`（原 world 挂在 `/api/writing/world` 导致前端 404）。
- 前端去占位：`index.html` 的 writing 渲染器移除 `prototype:true`（其前端资源 `assets/writing.js`→`window.writingManager` 原本已自挂接）。
- 本地功能（项目管理/章节/人物/笔记/大纲/快照/灵感/风格/模型）无需 key 即可用；AI 能力（DNA/生成/润色等）直连 DeepSeek（key 随 config.js 带入）。
- 验证（真实端点，非 stub）：
  - writing 8807 `/api/writing/projects` → `{"success":true,"data":[]}`（真实空项目列表）。
  - `/api/writing/ai/styles` → 真实风格数据（古风仙侠等）；`/api/writing/ai/models` → 真实模型数据。
  - `/api/writing/engine/dna/test` 与 `/api/world/test` → HTTP 200（路由存在，非 404）。
- `index.html` 的 `prototype:true` 计数由 2 降为 1（仅剩 learning-quiz 仍为占位）。

### P3 收口批次（learning-quiz · 桌面启动器直迁）

- 现状确认：learning-quiz 的「上游」并非 Node Web 后端，而是 **EduRAG V7.5 —— Python/Tkinter 桌面应用**（含真实题库 `data/question_bank/question_index.json`、`mock_exams.json`、`knowledge/`）。novel-engine 的 Node 路由只是 `spawn` 拉起该 Python 程序。聚创台原简介「浏览器访问 :5000」为错误信息。
- 阿豪拍板方向：**桌面启动器直迁**（复用存量应用，不重建 Web 版）。
- 实现：`services/_routes/learning-quiz.js` 重写为自注册风格 `module.exports = function(app)`（与 mount.js 第 85-90 行 `function(app)` 契约吻合），注册：
  - `GET /api/learning-quiz/info`：返回应用目录 / 主脚本存在性 / 当前 python 环境 / 依赖说明。
  - `GET /api/launch-quiz`：按 `findPython()` 解析 python（优先 `data/learning-quiz/venv` → 回退 `D:\TMF_project\venv` → 系统 `python`），`spawn` 拉起 `frontend/main_app.py`（detached + unref），500ms 后依进程存活返回「已启动」或带可操作提示的「启动失败」。
- 应用代码自包含化：复制 `D:\novel-engine\learning-quiz`（6.7M，已剔除 `__pycache__`）至 `D:\聚创台\data\learning-quiz`，`QUIZ_DIR` 改为相对 `__dirname` 两级 → 项目根 `data/learning-quiz`。
- `services/learning-quiz/start-learning-quiz.bat`：补 `MOUNT_ROUTES=learning-quiz` / `MOUNT_PATHS=/api/learning-quiz`（与兄弟 bat 一致）。
- 前端去占位：`index.html` learning-quiz 渲染器移除 `prototype:true`/`protoPure`；其 HTML 内联「启动刷题系统」按钮直接 `fetch('/api/launch-quiz')`（经 tb-shim 重写到 8808 工具端口），`js:[]`/`init:null` 无需额外前端资源，不会空白。同步修正简介（去除错误 :5000 说法）。
- 验证（同会话拉起 8808 + curl）：
  - `/api/health` → 200；`/api/learning-quiz/info` → `mainScriptExists:true`、pythonEnv=`TMF_project venv`。
  - `/api/launch-quiz` → 「刷题系统已启动（TMF_project venv）」；实测 python 主进程 + 其派生的子进程均被拉起（tkinter 成功加载），验证后已清理游离进程、释放 8808。
- **已知环境限制（非代码缺陷）**：本机无完整 Python 运行环境——`D:\novel-engine\learning-quiz` 无 venv、系统 python 3.13 缺 tkinter、`D:\TMF_project\venv` 缺 PIL/langchain 等。若 TMF venv 仍缺部分重依赖（PIL/python-docx/langchain/chromadb/flask/fastapi/python-dotenv），应用在更深 import 处可能报错。完整可用需在 `data/learning-quiz/venv` 或 TMF venv 补齐依赖。启动器本身逻辑已验证正确。
- **P3 副线 8 工具全部收口**：sysmon / scripts / files / tools / reading-room / dashboard / writing / learning-quiz 的 `prototype:true` 计数由 8 降为 0。

## v0.6.0 — 2026-09-05 · P0 底盘打底（可移植化改造）

**目标**：让项目从「依赖外部 novel-engine 的半成品」变为「git clone → npm install → npm run start 即可拉起」的独立工程。

### 新增
- 新增 `package.json`：收敛依赖为 `express` / `cors` / `@meting/core`，`npm install` 即可装齐，移除对外部 `<你的novel-engine目录>` 的运行时依赖。
- 新增 `services/_utils/config.js`：本地配置读取，替代外部 `novel-engine` 配置模块。
- 新增 `services/_routes/*.js`：各工具后端路由本地化；`music.js` 为真实实现，其余为原型桩（返回 `{ok:true, note:'<tool> prototype ready'}`）。
- 前端新增原型占位逻辑（`makePortRenderer` + `protoPlaceholder`）：未完成后端对接的 8 个工具显示「原型已就绪，后端对接开发中」，learning-quiz 显示「纯原型占位」；**禁止空白 #tb-host、点击不报脚本异常**。
- 新增 `README.md` 与 `CHANGELOG.md`。
- 新增 `docs/` 目录归档设计/方案文档；新增 `scratch/` 归档一次性调试脚本（git 忽略）。

### 变更
- 重写全部 9 个 `services/*/start-*.bat`：移除硬编码 `<你的用户目录>/.../node.exe` 与 `<你的novel-engine目录>/...` 绝对路径，改为 `%~dp0` 相对定位 + 系统 `node`。
- `services/_mount/mount.js`：路由解析由外部路径改为项目内 `services/_routes/<name>.js`；config 由本地 `_utils/config` 提供。
- `server.js`：脚本管理器路径改为由 `config.json` 的 `scriptManager` 配置驱动（默认 `data/script-manager/{manifests,scripts}`）；`/api/tools/launch` 配置查找顺序调整为 modules 优先于 scripts，修复 learning-quiz 误匹配外部 bat 的问题。
- `data/config.json`：新增 `scriptManager` 路径与 `monitoredRoots` 条目。
- `start.bat` / `restart_helper.bat`：改用系统 `node`（或 `NODE` 环境变量覆盖），无硬编码用户路径。
- `.gitignore`：补充忽略 `scratch/`、`.venv/`、`.snapshot/`。

### 已知限制（本期不解决）
- 仅「音乐中心」为完整功能模块；其余 8 个工具后端对接为远期 P3 副线。
- 占位模块不删除注册表、不隐藏条目，仅面板占位提示。

---

## v0.5.x 及以前（摘要）
- 主站 SPA（资产视图 / 工具台 / 配置面板）、零依赖 Node 后端、PySide6 桌面宿主等早期能力已落地，但强依赖外部 `novel-engine`，可移植性差、含大量临时调试文件，故进入 P0 底盘打底阶段。
