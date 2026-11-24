# 最近三十天 Bug、返工、回滚与重复修改复盘

> 结论：这 30 天没有 Git 回滚。重复成本集中在三条已经能拦住的缝上：导出其实是另一套渲染器、共享样式改完没有会失败的用例、测试里的路径和发布环境不是同一套。11 月 18 日已经写进规范的「跨模块契约」仍然成立，但挡不住这三条。

## 1. 口径与证据边界

- 时间：**2026-10-25 13:15:11 至 2026-11-24 13:15:11，Asia/Shanghai**。10 月 25 日到 11 月 10 日没有提交；上一条是窗口外的 [33bfbbf](https://github.com/Theproudcold/sea-resume/commit/33bfbbf)（2026-10-17）。
- 仓库：sea-resume。统计时已 `git fetch`。`origin/master` 为 `11e5e52`，`origin/dev` 为 `32eec49`。本地 `master` 停在 `f98fb58`，比远端少 9 个提交，工作区另有未提交的 `AGENTS.md`、索引和空的 `LESSONS.md`。那些未提交内容不计入已发布修复。
- 数据：`git log --all`、提交 diff、reflog、`gh run list` / 失败日志。没有生产遥测、会话记录或工时，**不能给出线上事故次数或浪费小时数**。
- 按 SHA 去重：**116 条提交 = 78 条非合并 + 38 条合并**。非合并标题：27 fix、15 feat、8 style、8 refactor、8 chore、6 docs、5 test、1 perf。标题不是 Bug 数。有提交的日子是 11-11（7）、11-14（18）、11-16（7）、11-17（14）、11-18（17）、11-24（15）。
- 11 月 15 日 09:40 至 11 月 18 日 09:40 的六条问题链已写在 [三天复盘](<2026-11-18-three-day-retrospective.md>)。下面只引用结论，不把那 72 小时再算一遍。
- 本次落地在从 `origin/dev` 建出的 `docs/30d-retrospective`（`.worktrees/docs-30d-retrospective`）。没有提交、推送或部署。

复核命令（只读）：

```sh
git log --all --since='2026-10-25T13:15:11+08:00' --until='2026-11-24T13:15:11+08:00' --format='%H %cI %s'
gh run list --limit 40
gh run view 43546585182 --log-failed
gh run view 44221148444 --log-failed
```

## 2. 回滚：窗口内没有

- 提交说明里没有 `revert`。可见的部署回滚 [439596a](https://github.com/Theproudcold/sea-resume/commit/439596a) 在 2026-10-15，不在本窗口。
- reflog 里的 `reset: moving to origin/master`、`reset: moving to HEAD`、rebase finish，是同步指针或整理尚未推送的提交。不能据此说代码被回滚或工作丢失。
- 保存失败后的主题恢复、撤销失败时保留编辑，是产品里的错误恢复，不是 Git 回滚。
- 38 条 merge 不是 38 次返工。同一改动沿功能分支、`dev`、`master` 走一遍，只算一条变化。

## 3. 真正重复付费的四条链

### A. 预览修完，导出仍错：两套渲染器

证据：[472cce3](https://github.com/Theproudcold/sea-resume/commit/472cce3)（作者时间 11:11）→ [f4c9331](https://github.com/Theproudcold/sea-resume/commit/f4c9331)（11:24）→ [38daa45](https://github.com/Theproudcold/sea-resume/commit/38daa45)（11:31），同日 [bbbcade](https://github.com/Theproudcold/sea-resume/commit/bbbcade)。

1. 先按浏览器行盒的空隙切页。这一步是对的，而且用例能在旧切点 1123 落进行盒时失败。
2. 导出仍削掉中文行尾。html2canvas 用拉丁字体度量表算基线，13px 中文实测大约低 3.5px。第二次提交加了 `0.3em` 余量。
3. 第三次才盖住另一种失败：截图高度取调用方传入值，布局变高时多出来的部分被静默裁掉。
4. 同日上午，`lab()` 让导出直接抛错。`fillStyle` 回读在 Chrome 里不会把现代颜色函数转成 sRGB，兜底等于没兜。

这四次不是同一行代码改了四遍。用户看到的都是「预览是好的，导出不是」。11 月 18 日上午刚写入的契约规则要求跨生产者/消费者，但没有写明导出引擎的字形、颜色和画布高度。

lab 颜色那次合并的 Quality / Pages 失败（[44222859691](https://github.com/Theproudcold/sea-resume/actions/runs/44222859691)、[44222986561](https://github.com/Theproudcold/sea-resume/actions/runs/44222986561)）日志仍是 relay 根路径断言，不是 `lab()` 修复本身失败。

### B. 共享样式改一次，下一处界面再付一次

证据：[048a021](https://github.com/Theproudcold/sea-resume/commit/048a021)（11-11）→ [ede2bef](https://github.com/Theproudcold/sea-resume/commit/ede2bef)（11-18）；[00ebe2a](https://github.com/Theproudcold/sea-resume/commit/00ebe2a) → [0dc207f](https://github.com/Theproudcold/sea-resume/commit/0dc207f)（同日约 19 分钟）；[5104d31](https://github.com/Theproudcold/sea-resume/commit/5104d31)（11-24）。

- 设计系统用 `margin: 0 auto !important` 抵掉 Element Plus 的垂直外边距。`align-center` 依赖的 auto 外边距被清成 0，flex 的默认 `stretch` 把弹窗拉到最大高度并贴顶。提交说明写了仓库内 9 个对话框都这样。从引入到发现隔了 7 天，触发点是新的头像框要在浏览器里看。修复没有测试。
- 取景框写死 260px，内容盒大约 238px，溢出变成横向滚动条。也没有测试。
- 11 月 24 日选项组被纵向 flex 拉成通栏，激活态只靠白底。这次补了样式断言，方向是对的。它说明「看一眼再改间距」还在发生，只是开始留锁。

[25bd34d](https://github.com/Theproudcold/sea-resume/commit/25bd34d) 只是加强版本历史的选中态，提交里没有缺陷描述，不计作返工。

### C. 测试写了一套环境，发布用的是另一套

证据：[774fdc4](https://github.com/Theproudcold/sea-resume/commit/774fdc4) 把 relay 包断言写成 `http://localhost:3000/ai-relay/relay.mjs`。生产代码用 `BASE_URL` 拼接，CI 里是 `/sea-resume/`。11 月 18 日 `pnpm verify` 进入 Quality 和 Pages 之后，这条例子连续打红两次发布：

| 运行 | 结果 | 实际失败 |
| --- | --- | --- |
| [44221148444](https://github.com/Theproudcold/sea-resume/actions/runs/44221148444) Quality、[44221152493](https://github.com/Theproudcold/sea-resume/actions/runs/44221152493) Pages | 失败 | 同上，期望根路径，实际命令含 `/sea-resume/ai-relay/relay.mjs` |
| [44222859691](https://github.com/Theproudcold/sea-resume/actions/runs/44222859691)、[44222986561](https://github.com/Theproudcold/sea-resume/actions/runs/44222986561) | 失败 | 仍是这一条；当时合入的是 lab 颜色修复 |
| [1adbe9e](https://github.com/Theproudcold/sea-resume/commit/1adbe9e) 之后的 Quality / Pages | 通过 | 只改了测试 |

门禁做了它该做的事。代价是：一个只在根路径成立的断言，挡住了两次与它无关的发布。

### D. 11 月 14 日：功能先进入会部署的分支，类型检查随后才绿

[9e917f3](https://github.com/Theproudcold/sea-resume/commit/9e917f3) 及同一批功能在 10:23–10:24 提交。Pages [43546585182](https://github.com/Theproudcold/sea-resume/actions/runs/43546585182) 于 10:29 在 `vue-tsc` 失败（`EditorPanel.vue`、`ProjectEditor.vue`、两份测试的类型）。[c879b04](https://github.com/Theproudcold/sea-resume/commit/c879b04) 在 10:37 补上。部署没有成功，所以这不是一次线上回滚；它是一次已经推上去的失败构建。

同一分钟里还有一批修复（cmap 子表长度、创意模板多余的 `>`、自定义联系方式未遮盖、记住密钥时误删、PDF 两种识别都失败后无法重选文件等）。cmap 的错误代码能追溯到当天的 [801412b](https://github.com/Theproudcold/sea-resume/commit/801412b)。它们是同一次落地的补丁层，不是十次独立的线上事故。当时部署 workflow 只跑构建、不跑测试，类型错误要等 Pages 才出现。这件事已经被 11 月 18 日的 `pnpm verify` 接住，不另造一套门禁。

## 4. 不当成返工的部分

- 11 月 11 日 6 条 style 是 Cobalt 换肤，一次提交簇，不是修了又改。
- 11 月 16–17 日的导入字段、隐藏状态、页数 provider、混合提交和字体 mock，结论仍以三天复盘为准。provider 已在 [a6c8e53](https://github.com/Theproudcold/sea-resume/commit/a6c8e53) 抬到 `Editor.vue`。`EditorLayout` 的测试仍 stub 了预览画布，只能证明父组件把注入传了下去，不能证明真实页数。
- 11 月 24 日的版本历史、声明式版式、v1.0.0 / v1.0.1 是功能与发版，不是事故。发版脚本在 [2de56e5](https://github.com/Theproudcold/sea-resume/commit/2de56e5) 后 3 分钟由 [3b91794](https://github.com/Theproudcold/sea-resume/commit/3b91794) 收紧：非法 tag 不再拼一条无意义的 CHANGELOG 错误。Quality 两次都是绿的，因为没有用例。这是验证不足，不是发布失败。
- 高频文件（`Workbench.vue` 8 次、`AiPdfImportDialog.vue` 7 次、`ThemeEditor.vue` 7 次）只说明这些表面在迭代。没有逐文件证明每一次都是同一缺陷的返工。
- 11 月 24 日被取消的 Quality 运行，标题写着「探测分支保护，不应进入历史」，不计作失败。

## 5. 根因

| 根因 | 证据 | 还会再付什么 | 可信度 |
| --- | --- | --- | --- |
| 导出引擎和浏览器不是同一个排版器 | 切页三连、`lab()` 回读 | 预览正确、PDF 缺字或缺页 | 高 |
| 共享 CSS 覆盖没有失败用例 | 弹窗贴顶隔了 7 天才发现；取景框当天再改宽度 | 下一个对话框或固定像素框 | 高 |
| 测试路径写死为站点根 | 两次 Quality + 两次 Pages，同一条断言 | 无关发布被挡住 | 高。日志已核对 |
| 会部署的提交还没过类型检查 | 11 月 14 日 Pages 的 `vue-tsc` | 今天的部署 workflow 会先跑 `pnpm verify` | 高。后续是否再出现，这次没有新日志 |
| 跨模块契约只测到一半 | 三天复盘；联系方式仍按模板单修 | 数据在、某一套模板不显示或不省略 | 高。视觉部分尚未跨模板锁定 |

不能从这些提交推出：某人能力不足、AI 必然导致返工、所有重构都是浪费、或者一个精确的线上 Bug 个数。

## 6. 这次写入了什么

没有新建 Skill，也没有新建 `.cursor/rules`。11 月 18 日已经规定：仓库契约放在 `AGENTS.md` 和验证矩阵里，避免同一条约定维护三份。

| 措施 | 载体 | 拦住什么 |
| --- | --- | --- |
| 预览/导出、共享样式、路径与发版校验三行 | [变更安全](<../change-safety.md>)、[AGENTS.md](<../../AGENTS.md>)、[PR 模板](<../../.github/pull_request_template.md>) | 再把浏览器几何或根路径绿当成导出和发布完成 |
| 弹窗顺序与取景框宽度 | [shared-chrome.spec.ts](<../../src/styles/__tests__/shared-chrome.spec.ts>) | `margin` 顺序被调换、260px 写死 |
| 非法 tag 不派生 CHANGELOG 错误 | [release-tag.spec.ts](<../../tools/release-tag.spec.ts>)，`identityProblems` 可单测；直接运行脚本时行为不变 | 3b91794 那种补丁再丢一次 |
| relay 断言不得写回根路径 | [relay-base-url-lock.spec.ts](<../../src/components/ai/__tests__/relay-base-url-lock.spec.ts>) | 11 月 18 日那条 CI 失败复现 |
| 事实记录 | [LESSONS.md](<../../LESSONS.md>) | 联系方式仍是开放项；已转入规范的不在开放列表重复 |

联系方式没有做成「扫描所有模板禁止 nowrap」的脚本。日期本来就要单行，扫源码会把正确样式打红。这条留在经验文件里，满 3 个日期再决定要不要进规范。

## 7. 验证

- 工作树执行 `pnpm install --offline --frozen-lockfile`，成功，未下载新版本。pnpm 10.30.2。安装提示忽略了 `@parcel/watcher`、`core-js`、`vue-demi` 的构建脚本，未为此改依赖。
- 新增 6 项用例锁的是已经修好的行为，不是先把生产代码改回错误再修一遍。旧的 `margin` 顺序、写死的 `width: 260px`、非法 tag 仍查 CHANGELOG、根路径 relay 断言都会让这 6 项失败。
- **`pnpm verify` 退出码 0**：120 个测试文件、747 项测试通过；`vue-tsc -b` 与生产 `vite build` 通过（本次 Vite 1.79s，只是本机读数）。
- 非阻断告警：Browserslist 数据过旧、部分 chunk 超过 500kB、PDF.js 的 Node legacy 提示，以及失败路径测试预期的 disk full / 无效 JSON 日志。未为消告警升级依赖。
- 未跑真实浏览器。jsdom 通过不能写成弹窗位置或 PDF 页缝的视觉验收。
- 未再复现三天复盘里的「全量备份重建条目时丢掉 `visible`」：当前 `validateResumeData` 是就地断言，本窗口没有新的修复提交，不把它写成这 30 天的新事故，也不把它写成已经关闭。

## 8. 下一轮看什么

不看新增了几条规范。看这三件事还有没有：

1. 预览正确之后，导出是否又补一刀切页、颜色或截图高度。
2. 共享样式的修复是否又没有失败用例。
3. Quality 或 Pages 是否再被一条与本次改动无关的路径断言挡住。
