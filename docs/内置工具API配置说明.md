# 聚创台内置工具 API 配置说明

聚创台的部分内置工具（写作工作台、音乐中心、Ollama 启动）依赖第三方 API 或本地进程。这些配置统一放在 `data/config.json` 的 `builtinTools` 字段下，并且已经接入前端 UI（**工作台 → 右上角齿轮 → 内置工具**），无需手动改文件即可生效。

> **安全提示**：真实 API Key 仅保存在本机 `data/config.json` 中，该文件已被 `.gitignore` 排除，不会进入 Git 仓库。如果你之前把密钥误写入源码或已提交到仓库，建议到对应平台重新生成并替换。

---

## 一、写作工作台（AI 写作 / Beta 读）

写作工作台的 AI 能力（续写、润色、Beta 读等）通过 OpenAI 兼容接口调用大模型，默认适配 DeepSeek。

### 1.1 需要配置什么

| 配置项 | 含义 | 默认值 |
|---|---|---|
| `builtinTools.writing.apiKey` | API 密钥 | `''` |
| `builtinTools.writing.api` | 聊天补全端点 | `https://api.deepseek.com/v1/chat/completions` |
| `builtinTools.writing.balanceApi` | 余额查询端点 | `https://api.deepseek.com/user/balance` |
| `builtinTools.writing.model` | 调用模型名 | `deepseek-chat` |

### 1.2 在哪里配

- **推荐**：打开聚创台 → 右上角齿轮 → **内置工具** → **写作工作台（AI 生成）** → 填入 API Key、接口地址、模型名 → 保存。
- **备选**：直接编辑 `data/config.json` 的 `builtinTools.writing` 字段。
- **环境变量**：若偏好命令行，可设置 `DEEPSEEK_API_KEY`，后端会将其作为 fallback。

### 1.3 改模型 / 换服务商

只要接口兼容 OpenAI 的 `/v1/chat/completions`，就可以替换：

- 阿里通义千问：`api` 填 `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`，`model` 填 `qwen-plus`。
- 智谱 GLM：`api` 填 `https://open.bigmodel.cn/api/paas/v4/chat/completions`，`model` 填 `glm-4`。
- 本地 vLLM / Ollama 兼容服务：`api` 填 `http://127.0.0.1:11434/v1/chat/completions`，`model` 填已加载的模型名。

> 余额接口目前只按 DeepSeek 格式解析；换其他服务商后「余额检查」可能显示为 0，不影响正常生成。

### 1.4 常见现象

- **写作工作台里点击 AI 生成没反应**：先检查是否已填 API Key；再检查余额是否足够；最后看模型服务端是否在线。
- **提示“DeepSeek API 401/403”**：API Key 错误或已过期，到 DeepSeek 控制台重新生成。

---

## 二、音乐中心

音乐中心基于 `@meting/core` 聚合搜索，并内置了一个第三方公共音源代理（Tang API）用于 QQ 音乐的完整播放。你也可以替换为自备代理或填入 Cookie 提升可用性。

### 2.1 需要配置什么

| 配置项 | 含义 | 默认值 |
|---|---|---|
| `builtinTools.music.source` | 默认搜索音源 | `tencent` |
| `builtinTools.music.apiUrl` | 第三方音源代理地址 | `''`（使用内置默认） |
| `builtinTools.music.cookie` | 可选 VIP Cookie | `''` |

### 2.2 在哪里配

- **推荐**：打开聚创台 → 右上角齿轮 → **内置工具** → **音乐中心** → 选择默认音源、填写代理地址 / Cookie → 保存。
- **备选**：直接编辑 `data/config.json` 的 `builtinTools.music` 字段。

### 2.3 音源说明

- `tencent`：QQ音乐，资源较全；部分歌曲需要 Cookie 或代理才能完整播放。
- `kugou`、`kuwo`、`baidu`：酷狗 / 酷我 / 百度，作为互补源。
- 默认代理是公开第三方服务，网络波动时可能出现「当前音源暂不可达」；此时可稍后重试，或填入更稳定的代理地址。

### 2.4 Cookie 怎么用

Cookie 用于让 meting 以登录态请求平台接口，从而拿到更高音质或原本受限于未登录状态的资源。Cookie 是敏感信息，请只填写你自己的账号 Cookie，且只保存在本地 `data/config.json`。

---

## 三、本地模型：Ollama 启动命令

Ollama 不在仓库内，也不随聚创台一起启动。你需要在本地安装并运行 Ollama，然后在聚创台中配置启动命令，这样 AI 应用卡片上的「启动」按钮才能一键拉起它。

### 3.1 需要配置什么

| 配置项 | 含义 | 默认值 |
|---|---|---|
| `portScan.serviceStart.Ollama` | Ollama 启动脚本 / 可执行路径 | `''` |

或者填在 `aiApps` 中 ollama 条目的 `launch` 字段，两者等价：

```json
{
  "id": "ollama",
  "name": "Ollama",
  "kind": "service",
  "launch": "D:\\ollama\\ollama-lazy-serve.bat"
}
```

### 3.2 在哪里配

- **推荐**：打开聚创台 → 右上角齿轮 → **内置工具** → **本地模型（Ollama）启动** → 填写启动命令 → 保存。
- **备选**：直接编辑 `data/config.json`，在 `portScan.serviceStart` 下加 `Ollama` 字段。

### 3.3 启动命令示例

- Windows 批处理：`D:\ollama\ollama-lazy-serve.bat`
- 直接启动 Ollama：`C:\Users\<你的用户>\AppData\Local\Programs\Ollama\ollama.exe serve`
- PowerShell 脚本：`powershell -File "D:\ollama\start-ollama.ps1"`

> 聚创台不再写死任何 Ollama 路径；如果你没配置，点击「启动」时会提示“未配置启动命令”。

---

## 四、配置模板速查

首次运行请从模板复制：

```bash
cp data/config.example.json data/config.json
```

模板中 `builtinTools` 相关字段已给出空值与默认值：

```json
{
  "builtinTools": {
    "writing": {
      "apiKey": "",
      "api": "https://api.deepseek.com/v1/chat/completions",
      "balanceApi": "https://api.deepseek.com/user/balance",
      "model": "deepseek-chat"
    },
    "music": {
      "apiUrl": "",
      "source": "tencent",
      "cookie": ""
    }
  },
  "portScan": {
    "serviceStart": {
      "Ollama": ""
    }
  }
}
```

---

## 五、安全与隐私

1. **真实密钥不进仓库**：`data/config.json` 在 `.gitignore` 中；`data/config.example.json` 中所有密钥字段为空或占位值。
2. **修改实时生效**：前端保存后，写作 / 音乐服务会实时读取最新配置，无需重启聚创台。
3. **避免在源码中写密钥**：如果你自己扩展内置工具，请使用 `services/_utils/config.js` 的 `getWritingConfig()` / `getMusicConfig()`，不要硬编码。
