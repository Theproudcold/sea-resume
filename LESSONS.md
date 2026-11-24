# 经验文件

本文件记录本项目的教训与值得照做的做法。Agent 每次开工前读取。

这里只记已经发生的事。与 [AGENTS.md](AGENTS.md)、[CONTRIBUTING.md](CONTRIBUTING.md)、[变更安全](docs/change-safety.md) 不一致时，以这些规范为准。

2026-11-18 复盘里已经写进上述规范的要求，不在这里重复。每轮测试、评审或验收结束后复盘一次，只把新出现的问题记在下面。没有值得记的就不记。

## 怎么记

- 只记三类问题：修完又返工的、不该合入的、验证不足的。做得对且值得照做的，标为 Done right。
- 每条只写一句规则，并附上出事的提交或 issue、修复提交、做对的例子，以及 `Seen N×（日期列表）`。
- 同类再次出现时，更新原条目的次数和日期，不另起新条。`Seen` 只计不同日期；同一天多次出现仍算一次。
- 同一条在 3 个不同日期出现后，提议写进项目规范。须用户批准后才写入。写入后从开放列表移除，并在「已转入规范」注明去向。

一条开放条目写成：

**一句规则。**

- 出事：提交或 issue
- 修复：提交；尚未修复则写明
- Done right：做对的例子；还没有则省略
- Seen 1×（YYYY-MM-DD）

## 修完又返工

暂无。

## 不该合入

暂无。

## 验证不足

**改联系方式的省略、折行或图标时，要把每套会画联系方式的模板都看一遍；只给出事的那一套加断言，下一套还会再修。**

- 出事：[8860d32](https://github.com/Theproudcold/sea-resume/commit/8860d32) 只锁住 AI Agent 模板的省略号；[426d6e6](https://github.com/Theproudcold/sea-resume/commit/426d6e6) 的用例检查 SVG 结构，不检查各模板里的视觉中心
- 修复：上述两处都修了自己的症状；跨模板的视觉契约还没有
- Seen 2×（2026-11-18、2026-11-24）

## Done right

**导出或样式修复在提交说明里写下「旧实现会失败」的断言，以及浏览器量到的数。**

- 例子：[8860d32](https://github.com/Theproudcold/sea-resume/commit/8860d32) 用内边距减半行距，改回 5px 会失败，并记下字形到下划线从 6.65px 到 16.5px；[472cce3](https://github.com/Theproudcold/sea-resume/commit/472cce3) 记录旧切点 1123 落在行盒内
- Seen 1×（2026-11-18）

**站点路径的测试跟生产代码用同一个 `BASE_URL`，生产代码已经正确时只改测试。**

- 例子：[1adbe9e](https://github.com/Theproudcold/sea-resume/commit/1adbe9e)。在此之前 [44221148444](https://github.com/Theproudcold/sea-resume/actions/runs/44221148444) 与 [44222986561](https://github.com/Theproudcold/sea-resume/actions/runs/44222986561) 因根路径断言阻断 Quality 和 Pages
- Seen 1×（2026-11-18）

## 已转入规范

**预览几何通过后，仍要按 html2canvas 的字形、颜色函数和截图高度再验导出。** 写入 [变更安全](docs/change-safety.md) 的「预览与导出」一行，以及 [AGENTS.md](AGENTS.md) 防返工一节。

- 出事：[472cce3](https://github.com/Theproudcold/sea-resume/commit/472cce3) 按浏览器空隙切页之后，仍需要 [f4c9331](https://github.com/Theproudcold/sea-resume/commit/f4c9331) 补字形下沉、[38daa45](https://github.com/Theproudcold/sea-resume/commit/38daa45) 在截图变矮时中止；同日 [bbbcade](https://github.com/Theproudcold/sea-resume/commit/bbbcade) 修 `lab()` 被 `fillStyle` 原样回读
- Seen 1×（2026-11-18）。未满 3 个日期。2026-11-24 复盘时用户要求把已能预防的共性问题直接写入规范，因此提前转入，不留在开放列表

**覆盖组件库布局的 `!important` 顺序，以及对话框里写死的像素宽度，都要有会失败的断言。** 写入同一矩阵的「共享样式覆盖组件库」一行，用例是 [shared-chrome.spec.ts](src/styles/__tests__/shared-chrome.spec.ts)。

- 出事：[048a021](https://github.com/Theproudcold/sea-resume/commit/048a021) 引入 `margin: 0 auto !important`，[ede2bef](https://github.com/Theproudcold/sea-resume/commit/ede2bef) 才修好且当时没有用例；[00ebe2a](https://github.com/Theproudcold/sea-resume/commit/00ebe2a) 写死 260px，[0dc207f](https://github.com/Theproudcold/sea-resume/commit/0dc207f) 当天改成 `min(100%, 260px)`，同样没有用例
- Done right：[5104d31](https://github.com/Theproudcold/sea-resume/commit/5104d31) 给选项组留白补了样式断言
- Seen 2×（2026-11-18、2026-11-24）

**非法 tag 不要再报一条由它拼出来的更新日志错误；站点 URL 断言使用 `BASE_URL`。** 写入矩阵「路径、发版校验」一行。用例是 [release-tag.spec.ts](tools/release-tag.spec.ts) 与 [relay-base-url-lock.spec.ts](src/components/ai/__tests__/relay-base-url-lock.spec.ts)。

- 出事：[2de56e5](https://github.com/Theproudcold/sea-resume/commit/2de56e5) 之后 [3b91794](https://github.com/Theproudcold/sea-resume/commit/3b91794) 补了判断，但没有用例；relay 根路径见上节 Done right
- Seen 2×（2026-11-18、2026-11-24）

**类型检查不过就不要推进会部署的 `master`。** 已由 `pnpm verify` 进部署 workflow 覆盖，见 [变更安全](docs/change-safety.md) 的发布检查。

- 出事：2026-11-14 Pages [43546585182](https://github.com/Theproudcold/sea-resume/actions/runs/43546585182)，`vue-tsc` 在 [9e917f3](https://github.com/Theproudcold/sea-resume/commit/9e917f3) 失败；[c879b04](https://github.com/Theproudcold/sea-resume/commit/c879b04) 约 8 分钟后补上类型
- Seen 1×（2026-11-14）
