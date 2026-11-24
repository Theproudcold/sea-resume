# 变更安全：用契约阻止同类返工

本文件给 [协作规则](<../AGENTS.md>) 提供最小验证矩阵；数据流的唯一说明仍是 [架构与隐性契约](<architecture.md>)，不再复制一套架构。来源与反例见 [2026-11-18 复盘](<tech-summaries/2026-11-18-three-day-retrospective.md>) 与 [2026-11-24 三十天复盘](<tech-summaries/2026-11-24-thirty-day-retrospective.md>)。

## 一次变更的完成条件

1. 写清要保证的用户行为，以及不会改变的行为；列出共享数据的生产者和消费者。
2. Bug 用例必须能在修复前失败。补历史回归测试时，也要通过旧实现或局部回退证明其有效，不能仅展示绿色结果。
3. 先跑针对性用例，再在最终待合并内容上运行 `pnpm verify`。测试没有覆盖的浏览器行为单列，不将构建成功当作验收。
4. 提交围绕一个可独立验证、撤回的目的组织。纯重构与行为改变分开；多文件本身不是问题，无关目的混装才是。
5. 沉淀优先级：现有测试补边界 → 共享契约测试 → CI → 简短规则。已有规则能承载时，不另建重复 Skill。

## 风险 → 必测边界

| 变更类型 | 最小检查 | 不足以证明什么 |
| --- | --- | --- |
| Markdown / AI PDF 解析、字段变更 | 同一 fixture 覆盖普通正文与列表、数字联系方式、未识别字段、截断警告；解析后送到实际消费者；工作成果只显示一次、项目列表不能消失 | parser 对象有字段，不代表模板展示了字段；Markdown 不保证保存隐藏内容、ID、主题、完整结构 |
| 可见性、质量检查、导出 | `hiddenSections × 空/非空`、`visible × 条目内容`；隐藏目标不影响其他章节；重新显示恢复，数据不被删除 | 只测隐藏空章节或只测条目 `visible=false`，不能证明整章隐藏正确 |
| 页数、适配、组件通信 | 真实编辑器父组件连接；首次 `pending`、已有页数但 `pending=true`、隐藏恢复、主预览/全屏隔离；逐帧推进与早停；真实浏览器字体完成后复验 | 单独挂载 ThemeEditor 并 `global.provide` 只能证明消费者；jsdom 不证明真实 A4 尺寸 |
| 存储、撤销、草稿生命周期 | 只用 `saveResume` 派生索引；导出/切换前 `flushSave`；失败期间继续编辑；旧请求在关闭/切换后返回；清单与正文一致 | mock 成功返回，不证明保存串行化、权限手势或真实磁盘行为 |
| 版本历史、快照与镜像 | 哈希忽略身份/时间戳/头像；空提交被拒绝；保存失败不提交；恢复新增提交且保留旧提交；标签与裁剪；镜像失败不影响正文；删除/清空级联 | 只测仓库读写，不证明编辑器离开/关闭/定时检查点接线；只测内存仓库，不证明 IndexedDB 事务与目录权限 |
| 外部 MCP 连接 | 资源加载后仍是等待；只接受本 frame、本站来源的握手；停止后不再接收；真实浏览器核对本地网络许可 | iframe 的 `onload` 不证明本机 relay 已连接，CLI 工具列表才证明客户端已加载 |
| 字体/PDF 与测试提速 | 将缓存调用计数与真实字体/字形正确性分开；至少保留真实资产路径验证；CJK 间距用能使旧实现失败的样本，并保留拉丁空格对照 | 单个 mock 子集复用可以测缓存调用次数，不能证明新字符或不同字重的字形内容 |
| 预览与导出（html2canvas） | 切点同时避开浏览器行盒和渲染器字形下沉；`lab()` / `lch()` / `color-mix()` 落到 sRGB 像素；截图矮于当前内容时中止并报错。常数旁边留下实测差值 | 浏览器里行是完整的，不证明导出页缝没有字尾；`fillStyle` 回读仍可能是原来的颜色函数；jsdom 不证明 3.5px 量级 |
| 共享样式覆盖组件库 | `.el-dialog.is-align-center` 的 `margin: auto` 必须排在 `margin: 0 auto` 之后；对话框内取景框用 `min(100%, 上限)`，不写死大于内容盒的宽度 | 只在一个视口看过一个弹窗，不能证明其余 `align-center` 弹窗和窄屏；源码顺序反了，测试必须失败 |
| 路径、发版校验 | relay 等站点 URL 用 `import.meta.env.BASE_URL` 拼接；非法 tag 只报格式（以及与 `package.json` 的不一致），不另报由该 tag 拼出的 CHANGELOG 条目 | 根路径 `http://localhost:3000/ai-relay/...` 在本地可能通过，GitHub Pages 的 `/sea-resume/` 会让 Quality 和部署一起失败 |
| UI 文案、CSS、组件注册、输入法 | 实际应用插件入口、主要/空/失败/处理中状态；中文候选确认不提交；桌面/窄屏与浅/深色关键路径 | 测试安装完整组件库，不能证明应用按需注册完整；源码文本匹配不证明可点击和可见 |

## 已有与新增自动化入口

```sh
# 新增跨边界契约：真实解析器 → 注册表中的全部 Vue 模板，不 stub draggable item slot
pnpm exec vitest run src/components/preview/__tests__/import-template-contract.spec.ts

# 可见性与解析、防止虚假绿色的中文间距样本
pnpm exec vitest run src/utils/__tests__/resume-quality.spec.ts src/utils/markdown/__tests__/parseResumeMarkdown.spec.ts src/utils/pdf/__tests__/layoutText.spec.ts

# 适配的算法、消费者、画布分别测试；实际父组件接线不能省略
pnpm exec vitest run src/composables/__tests__/useOnePageFit.spec.ts src/components/editor/__tests__/ThemeEditorFit.spec.ts src/components/preview/__tests__/ResumeCanvas.spec.ts src/views/__tests__/EditorLayout.spec.ts

# 最终门禁：完整测试 → vue-tsc → 生产构建（测试失败即停止）
pnpm verify

# 共享弹窗顺序、取景框宽度、非法 tag 不再派生更新日志错误
pnpm exec vitest run src/styles/__tests__/shared-chrome.spec.ts tools/release-tag.spec.ts src/components/ai/__tests__/relay-base-url-lock.spec.ts
```

新增模板会随 [模板注册表](<../src/components/preview/template-registry.ts>) 自动进入 [导入渲染契约测试](<../src/components/preview/__tests__/import-template-contract.spec.ts>)。它验证内容语义，不锁定排版截图；GPA 仅约束已有展示能力的 AI Agent 模板，不凭测试给其他模板扩需求。

## 发布检查及其权限边界

- [Quality workflow](<../.github/workflows/quality.yml>) 在向 `dev` / `master` 提 PR、推送 `dev`、手动触发时运行 `pnpm verify`。
- [Pages workflow](<../.github/workflows/deploy-pages.yml>) 在实际部署 checkout 上重新运行 `pnpm verify`，失败不能上传/部署该产物；并不依赖另一条 workflow 的旧结果。
- 本地使用与 CI 一致的 Node ≥ 22.13.0、pnpm 10.30.2；CI 固定 Node 22.13.0，锁文件安装。
- `dev` / `master` 的分支保护要求走 Pull Request、禁止强制推送与删除分支，并把 `Tests and build` 作为必须通过的检查；不强制人工审批人数。保护是仓库设置，不随文件提交自动生效，管理员仍可绕过。是否生效以仓库 Branches 设置为准，未核实不要声称已禁止绕过。流程见 [CONTRIBUTING.md](<../CONTRIBUTING.md>)。
- 这套检查能拦截已编码的回归，不能保证所有浏览器路径可用。提交时依 [PR 模板](<../.github/pull_request_template.md>) 记录手工验证与未覆盖项。

## 后续复盘如何避免假结论

固定时区和起止时间，按 SHA 去重，合并提交单列；用 diff/行为而非 `fix` 标题计问题。高频文件仅是调查线索，纯抽取、改名、测试提速不自动算 Bug。区分 Git revert、reflog 指针同步、产品保存失败回滚；不能从 `reset: moving to HEAD` 推断发生了事故。明确历史提交、当前已提交代码、未提交工作三个状态，不能用当前修复后的工作树为历史正确性背书。没有部署日志、会话记录、工时证据时，不编造线上事故数量或浪费时长。
