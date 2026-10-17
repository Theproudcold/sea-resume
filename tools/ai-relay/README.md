# Sea Resume 可选 MCP 启动包

此目录是独立的本地工具，不是网站后端。需要 Node.js >=22.13。

1. 在此目录运行 `npm ci --ignore-scripts`。
2. 在网页的「更多 → 外部 AI」授权当前简历。
3. 将 `start.mjs` 的绝对路径填入网页，复制生成的 Codex CLI / Claude Code 配置命令。
4. 在 CLI 中启用 MCP，再在网页点击「启用 MCP 桥接」，保持面板打开。
5. 调用 `sea_resume_get_context`，按协议调用 `sea_resume_propose_changes`。只能由用户在网页确认保存。

启动器只转交上游 `@mcp-b/webmcp-local-relay@6.0.3` CLI；不实现自己的 MCP 协议。`package-lock.json` 和 `overrides.zod=4.4.3` 避免上游同时装入不兼容的 Zod 版本，不能删掉锁文件或改用裸 `npx ...@latest`。

必须保留配置中的 `--host 127.0.0.1` 和明确的 `--widget-origin`。不要使用 `*`，不要向局域网开放。来源限制不是本地进程鉴权；同来源网页、其他已连接的 MCP 客户端和本机进程仍在信任边界内。不要同时接入不信任的 Agent。首次安装需要联网，后续工具通信走本机。

关闭面板、切换简历、刷新或30分钟到期会撤销网页授权；已发送给 AI 的数据无法收回。文件交换不需要此工具。浏览器可要求本地网络访问许可；如果受限，请使用文件交换，不要关闭浏览器安全设置。

上游项目与许可证：https://github.com/WebMCP-org/npm-packages （MIT）

安装后可运行 `node --test relay.test.mjs` 检查依赖锁与 MCP 初始化／工具列表（只启用本机临时端口，不调用模型）。
