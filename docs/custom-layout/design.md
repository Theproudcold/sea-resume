# 自定义版式

用户可以基于六套内置模板，调整栏数、侧栏、页眉、标题和纸色，再把这份版式另存、导出或套到别的简历上。套用只改排版和主题，不替换经历、项目和联系方式。

## 数据

- 版式是 `LayoutRecipe`（`schemaVersion: 1`），只含枚举、白名单字体、`#RRGGBB` 和有界数字，不接受 CSS 或 HTML。
- 已套用的简历把配方存在 `ResumeData.layout`。`templateId` 写成 `layout:<库 id>` 只用于模板库识别。
- 字号、边距和强调色套用后写入 `theme`。之后预览、PDF 和一页适配都读 `theme`，不回写配方里的这些值。
- 模板库存在 `localStorage` 键 `sea-resume_layout-templates`，最多 30 条，和内容模板分开。删除库条目不影响已经嵌进简历的配方。
- 导出文件 `kind` 为 `sea-resume-layout`。版本不是 1 时整份拒绝。

## 渲染

有合法 `layout` 时，编辑预览、全屏预览、模板库缩略图、工作台封面和可搜索 PDF 都走同一份配方。没有配方时仍用原来的内置 Vue 模板和 PDF 版式。从内置模板点「基于当前模板自定义」后，预览会改用统一渲染器，细节可能和原模板不同，可以撤销。

## AI

快捷助手和外部 AI 用 `set_layout` 提交一份完整配方，或用 `null` 清除自定义版式。提示词要求：只有用户提到排版时才改版式；只点名现成模板时用 `set_template`；改结构或字号时复制当前 `layout`，没有时复制 `layoutSeed`，只改被提到的字段。配方里的字号、边距和强调色会写回简历主题。`set_template` 仍只接受六套内置 id，并会清掉 `layout`；外部 AI 不能使用 `set_template` 和 `reorder_sections`。岗位优化流程不改版式。
