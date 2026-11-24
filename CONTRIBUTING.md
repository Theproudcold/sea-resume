# 贡献与协作规范

`master` 是稳定可发布的主分支。新功能、修复和重构都从 `dev` 切出功能分支，用 Pull Request 合入；不要在 `master` 或 `dev` 上直接改代码。

本文件随仓库分发，与代码使用同一套 Git 历史。给代理与自动化工具的简短约定在 [AGENTS.md](AGENTS.md)，两处冲突时以本文件为准。

## 分支

| 分支 | 从哪里切 | 合入哪里 | 用途 |
| --- | --- | --- | --- |
| `master` | — | 只接受来自 `dev` 的发布 PR，以及 `hotfix/*` 的紧急修复 PR | 稳定可发布。推送会触发 GitHub Pages 部署 |
| `dev` | — | 接受功能分支的 PR；紧急修复合入 `master` 后再同步回来 | 日常集成与验证 |
| `<type>/<short-name>` | `dev` | `dev` | 新功能、普通修复、重构、文档与构建改动 |
| `hotfix/<short-name>` | `master` | 先 `master`，再同步 `dev` | 线上紧急修复 |

`type` 与提交类型一致：`feat`、`fix`、`refactor`、`test`、`docs`、`chore`、`perf`、`build`、`ci`、`style`、`revert`。说明用小写、短横线连接的英文短语，例如 `feat/ai-relay`、`fix/pdf-font-subset`、`docs/git-workflow`。

不要直接向 `master` 或 `dev` 推送提交。这两个分支禁止强制推送，也禁止改写已推送的历史。功能分支只在确认尚未推送、或已与协作者约定后，才整理历史。

## 新功能

```sh
git switch dev
git pull --ff-only
git switch -c feat/short-name
```

1. 小步提交，标题遵守下面的提交信息。
2. 在最终内容上运行 `pnpm verify`（完整测试、类型检查、生产构建；Node ≥ 22.13.0、pnpm 10.30.2）。
3. 对齐 `dev`，冲突在功能分支内解决：

```sh
git fetch origin
git rebase origin/dev
git push -u origin HEAD
```

4. 打开指向 `dev` 的 Pull Request，按模板写明变更目的、验证和回退方式。
5. 等待 `Tests and build` 通过后，用 **Create a merge commit** 合入。不要用 Squash 或 Rebase 合并，以便保留特性边界。
6. 合入后删除功能分支（本地与远端）。

并行开发用 `git worktree`（例如 `.worktrees/<分支名>`），不要在同一工作区反复切换分支。

## 发布

`dev` 上验证通过后，开一个 `dev` → `master` 的 Pull Request。同样等待 `Tests and build`，并用 merge commit 合入。合入即推送 `master`，会触发部署；部署 workflow 会在实际部署的提交上再次运行 `pnpm verify`。

## 紧急修复

```sh
git switch master
git pull --ff-only
git switch -c hotfix/short-name
```

修复并跑过 `pnpm verify` 后，先向 `master` 提 PR。合入后再向 `dev` 提一个同步 PR（或将合入后的 `master` 合入 `dev`），避免修复在开发分支上丢失。

## 提交信息

标题：`<type>(<中文范围>): <中文说明>`

例如：`feat(编辑器): 支持恢复章节状态`

- 范围与说明用简体中文；技术名词、产品名和代码标识符可保留原文。
- 标题简洁、说明明确，末尾不加标点。
- 按实际改动选类型，不要把非功能改动统称为 `feat`。
- PR 的合并提交写作 `merge(<中文范围>): <中文说明>`。GitHub 默认会用 PR 标题作为合并说明，合入前把标题改成这个格式，或在合并框里改掉。

## Pull Request

- 一个 PR 只做一件可独立验证、可撤回的事。无关修复另开分支。
- 普通改动的目标分支是 `dev`；发布的目标分支是 `master`，来源分支是 `dev`。
- 按 [.github/pull_request_template.md](.github/pull_request_template.md) 填写。修 Bug 要写出修复前失败、修复后通过的结果；不是 Bug 就写明不适用，不要编造。
- 自动检查只覆盖已编码的回归。涉及界面、字体、输入法或布局时，在 PR 里记录真实浏览器验证；没做到就写明阻断项。

## 仓库保护

`master` 与 `dev` 的 GitHub 分支保护要求：

- 必须通过 Pull Request 合入，不能直接推送。
- 合入前 `Tests and build` 必须通过（[Quality workflow](.github/workflows/quality.yml)）。
- 禁止强制推送，禁止删除分支。
- 不强制人工审批人数：仓库可以由作者自己合入，但仍要走 PR。
- 管理员可以绕过保护。绕过不是正常流程，不要把「保护已开启」说成「无法绕过」。

分支保护是 GitHub 仓库设置，不会随本文件的提交自动生效或撤销。当前是否生效，以仓库的 Branches 设置为准。
