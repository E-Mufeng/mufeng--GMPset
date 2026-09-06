# 聚创台 JuChuangTai

<p align="center">
  <strong>本地 AI 与工具资产的统一管理工作台</strong><br>
  把散落在各处的本地文件、脚本、端口服务、AI 应用，收拢成一个可检索、可操作、可内嵌的入口。
</p>

<p align="center">
  <a href="https://nodejs.org/" target="_blank"><img src="https://img.shields.io/badge/node-%3E%3D%2020-339933?logo=node.js&logoColor=white" alt="Node.js"></a>
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License MIT">
  <img src="https://img.shields.io/badge/platform-Windows%20primary-0078D6?logo=windows&logoColor=white" alt="Platform">
  <img src="https://img.shields.io/badge/status-%E7%A8%B3%E5%AE%9A%E5%8F%AF%E7%94%A8-brightgreen" alt="Status">
</p>

---

## 目录

- [它能做什么](#它能做什么)
- [适合谁用](#适合谁用)
- [快速开始](#快速开始)
- [首次配置](#首次配置)
- [目录结构](#目录结构)
- [安全与隐私](#安全与隐私)
- [平台支持](#平台支持)
- [许可证](#许可证)

---

## 它能做什么

聚创台是一个**单端口、零复杂依赖**的本地工作台，启动后通过浏览器即可管理本地资源：

- **资产统一视图**：扫描并管理本地文件、脚本、端口服务、AI 应用，按 `AI 应用 / Web 应用 / 端口服务 / 小程序·项目 / 脚本 / 附件·组件 / 工具·文件` 分类。
- **本地能力发现向导**：打开「设置 → 数据 → 扫描本机能力」，自动探测常见 AI 端口、进程与目录，一键生成候选资产。换一台机器也能快速重建自己的资产列表。
- **通用运行面板**：脚本类资产可在详情页直接「执行一次」查看输出；端口类可「探测端口」确认是否监听。即使没有 UI 的脚本或端口也不会失效。
- **内嵌本地 AI 应用**：豆包、Codex、WorkBuddy、Claude、ChatGPT、Ollama、AnythingLLM 等，直接在工作台内打开，无需反复切换窗口。
- **概览监控卡**：系统监控与仪表盘，默认手动刷新，不后台轮询，避免占用资源与视觉抖动。
- **文件管理**：在指定根目录内浏览、检索、打开文件。
- **内置工具集**：总览仪表盘、系统监控、音乐中心、文件处理、阅览室、写作工作台、工具集合、脚本管理，以及 JSON / Base64 / 时间戳 / 文本对比等纯前端小工具。
- **AI 助手**：内置对话助手，默认连接本地 Ollama，含系统级安全约束，不输出源码、不响应越权请求。

> **定位说明**
> - ✅ 这是一个**可复用的工具 / 框架**：源码、内置服务、配置模板随仓库分发。
> - ❌ **不是**任何个人配置的导出：本机目录、端口、Token、资产清单都不会进仓库，由使用者在本地首次运行时自行生成。

---

## 适合谁用

- 本地同时运行多套 AI 应用（Ollama、AnythingLLM、豆包、Codex 等），想统一管理入口的人。
- 本地积累了大量脚本、端口服务、小工具，需要一个统一检索面板的人。
- 希望把本地能力封装成可移植框架，方便自己在多台机器上复用的人。

**不适合**：需要多用户协作、公网访问、HTTPS 鉴权、跨平台开箱即用的人。这些不是当前阶段目标。

---

## 快速开始

要求：**Node.js >= 20**（仅使用原生模块 + express / ws / multer / cors 等少量依赖）。

```bash
# 1. 克隆

git clone https://github.com/E-Mufeng/GMP-set.git juchuangtai
cd juchuangtai

# 2. 安装依赖
npm install

# 3. 生成本机配置（从模板复制）
cp data/config.example.json data/config.json

# 4. 启动
npm start
# 或：node server.js
# 或 Windows 下双击 start.bat

# 5. 浏览器打开
# http://127.0.0.1:8768
```

启动后，先进入 **设置 → 数据 → 扫描本机能力**，让发现向导根据你的机器生成第一批资产。

---

## 首次配置

`data/config.json` 由你本地维护，不会提交到仓库。关键字段说明：

| 字段 | 含义 | 建议填写方式 |
|---|---|---|
| `fileRoots` / `fileScanRoots` / `monitoredRoots` | 纳入文件管理、扫描、监控的目录 | 填入你本地的工作目录；留空则文件区为空 |
| `appScan.roots` | 扫描本地 AI 应用的目录 | 留空会按默认关键词扫常见位置 |
| `portScan` | 常见端口到服务名的映射 | 一般无需修改 |
| `aiApps` | 内嵌 AI 应用清单（url / 启动命令） | 按你实际安装的本地服务填写 |
| `toolbox.modules[].cmd/cwd` | 内置工具启动命令 | 模板已使用项目相对路径，通常开箱即用 |
| `assistant` | 内置 AI 助手后端 | 默认 Ollama `http://127.0.0.1:11434`，按需改 baseUrl / model |
| `accessToken` | 访问令牌 | 纯本机使用可留空；若要跨设备访问必须设置 |

**资产来源**：
1. 通过发现向导自动探测；
2. 在资产视图手动添加；
3. 缺失的条目会显示「离线」而非报错，不会导致工具箱或 AI 应用失效。

---

## 目录结构

```text
聚创台/
├── server.js                 # 主服务（原生 http + express 子应用，单端口）
├── index.html                # 前端 SPA
├── start.bat                 # Windows 启动脚本（调用 PATH 中的 node）
├── package.json
├── data/
│   ├── config.example.json   # 配置模板
│   ├── registry.example.json # 空资产清单模板
│   └── .gitkeep              # 保留空 data 目录
├── services/                 # 10 个内置工具
│   ├── dashboard/
│   ├── system-monitor/
│   ├── music/
│   ├── files/
│   ├── reading-room/
│   ├── writing/
│   ├── tools/
│   ├── scripts/
│   ├── modules/
│   ├── _routes/
│   ├── _mount/
│   └── _utils/
├── assets/                   # 前端资产（背景、阅读室、音乐等）
├── docs/                     # 使用手册与 AI 助手安全约束
└── LICENSE                   # MIT
```

运行时，`data/config.json`、`data/registry.json`、日志、下载目录等会被 `.gitignore` 排除，不会进入仓库。

---

## 安全与隐私

- **默认只监听本机**：`server.js` 默认绑定 `127.0.0.1:8768`，不对外网暴露。
- **无遥测、无外部请求**：AI 助手只连接你配置的本地模型后端，不会上传数据到第三方。
- **访问令牌**：若需要跨设备访问，务必在 `config.json` 中设置 `accessToken`；未设置时任何能访问你本机 8768 端口的人都能打开工作台。
- **AI 助手安全约束**：系统提示与正则兜底双重限制，拒绝输出源码、实现细节、越权指令等请求。
- **脚本执行沙盒**：执行脚本前会校验真实路径是否落在 `getFileRoots()` 指定的监控根目录内，超时 30 秒、输出超过 100KB 会被截断。
- **仓库不含个人数据**：`.gitignore` 已排除所有本地配置、资产清单、日志、下载目录、`.workbuddy/` 等。

---

## 平台支持

- **Windows**：完全支持，包含 `.bat` 启动脚本与 PowerShell 端口探测。
- **Linux / macOS**：`server.js` 与 `index.html` 核心可运行；`.bat` 脚本、`Get-NetTCPConnection` 端口探测需要自行替换为 shell / `nc` 等价实现。这部分作为后续 TODO，欢迎提交适配。

---

## 许可证

[MIT](./LICENSE)
