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

### 8. 页数只有一份权威

页数由 `ResumeCanvas` 测量后通过 `previewPageMetricsKey` 发布，主题面板消费同一份。
**全屏预览故意不发布**，避免两份画布互相覆盖。

不要新增第二套 DOM 估算——历史上出现过「标签说 2 页、画布上一条破页线都没有」。

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

### 12. 本地目录授权只能在用户手势里申请

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
