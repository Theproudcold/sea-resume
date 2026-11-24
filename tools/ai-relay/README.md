# Sea Resume 可选 MCP 启动包（离线／源码安装）

常规接入不需要这个目录：网站构建时会用 rolldown 把 `@mcp-b/webmcp-local-relay@6.0.3` 连同依赖打成单文件 `ai-relay/relay.mjs`，面板给出一行命令、一小段配置，或一句提示词即可接入。此目录保留两行 ESM 启动器与锁文件，供离线、审计或从源码运行的场景使用。需要 Node.js >=22.13。

1. 在此目录运行 `npm ci --ignore-scripts`。
2. 在简历主页打开「外部 AI」，选择客户端并复制接入命令。
3. 命令默认下载站点上的 `relay.mjs`。离线时把其中的脚本路径换成此目录 `start.mjs` 的绝对路径，`--host`、`--widget-origin` 和 `--max-payload` 保持不变。
4. 由 CLI 启动 MCP，再在网页点击「启用 MCP 桥接」，保持面板打开。
5. 调用 `sea_resume_list` 查看全部简历，再用 `sea_resume_get`、`sea_resume_set`、`sea_resume_create` 或 `sea_resume_delete` 管理其中一份。写回会立即保存。

启动器只转交上游 CLI；不实现自己的 MCP 协议。`package-lock.json` 和 `overrides.zod=4.4.3` 保证整棵树只有一个兼容 Zod，避免上游同时装入 4.4.3 与 4.6.7 后工具列表为空；根 `pnpm.overrides.zod` 与这里保持一致。不能删掉锁文件或改用裸 `npx ...@latest`。

必须保留配置中的 `--host 127.0.0.1` 和明确的 `--widget-origin`。不要使用 `*`，不要向局域网开放。来源限制不是本地进程鉴权；同来源网页、其他已连接的 MCP 客户端和本机进程仍在信任边界内。不要同时接入不信任的 Agent。首次安装需要联网，后续工具通信走本机。

关闭面板、切换简历、刷新或30分钟到期会撤销网页授权；已发送给 AI 的数据无法收回。文件交换不需要此工具。浏览器可要求本地网络访问许可；如果受限，请使用文件交换，不要关闭浏览器安全设置。

上游项目与许可证：https://github.com/WebMCP-org/npm-packages （MIT）

安装后可运行 `node --test relay.test.mjs` 检查依赖锁与 MCP 初始化／工具列表（只启用本机临时端口，不调用模型）。
