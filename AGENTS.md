# 项目协作规则

## Git 工作规范

### 分支模型
- `master`：稳定可发布分支，任何时刻都应可构建、可发布。只接受来自 `dev` 的合并与 `hotfix/*` 的紧急修复，不要在 `master` 上直接开发；推送 `master` 会触发 GitHub Pages 部署（`.github/workflows/deploy-pages.yml`）。
- `dev`：开发集成分支。所有新功能、新特性、重构、普通修复先合入 `dev`，在 `dev` 上验证通过后再并入 `master`。
- 功能分支：一律从 `dev` 切出，命名为 `<type>/<简短说明>`，`type` 与提交信息的语义类型一致，说明用小写短横线连接的英文短语，例如 `feat/ai-relay`、`fix/pdf-font-subset`、`refactor/template-store`。
- `hotfix/*`：线上紧急问题从 `master` 切出，修复后先合回 `master`，再同步回 `dev`，避免修复在开发分支上丢失。

### 开发流程
1. 同步基线：`git switch dev && git pull --ff-only`
2. 新建分支：`git switch -c feat/xxx`，不要在 `master` 或 `dev` 上直接改代码
3. 小步提交，提交信息遵守下面的「Git 提交信息」一节
4. 自测：`pnpm verify`（依次运行完整测试、类型检查和生产构建；Node ≥ 22.13.0、pnpm 10.30.2）
5. 合并前先对齐基线：`git fetch origin && git rebase origin/dev`，冲突在功能分支内解决
6. 合入 `dev` 并推送：`git switch dev && git merge --no-ff feat/xxx`
7. 发布：`dev` 验证通过后 `git switch master && git merge --no-ff dev && git push`，推送即部署

### 合并与历史
- 合入 `dev`、`master` 使用 `git merge --no-ff` 生成合并提交，保留特性边界；合并提交信息写作 `merge(中文范围): 中文说明`。
- `master` 与 `dev` 禁止 `git push --force`，禁止改写已推送历史；功能分支整理历史前，先确认提交尚未推送。
- 分支合并后及时删除（本地与远端），保持分支列表干净。
- 并行开发使用 `git worktree`（例如 `.worktrees/<分支名>`），不要在同一工作区反复切换分支。

## Git 提交信息
- 提交标题统一为 `<type>(<中文范围>): <中文说明>`，例如 `feat(编辑器): 支持恢复章节状态`。
- 根据实际改动选择语义类型：`feat`（新功能）、`fix`（修复）、`refactor`（重构）、`test`（测试）、`docs`（文档）、`chore`（维护）、`perf`（性能）、`build`（构建）、`ci`（持续集成）、`style`（格式/样式）、`revert`（回滚）；不要把非功能改动统称为 `feat`。合并提交使用 `merge(中文范围): 中文说明`。
- 范围与说明使用简体中文；技术名词、产品名和代码标识符可保留原文。标题简洁、说明明确，末尾不加标点。
- 改写历史前先确认提交是否已经推送；默认只整理未发布的提交，不重写远端共享历史。改写时保留提交内容、父子关系和工作区未提交改动。

## 防返工与验证契约

- 改动前确认工作区与真实基线；有未提交工作时另开 worktree，不将其计为已发布修复。索引属于另一个 checkout 时，不能把它返回的版本当作当前 worktree 的源码。
- 修 Bug 先加能在旧实现上失败的行为用例，再做最小修复；提交前记录 RED / GREEN。历史修复补测试也要验证样本确实触发旧错误，不能只验证新代码会通过。
- 涉及共享字段、状态或异步通信时，先列生产者、所有消费者及状态组合，遵守 [架构契约](<docs/architecture.md>)，按 [风险验证矩阵](<docs/change-safety.md>) 选测试。
- `provide/inject`、事件和 ref 的接线必须在真实父组件上验证。不能只靠 `global.provide`、stub 或源码字符串断言证明页面可用；DOM 尺寸、字体、输入法还需浏览器验证。
- 数据转换用同一个样本贯穿解析 → 消费/渲染，覆盖隐藏且非空、未知/可选字段、截断警告；Markdown 是可见内容交换格式，不是全字段备份。
- 重构只搬实现、不夹带行为修改；能力扩展、纠错、测试提速分别保留可验证边界。不得为提速删除唯一的真实正确性验证，也不以测试数量代替覆盖证明。
- 合并前对最终内容运行 `pnpm verify`；部署 workflow 同样运行它。CI 文件不等于远端分支保护：管理员需另行启用 required checks 与受保护分支，未启用时不要声称已禁止绕过。

## CodeGraph（代码知识图谱）
- 本仓库已建立 CodeGraph 索引（根目录存在 `.codegraph/`），保存文件后约 1 秒自动同步，不需要手动 `codegraph sync`。
- 理解、定位或改动代码前先查图谱，不要用 grep/read 逐文件摸索：
  - 有 MCP 工具时调用 `codegraph_explore`：一次调用即返回相关符号的逐字带行号源码，并给出符号间的调用链与影响范围。
  - 没有 MCP 时用命令行 `codegraph explore "<问题或符号名>"`，输出与 MCP 工具一致。
- 图谱结果来自完整 AST 解析，不要再 grep 复核，也不要手工重建调用路径；`codegraph_explore` 返回的源码等同于已读取，可直接据此编辑。
- 仅当图谱不覆盖时才回退到常规读写工具：配置文件、文档、未被索引的文件；工具提示某文件索引未同步时，直接读取被点名的文件。
- 常用命令：`codegraph status`（索引状态）、`codegraph impact <符号>`（改动影响面）、`codegraph affected <文件...>`（受影响的测试）、`codegraph callers|callees <符号>`、`codegraph node <符号>`、`codegraph files`。
