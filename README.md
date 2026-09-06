# 聚创台 (JuChuangTai)

本地 AI 与工具资产的统一管理工作台 —— 一个**零依赖、单端口**的本地便利工具，把你散落在各处的
文件、脚本、端口服务、本地 AI 应用，收拢成一个可检索、可操作、可内嵌的入口。

> **它是什么 / 不是什么**
> - ✅ 一个**可复用的工具 / 框架**：源码、内置服务、配置模板随仓库分发。
> - ❌ **不是**某个人的私人配置快照：本机目录、端口、token、资产清单**都不会**进仓库，由你本地首次运行时自动生成。
> - 别人 clone 后，会根据**他们自己的机器**自动发现资产；缺失的部分通过配置留口，由他们自行填写。

---

## 功能特性

- **资产统一视图**：扫描本地文件 / 脚本 / 端口 / 应用，分类（AI 应用 / Web 应用 / 端口服务 / 小程序·项目 / 脚本 / 附件·组件 / 工具·文件）管理。
- **本地能力发现向导**：设置 → 数据 → 「扫描本机能力」，自动探测常见 AI 端口 / 进程 / 目录，一键生成候选资产（**跨机器也能用**）。
- **通用运行面板**：脚本类资产可在详情页「执行一次」看输出；端口类可「探测端口」确认监听——即使没有 UI 也能直接用。
- **内嵌本地 AI 应用**：豆包 / Codex / WorkBuddy / Claude / ChatGPT / Ollama / AnythingLLM 等，直接在工作台内打开，免外链。
- **概览监控卡**：系统监控 / 仪表盘，手动刷新（不后台轮询，避免抖动）。
- **文件管理**：在监控根目录内浏览、检索、打开。
- **内置工具集**（`services/`）：总览仪表盘、系统监控、音乐中心、文件处理、阅览室、写作工作台、工具集合、脚本管理，以及 JSON / Base64 / 时间戳 / 文本对比等纯前端小工具。
- **AI 助手**：内置对话助手（默认接本地 Ollama），含安全约束，不泄露内部实现、不响应越权请求。

---

## 目录结构

```
聚创台/
├── server.js                 # 主服务（原生 http + express 子应用，监听单端口）
├── index.html                # 前端 SPA
├── start.bat                 # Windows 启动脚本（用 PATH 中的 node）
├── package.json
├── config.example.json       # 配置模板（复制为 data/config.json 后填写）
├── services/                 # 10 个内置工具（各自独立、可融合挂载）
│   ├── dashboard/  system-monitor/  music/  files/  reading-room/
│   └── writing/  tools/  scripts/  modules/  _routes/  _mount/  _utils/
├── assets/                   # 前端资产（bg / 阅读室 / 音乐 等）
├── docs/                     # 使用手册 + AI 助手安全约束（随仓库分发）
└── data/                     # 运行时数据（被 .gitignore 排除，不提交）
    ├── config.json           # 由你本地生成（从 config.example.json 复制）
    ├── registry.json         # 资产清单（发现向导写入）
    └── logs/
```

---

## 快速开始

要求：**Node.js >= 20**（仅用原生模块 + express / ws / multer / cors 等少量依赖）。

```bash
# 1) 克隆
git clone <your-repo-url> juchuangtai
cd juchuangtai

# 2) 安装依赖
npm install

# 3) 生成本机配置（从模板复制，再按自己情况改）
cp data/config.example.json data/config.json
#    （Windows 下也可直接双击 start.bat，首次会自动建空配置）

# 4) 启动
npm start
#    或： node server.js
#    或： 双击 start.bat

# 5) 打开
#    浏览器访问 http://127.0.0.1:8768/
```

---

## 配置说明（给别人用的「留口」）

`data/config.json` 由你本地维护，**不会**提交到仓库。关键字段：

| 字段 | 含义 | 是否需你填 |
|---|---|---|
| `fileRoots` / `fileScanRoots` / `monitoredRoots` | 纳入文件管理 / 扫描 / 监控的目录 | ✅ 填你自己的目录（留空则文件区为空） |
| `appScan.roots` | 扫描本地 AI 应用的目录 | 留空则按默认关键词扫常见位置 |
| `portScan` | 常见端口→服务名映射 | 一般无需改；`serviceStart` 里的启动命令按你机器填 |
| `aiApps` | 内嵌 AI 应用清单（url / 启动命令） | 按你实际安装填 url 与 `launch` |
| `toolbox.modules[].cmd/cwd` | 内置工具启动命令 | 模板已用**项目相对路径**，开箱即用 |
| `assistant` | 内置 AI 助手后端 | 默认 Ollama `http://127.0.0.1:11434`，填你的 baseUrl / model |
| `accessToken` | 访问令牌 | **暴露公网前必填**；纯本机 `127.0.0.1` 可留空 |

**资产怎么来？** 进入工作台后，用「设置 → 数据 → 扫描本机能力」自动发现；或手动在资产视图添加。
缺失的条目显示「离线」而非报错，不会让工具箱 / AI 应用失效。

---

## 安全与隐私

- **纯本地**：默认绑定 `127.0.0.1`，不对外网暴露，无遥测、无外部请求（AI 助手仅连你配置的本地模型）。
- **访问令牌**：若需跨设备访问，务必在 `config.json` 设 `accessToken`，否则任何人可访问。
- **不泄露内部实现**：内置 AI 助手设有系统约束 + 正则兜底，拒绝输出源码 / 实现细节 / 越权指令。
- **仓库不含个人数据**：`.gitignore` 已排除 `data/config.json`、`data/registry.json`、`data/logs/`、所有本地扫描结果、日志、`.workbuddy/` 等。
  发布前请确认没有把个人目录 / 路径硬编码进源码（内置服务的样本路径已改为项目相对路径）。

---

## 跨平台说明

当前以 **Windows** 为主（内置工具用 `.bat` 启动、端口探测走 PowerShell）。
Linux / macOS 下：核心服务（`server.js` + `index.html`）可运行，但 `.bat` 启动脚本、`Get-NetTCPConnection` 探测需自行替换为 shell / `nc` 等价实现。这部分作为后续 TODO。

---

## 许可证

[MIT](./LICENSE)
