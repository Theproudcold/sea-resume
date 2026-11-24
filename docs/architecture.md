# 架构与隐性契约

这份文档记录**代码里看不出来、但改错就会出 bug 的东西**。功能说明看 [README](../README.md)，视觉规范看 [design.md](../design.md)；这里只写新接手的人必须知道、却没有任何注释会主动告诉他的约定。

如果某条约定失效了，请直接改这份文档——它比代码更容易保持诚实。

## 数据流总览

```
                      ┌──────────────────────────┐
   工作台 / 模板库 ───▶│ stores/workbench.ts       │──┐
                      │  resumeList: ResumeMeta[] │  │
                      └──────────────────────────┘  │
                                                    ▼
   编辑器 ───────────▶┌──────────────────────────┐  ┌─────────────────────────┐
   views/Editor.vue   │ stores/resume.ts          │─▶│ services/storage/        │
                      │  data: ResumeData（活草稿）│  │  StorageManager（单例）   │
                      └──────────────────────────┘  │   ├ LocalStorageAdapter  │
                                                    │   └ FileSystemAdapter    │
   预览 ─────────────▶ components/preview/*.vue     └─────────────────────────┘
```

两条链路的**唯一真相**分别是：

- 编辑中的简历：`useResumeStore().data`（内存里的活草稿）
- 列表索引：`useWorkbenchStore().resumeList`（只读索引，不读正文）

## 不变量（改代码前先确认不会破坏）

### 1. 简历写入只有一个入口

`storageManager.saveResume(data)` 会自己从正文派生 `ResumeMeta`（`metaFromResume`）。
**不要手工拼 `ResumeMeta` 再调 `save(data, meta)`**——列表只读索引、不读正文，漏掉一个索引字段（例如岗位版本信息）就会变成「只有某个入口才出现的缺陷」。

`save(data, meta)` 保留给存储迁移使用：迁移必须原样搬运源索引，不能按正文重新推导。

### 2. 写入后不需要整表重读

`workbenchStore` 的增删改会本地 `upsertMeta` / `removeMeta`。
只有**外部改动**才需要 `refresh()`：切换存储位置、全量备份恢复。

### 3. 读盘一定经过归一化

`StorageManager.read()` 内部调 `normalizeResumeData`，保证历史数据缺字段时也拿到完整结构。
如果你绕过 `storageManager` 直接读存储，就绕过了这层保护。

### 4. 编辑中的简历可能正在被写入

`resumeStore.autoSave` 有两级定时（500ms 防抖 / 2000ms 上限）并串行化成队列：

- `scheduleSave()` 只安排，不等待
- `autoSave(background)` 真正写盘；后台写会被更新的写取代
- `flushSave()` 是屏障，用于 **离开页面前** 和 **导出前**

**任何要读稳定数据的操作（导出、备份、切简历）都必须先 `flushSave()`**，否则会读到未落盘的旧数据。

### 5. 撤销/重做与写入的竞争

`undo()` / `redo()` 失败时**只在数据未被并发修改的前提下**回滚（比较 `data` 引用与 `saveGeneration`）。
不要简化掉这个判断：写盘失败期间用户继续编辑时，回滚会把新编辑一起吞掉。

### 6. `EditorContentHost` 的 KeepAlive 与「草稿简历」防护

`EditorPanel` 用动态生成的组件名（`EditorContent_<resumeId>_<sectionId>`）喂给 `<KeepAlive :include>`，
这样切模块时不重建富文本编辑器。

由此产生一个必须遵守的约定：**被缓存的编辑器实例在切换简历后仍会派发异步事件**。
`EditorContentHost` 因此在 setup 时捕获当时的 `resumeId`，只在 ID 仍匹配时才向外 emit。
新增编辑器组件时不要绕过这层 `isCurrentResume` 判断。

### 7. `activeSection` 是浮空 ID

模块可以被「移出」（从 `sectionOrder` 拿掉）而不删除数据，因此 `resumeStore.activeSection`
可能指向一个当前不在顺序里的 ID。回落到 `'basic'` 的逻辑在
`EditorPanel.vue` 的 watch 里，不要假设 `activeSection` 一定有效。

### 8. 分页只有一份权威，而且切点由内容决定

页数由 `ResumeCanvas` 测量后通过 `previewPageMetricsKey` 发布，主题面板消费同一份。
**全屏预览故意不发布**，避免两份画布互相覆盖。

不要新增第二套 DOM 估算——历史上出现过「标签说 2 页、画布上一条破页线都没有」。

破页线位置与导出 PDF / 图片的切页位置都来自 `utils/pageBreaks.ts` 的 `measurePageBreaks`：
它把文本行盒、替换元素和带边框/底色的盒子当成「不可切开的内容带」，切点只在内容之间的
空隙里选，尽量靠近页底但绝不越过页高。**不要再按 `canvasWidth × 297/210` 机械等分长图**：
A4 是定尺纸张、预览是连续长图，等分必然把正好压线的文字印成两半（上一页留字头、下一页
留字尾），用户看到的就是「导出后截断、和预览不一致」。

注意两个测量细节，改动前先确认：

- `Range.getClientRects()` 返回的是字体内容区（ascent + descent），比行盒矮，必须按父元素
  `line-height` 补上下半个行距；字形墨迹会画到行盒边缘。
- `DOMRect` 的字段挂在原型上，`{...rect}` 得到的是空对象——曾经因此丢掉所有行盒，
  表现为「内容带只剩装饰盒」。

### 9. AI 请求的四个前置条件

`aiWorkspace.authorized()` 与 `interview.canRequest()` 都要求同时满足：

1. 用户已勾选同意发送范围
2. API Key 可用（会话 Key 或已记住到本机）
3. **服务商 / 模型与本次会话开始时一致**
4. 会话未过期

第 3 条意味着用户中途改模型后必须重新走确认流程，这是有意为之。

### 10. 凭据不进 store 状态

`interview` 与 `aiWorkspace` 把 `AiProviderConfig` 存在**模块闭包变量**里，不放进 Pinia state。
生成记录时会剥掉密钥（`withoutAiSecrets`）。不要把 provider 配置挪进 state。

### 11. 存储只有两种实现

`StorageType` 只包含 `local_storage` 与 `file_system`。
`createAdapter` 用穷尽检查（`const unknown: never = type`），
新增类型时如果忘了适配器会**编译失败**，而不是运行时抛错。

### 12. 自定义版式嵌入简历，不跟随模板库

`ResumeData.layout` 存在时，预览、封面、模板缩略图和可搜索 PDF 都读这份配方，不再按 `templateId` 找内置组件。没有 `layout` 的旧简历仍走六套内置模板。

切回任意内置模板必须删掉 `layout`，否则旧配方会一直盖住内置组件。套用版式只替换排版和当时的主题 token，不替换正文。模板库里删除版式，不会改写已经嵌进简历的配方。

版式只接受枚举、`#RRGGBB` 和有界数字。应用内快捷 AI 与外部 AI 都用 `set_layout` 修改它，并拿到当前配方或内置种子作为完整底稿；非法配方在解析时拒绝。应用后，配方里的字号、边距和强调色写回 `theme`。外部 AI 仍不能用 `set_template` 或 `reorder_sections`。

### 13. 外部 MCP 的「已启动」不等于「已连接」

`startExternalAiBridge` 返回时，页面只是加载完同源宿主和上游 embed，状态是 `waiting`。
`connected` 只来自上游 widget 在 `hello/accepted` 后发出的 `sea-resume.relay` 消息；
连接关闭或进入两分钟一次的休眠探测时是 `reconnecting`。宿主页只接受自己那个隐藏 frame、
且来源等于本站的消息。停止桥接必须同时拆掉 frame 和这条监听，不能让旧连接继续改新会话的状态。

MCP 连接挂在简历主页，离开页面后仍保持，直到用户停止。`sea_resume_list`、`get`、`set`、`create`、`delete` 操作当前存储里的全部简历。正在编辑的简历走 `importData`，其余直接 `saveResume` 并更新列表。删除正在编辑的简历时先 `discardOpenResume`，阻止自动保存把它写回。文件交换仍使用草稿和人工确认。

### 14. 本地目录授权只能在用户手势里申请

`reauthorizeFileSystem` / `showDirectoryPicker` 必须在点击回调的同步路径中调用，
否则浏览器不弹授权框。不要把它包装进 `setTimeout` 或 `await` 之后的逻辑。

## 已知的历史包袱

| 位置 | 说明 |
| --- | --- |
| `ResumeData.sectionOrder` + `sectionTitles` + `customBlocks[].title` | 模块顺序、可见性与标题分散在三处，`sectionTitles` 用同一索引签名混装标准模块与自定义模块 ID。归一化入口是 `normalizeResumeData`，重构请从那里切入。 |
| `FileSystemAdapter` | 同时支持当前 manifest 布局与旧版单文件索引，首次写入时把旧布局复制成新布局（旧文件保留）。 |
| `utils/capture-colors.ts` | 为绕开 html2canvas 不支持 `oklch()/oklab()` 而手写的颜色转换，只在导出 PDF / 图片时使用。 |
| `utils/` 目录 | 混装了通用工具、领域规则、浏览器桥接与导出实现，按「是否含业务知识」拆分是后续工作。 |

## 验证方式

```sh
pnpm test     # 89 个测试文件；测试本身就是目前最完整的架构说明
pnpm build    # vue-tsc -b && vite build
```

改动存储、保存时序或编辑器布局前，先读对应的测试：
`src/stores/__tests__/resume-save-scheduler.spec.ts`、
`src/components/editor/__tests__/EditorPersistence.spec.ts`、
`src/utils/__tests__/editorLayout.spec.ts`。
