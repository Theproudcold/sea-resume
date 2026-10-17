# 本地模型与外部 AI 接入

## 最终架构与优化

主应用仍是 Vue 纯前端静态站点，不增加必需业务后端。三种入口相互独立：

1. 应用内线上 AI：现有 OpenAI-compatible 多服务商配置。
2. 应用内本地推理：Ollama / LM Studio 的兼容接口。
3. 外部 Agent：Codex CLI / Claude Code，通过文件交换或可选 MCP relay 提交修改草稿，使用 CLI 自己的登录和模型配置。

外部 CLI 在本机运行不代表模型在本机推理。内容可能被 CLI 发送给其配置的服务商。

优化取舍：不让 AI 直接修改 LocalStorage、IndexedDB 或原始简历文件；不把浏览器自动化当业务协议；优先复用开源 WebMCP polyfill 和 relay，不开发自己的传输协议。使用独立同源隐藏宿主承载上游连接，撤销时销毁整个宿主，停止 WebSocket 和重连监听。仅在用户启用时动态加载 polyfill，普通编辑不加载、启动桥接。

## 使用本地模型

工作台或编辑器的「AI 模型配置」中添加 Ollama 或 LM Studio：

| 项目 | Ollama | LM Studio |
| --- | --- | --- |
| 默认地址 | `http://localhost:11434/v1` | `http://localhost:1234/v1` |
| 鉴权 | 默认无鉴权 | 默认无鉴权 |
| 模型 | 获取列表或手动填写已安装模型名 | 获取列表或手动填写已加载模型名 |

必须自行安装、启动服务并允许当前网页来源的 CORS。应用不启动模型、不下载权重。无鉴权只允许 loopback（localhost、127/8、::1）；不接受局域网或远程无鉴权地址，远程服务仍须 HTTPS + Key。不要为解决跨域问题关闭浏览器安全设置。

JSON 模式不兼容时关闭配置中的 JSON 模式，输出仍会严格校验；超时可配置 1–600 秒，默认 90 秒。无鉴权时不发送 Authorization。请求不自动重试、不跟随重定向，本地失败不回退到线上。配置导入导出不包含 Key；原有线上配置默认 bearer、JSON 开启、90 秒超时，保持兼容。

## 外部 Agent：文件交换（无需 MCP）

1. 编辑器「更多 → 外部 AI · Codex / Claude Code」。隐私打码模式下禁用。
2. 检查正文中的敏感内容，勾选同意并授权当前简历。授权30分钟，仅本页面会话有效。
3. 下载、解压 AI 工作区，在该目录运行 CLI。
4. 让 Agent 读取 `context/resume.json`、`AGENTS.md` / `CLAUDE.md`，在 `proposals/` 生成 JSON 草稿。
5. 保持面板打开，导入草稿、核对差异、确认保存。成功后可用编辑器撤销恢复。

ZIP 包还含 `edit-schema.json`、`proposal.example.json` 和 `.gitignore`。仅分享可见求职意向、简介、经历、项目、教育、技能与自定义正文；不分享结构化身份/联系字段、生日、头像、隐藏章节/条目或面试历史。正文中手写的联系方式不会自动识别，必须人工检查。

不能直接导入普通完整简历 JSON 作为草稿。每份草稿最多 40 个操作、250 KB，必须使用已导出上下文的 resumeId 和 baseRevision。自定义结构化列表暂不能整体重写。

关闭面板、切换简历、刷新或授权过期会撤销会话并清空待审草稿。重新授权后必须重新导出／读取上下文。撤销不会删除已下载的副本，也无法收回已发送给模型的内容。

## 外部 Agent：可选 MCP

```text
Codex CLI / Claude Code
          │ MCP stdio
          ▼
本机开源 Local Relay
          │ ws://127.0.0.1:9333
          ▼
网页中的受控业务工具 → 待审草稿 → 人工确认 → Resume Store → 当前存储适配器
```

LocalStorage 和本地文件夹存储均可使用，因为业务工具在页面内调用现有 Store。页面必须保持打开。无需浏览器扩展、浏览器调试端口或云端中转。

### 安装与配置

1. 在面板下载 MCP 启动包，解压到固定目录。
2. 在解压的 `sea-resume-ai-relay/` 中运行 `npm ci --ignore-scripts`。需要 Node.js >=22.13；首次安装需要网络。
3. 在面板展开配置向导，填写 `start.mjs` 的真实绝对路径。确认 CLI 能找到 `node`，复制生成的 Codex CLI 或 Claude Code 命令；Windows 使用生成的 JSON 配置。
4. 由 CLI 启动 MCP，再在网页点击「启用 MCP 桥接」。不需要在网页再次输入 CLI 的 API Key。
5. 让 Agent 使用下列业务工具。

| 工具 | 作用 |
| --- | --- |
| `sea_resume_get_context` | 当前授权正文、基线版本与协议 |
| `sea_resume_get_edit_schema` | 操作字段、格式及限制 |
| `sea_resume_propose_changes` | 接收 `{ proposal: {...} }`，立即返回 pending 和 ID |
| `sea_resume_get_proposal_status` | 查询 pending / applying / applied / rejected / conflict |

上游 relay 还提供来源、工具列表、工具转发及打开页面等管理工具；Sea Resume 自身不提供保存、批准、删除、任意文件读取或执行脚本的工具。不要授予 Agent 其他浏览器自动化权限后让它代替本人批准。

“桥接已启动”仅代表网页已加载连接宿主，不保证 CLI、relay 和网络许可已就绪。是否连接可在 CLI 的 MCP 工具列表核对。浏览器可能要求本地网络访问许可；被拒绝、页面关闭或企业策略限制时使用文件交换。

### 为什么提供启动包，而不是裸 npx

固定 `@mcp-b/webmcp-local-relay@6.0.3` 和 `@mcp-b/webmcp-polyfill@6.0.3`，采用 MIT 开源组件，不依赖旧 MCP-B 闭源扩展。真实联调发现 relay6.0.3 的默认依赖解析可能混用 Zod 4.4.3 与 4.6.7，导致空工具列表都报 `Cannot read properties of undefined (reading 'push')`。

启动包仅提供两行 ESM 启动器、package.json 和完整 lock，通过 `overrides.zod=4.4.3` 固定兼容依赖，不修改上游源码，不降级到来源校验较弱的旧 relay。不要删除锁文件或改用 `@latest`。源码用户也可执行：

```sh
npm ci --prefix tools/ai-relay --ignore-scripts
node tools/ai-relay/start.mjs --host 127.0.0.1 --widget-origin http://localhost:3000 --max-payload 500000
```

上述命令手动启动时占用终端；常规使用应让 MCP 客户端启动，并使用页面显示的真实来源（包含端口）。

## 协议和保存边界

```json
{
  "schemaVersion": 1,
  "proposalId": "unique-proposal-id",
  "resumeId": "从上下文读取",
  "baseRevision": "sha256:从上下文读取的64位摘要",
  "explanation": "基于已有事实精简个人简介",
  "operations": [
    { "type": "set_basic", "field": "summary", "value": "新的事实描述" }
  ]
}
```

- 摘要来自完整内存简历，覆盖未保存编辑，仅排除自动保存更新时间；不会把完整原始简历传给外部 AI。
- 外部操作限定到本次实际共享的条目 ID 和字段，禁止修改身份联系字段、隐藏内容或布局。
- 操作在解析与应用处双重校验，富文本和链接清洗；不执行模型输出。
- UI 确认时再次校验版本，旧草稿不静默合并或覆盖。
- 保存通过 Store FIFO 队列和当前存储适配器；失败不标记已应用，未出现新编辑时回滚本批数据和历史；不回滚等待期间的新输入。
- 每个授权会话最多30个不同上下文、50个草稿；同 ID 同内容幂等，不同内容拒绝。Store 本页面会话保留最近200个已应用 ID，状态不跨刷新持久化。
- 快捷 AI 助手采用相同版本化草稿与保存动作；原有多步优化保留其独立岗位版本工作流和字段冲突机制。

## 静态部署和信任边界

`build/relayAssets.ts` 在开发／构建时从固定依赖生成 `ai-relay/`：host、embed、widget、上游许可证和启动包 ZIP。均由本站托管，支持 `VITE_BASE_PATH` 子路径，不动态执行第三方 CDN 代码。构建仍只输出静态资源。

如部署额外 CSP，需要评估上游 blob iframe、内联 widget 脚本和回环 WebSocket 的许可：例如 frame-src 的本站/blob、connect-src 的本站和所用回环地址；严格策略可能阻止此功能。不要直接为整个站点放开不必要的 script-src。无法安全放行时关闭 MCP、使用文件交换。

relay 只监听127.0.0.1，配置必须指定准确的 `--widget-origin`，不能使用 `*`。Origin不是本地进程身份认证，不隔离同来源页面或其他共享 relay 的 MCP 客户端；仅在可信本机环境中使用，不同时接入不信任的 Agent。浏览器权限、网络安全策略和连接状态不是网页能够绕过的。

## 开源参考

- https://github.com/WebMCP-org/npm-packages
- https://github.com/webmachinelearning/webmcp
- https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem
- https://github.com/microsoft/playwright-mcp
- https://github.com/ChromeDevTools/chrome-devtools-mcp

WebMCP 浏览器原生 API 仍有实现差异，本项目通过固定版本 polyfill 兼容，不假定任意 CLI 可直接连接网页。Filesystem MCP 可作为文件模式的外部工具，但已有文件能力的 CLI 不需要额外安装。

## 验证范围

- 应用全量 Vitest：59个文件、320项通过；包含过期／越权／重复草稿、移除模块不外发、撤销授权期间中止提交、保存失败回滚及并发编辑保护。
- `node --test tools/ai-relay/relay.test.mjs`：2项通过，验证依赖锁与真实 stdio 初始化／工具列表，不调用模型。
- 默认路径与 `/sea-resume/` 子路径生产构建通过。真实无头 Chrome + 干净安装启动包通过 ZIP 导出、MCP 读取／提交、人工确认保存、状态查询、撤销后注销、模拟无 Key 本地请求和编辑器撤销；没有页面／控制台错误。
- 未调用真实 Ollama / LM Studio 权重、线上模型或 CLI 的模型会话。浏览器 HTTPS → 本地网络许可、企业 CSP 及其他浏览器需按实际部署验证。构建仍有大 chunk 提示，不影响成功构建。
