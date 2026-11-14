# 项目协作规则

## Git 提交信息
- 提交标题统一为 `<type>(<中文范围>): <中文说明>`，例如 `feat(编辑器): 支持恢复章节状态`。
- 根据实际改动选择语义类型：`feat`（新功能）、`fix`（修复）、`refactor`（重构）、`test`（测试）、`docs`（文档）、`chore`（维护）、`perf`（性能）、`build`（构建）、`ci`（持续集成）、`style`（格式/样式）、`revert`（回滚）；不要把非功能改动统称为 `feat`。合并提交使用 `merge(中文范围): 中文说明`。
- 范围与说明使用简体中文；技术名词、产品名和代码标识符可保留原文。标题简洁、说明明确，末尾不加标点。
- 改写历史前先确认提交是否已经推送；默认只整理未发布的提交，不重写远端共享历史。改写时保留提交内容、父子关系和工作区未提交改动。

## CodeGraph（代码知识图谱）
- 本仓库已建立 CodeGraph 索引（根目录存在 `.codegraph/`），保存文件后约 1 秒自动同步，不需要手动 `codegraph sync`。
- 理解、定位或改动代码前先查图谱，不要用 grep/read 逐文件摸索：
  - 有 MCP 工具时调用 `codegraph_explore`：一次调用即返回相关符号的逐字带行号源码，并给出符号间的调用链与影响范围。
  - 没有 MCP 时用命令行 `codegraph explore "<问题或符号名>"`，输出与 MCP 工具一致。
- 图谱结果来自完整 AST 解析，不要再 grep 复核，也不要手工重建调用路径；`codegraph_explore` 返回的源码等同于已读取，可直接据此编辑。
- 仅当图谱不覆盖时才回退到常规读写工具：配置文件、文档、未被索引的文件；工具提示某文件索引未同步时，直接读取被点名的文件。
- 常用命令：`codegraph status`（索引状态）、`codegraph impact <符号>`（改动影响面）、`codegraph affected <文件...>`（受影响的测试）、`codegraph callers|callees <符号>`、`codegraph node <符号>`、`codegraph files`。
