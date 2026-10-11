# Sea Resume UI 样式与交互约定

本文约束应用界面（工作台、模板库、编辑器和应用弹层），不约束五种简历文档模板的排版与用户主题。

## 1. 设计 token

在 `src/styles/main.scss` 的 `:root` 中定义并优先使用以下 token；扩展 token 时同步 Tailwind 语义色：

- **品牌/状态：** `--ui-primary`、`--ui-primary-hover`、`--ui-success`、`--ui-warning`、`--ui-danger`、`--ui-info`
- **表面/文字：** `--ui-bg-page`、`--ui-bg-surface`、`--ui-bg-subtle`、`--ui-bg-elevated`、`--ui-text-main`、`--ui-text-secondary`、`--ui-text-muted`、`--ui-border`
- **排版：** `--ui-font-xs` 至 `--ui-font-xl`、`--ui-font-title`、`--ui-line-height`
- **结构：** `--ui-space-*`、`--ui-radius-*`、`--ui-shadow-*`、`--ui-content-max-width`、`--ui-page-gutter`、`--ui-control-height`

避免在应用 UI 中新增孤立的 hex 色值、阴影、圆角和间距。简历模板中的色值可由模板设计或 `data.theme` 控制，不能机械替换为应用 token。

## 2. 页面头部与导航

使用 `src/components/common/AppHeader.vue` 作为共享页面头部：

- 必填页面标题，可选副标题、返回操作和状态上下文；品牌标记始终位于身份区最前，返回操作放在标题副标题行。
- 页面主/次操作放在 `#actions` 插槽；编辑器等操作密集页可用 `#toolbar` 承载上下文工具，避免操作挤压标题或在全局顶栏意外换行。
- 工作台、模板库和编辑器保持同一品牌标记、内容宽度、边距、标题字号和操作样式；工具栏仅在有对应页面工具时显示。
- 移动端 768px 及以下允许操作区换行；1024px 及以下是编辑器从双栏切换为编辑/预览 Tab 的布局边界。

## 3. 内容、表单与卡片

- 页面容器使用 `--ui-content-max-width` 和 `--ui-page-gutter`。
- 模块卡、设置分区和输入表单使用统一 surface、border、radius 与间距 token。
- 相同编辑条目使用 `resume-entry-card` 和 `resume-entry-card__header`；同类空状态使用 `resume-editor-empty`。
- 重要操作使用 Element Plus 主/危险状态；仅图标按钮必须有可访问名称。
- 依赖 hover 的操作应在键盘 focus 和触屏下仍可发现；交互应有可见 focus 状态。

## 4. 弹层与状态

- 弹层使用响应式宽度，如 `min(760px, calc(100vw - 32px))`，长内容在弹层内部滚动，footer 操作可换行。
- footer 使用 `app-dialog-actions`；手机端主操作保持可见且按钮不溢出视口。
- 加载、成功、警告、错误、无内容和取消状态复用 Element Plus 状态色与全局语义 token。
- 导入必须保留预览/警告/取消路径；JSON 恢复是创建副本，Markdown 导入创建新简历。
- 全局数据清空必须放入 `ui-danger-zone` 并明确说明作用范围及不可恢复；重置当前简历不能使用“清空所有数据”等表述。
- AI 请求前必须显式同意；API Key 只保留在当前会话；变更审核、应用和撤销状态要清楚区分。

## 5. 响应式和简历文档边界

- 主要断点：`768px`（手机/窄屏交互）、`1024px`（编辑器工作区和模板网格切换）。如新增其他断点，应有明确内容布局依据。
- 模板预览的横向滚动应限制在预览容器中，不让整个页面横向溢出。
- `#resume-canvas` 始终保持 A4 尺寸和打印分页规则；应用头部/表单/弹层的 CSS 不得进入成品简历。
- 五种模板的独特布局、字体、色彩和简历主题选项保持独立。

## 6. 验收检查清单

- 在 1440px、1024px、390px 检查工作台、模板库和编辑器；页面无意外横向溢出。
- 主流程：工作台（空/非空）新建简历 → 模板预览 → 创建；编辑器进入模板库 → 应用到当前简历 → 返回编辑器。
- 导入/设置：Markdown 预览、警告、取消、确认创建；JSON 恢复副本；存储切换；全局清空确认明确。
- AI：无同意不可请求、请求错误可见、diff 可拒绝/应用、直接应用明确为可选、撤销可用。
- 键盘可操作标题编辑、颜色预设、卡片菜单、筛选与弹层操作；focus 可见；`prefers-reduced-motion` 生效。
- 对五种模板验证屏幕预览、浏览器打印及 PDF/图片导出，确认应用 UI 不污染 A4 文档。
