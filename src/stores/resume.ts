import { defineStore } from 'pinia';
import type { LayoutRecipe, SavedRecipe } from '@/types/layout-template';
import type { ResumeData, BasicInfo, Experience, Education, Skill, CustomBlock, Project, ThemeConfig, CustomItem } from '@/types/resume';
import { storageManager } from '@/services/storage/StorageManager';
import { generateId } from '@/utils/helpers';
import { applyLayoutToResume, readLayoutRecipe } from '@/utils/layout-template';
import { syncCustomBlockTitle, withAlignedCustomBlockOrder } from '@/resume/sections';
import { createDefaultResumeData, normalizeResumeData } from '@/utils/resumeData';
import { cloneResume, rememberResumeSnapshot } from '@/utils/resumeSnapshot';
import { assertExternalBaseline, parseExternalProposal, previewExternalProposal } from '@/services/ai/externalProposal';
import { describeError } from '@/utils/globalErrorReporting';

const applyingProposals = new WeakSet<object>();

type SaveTimers = { debounce: ReturnType<typeof setTimeout>; maxWait: ReturnType<typeof setTimeout> };
const pendingSaveTimers = new WeakMap<object, SaveTimers>();
const saveQueues = new WeakMap<object, Promise<void>>();
const latestBackgroundSave = new WeakMap<object, object>();
const loadRequests = new WeakMap<object, number>();

export const useResumeStore = defineStore('resume', {
  state: () => ({
    data: createDefaultResumeData(),
    saveStatus: 'saved' as 'saving' | 'saved' | 'error',
    saveError: null as string | null,
    historyPast: [] as ResumeData[],
    historyFuture: [] as ResumeData[],
    historyLastAt: 0,
    saveGeneration: 0,
    isLoading: false,
    activeSection: null as string | null, // 当前选中的模块 ID
    appliedProposalIds: [] as string[],
    /** Set when MCP deletes the resume open in the editor, so autosave cannot recreate it. */
    discardedId: '',
  }),
  getters: {
    canUndo: (state) => state.historyPast.length > 0,
    canRedo: (state) => state.historyFuture.length > 0,
  },


  actions: {
    /** Only UI approval calls this action; external tools can never save directly. */
    async applyChangeProposal(input: unknown, assertAuthorized: () => void = () => undefined): Promise<void> {
      const proposal = parseExternalProposal(input);
      if (this.appliedProposalIds.includes(proposal.proposalId)) throw new Error('此草稿已应用，不能重复保存。');
      if (applyingProposals.has(this) || this.isLoading) throw new Error('正在处理简历，请稍后重试。');
      applyingProposals.add(this);
      try {
        assertAuthorized();
        const previous = cloneResume(this.data);
        const generation = this.saveGeneration;
        await assertExternalBaseline(previous, proposal);
        assertAuthorized();
        if (this.isLoading || this.saveGeneration !== generation || this.data.id !== previous.id || JSON.stringify({ ...this.data, updatedAt: '' }) !== JSON.stringify({ ...previous, updatedAt: '' })) {
          throw new Error('简历已发生变化，请重新检查草稿。');
        }
        const next = previewExternalProposal(previous, proposal);
        const past = [...this.historyPast];
        const future = [...this.historyFuture];
        this.historyLastAt = 0;
        this.rememberChange();
        this.data = next;
        const applied = this.data;
        const save = this.autoSave();
        const saveGeneration = this.saveGeneration;
        try {
          await save;
          this.appliedProposalIds.push(proposal.proposalId);
          if (this.appliedProposalIds.length > 200) this.appliedProposalIds.shift();
        } catch (error) {
          if (this.data === applied && this.saveGeneration === saveGeneration) {
            this.data = previous;
            this.historyPast = past;
            this.historyFuture = future;
            this.historyLastAt = 0;
          }
          throw error;
        }
      } finally { applyingProposals.delete(this); }
    },

    rememberChange() {
      const now = Date.now();
      if (!this.historyLastAt || now - this.historyLastAt > 700) {
        this.historyPast = rememberResumeSnapshot(this.historyPast, this.data);
        this.historyFuture = [];
      }
      this.historyLastAt = now;
    },

    startHistoryGroup() {
      this.rememberChange();
    },

    // 文本修改走 scheduleSave（500ms 防抖，最迟 2000ms）。
    // 增删、排序、显隐走 saveImmediately：后台写，可以被更新的写取代。
    // 离开页面、导出、切换简历走 flushSave：等到这一笔真正落盘。
    saveImmediately() {
      void this.autoSave(true).catch(() => undefined);
    },

    async undo() {
      const previous = this.historyPast.pop();
      if (!previous) return;
      const current = cloneResume(this.data);
      this.historyFuture.push(current);
      this.historyLastAt = 0;
      this.data = cloneResume(previous);
      const applied = this.data;
      const save = this.autoSave();
      const generation = this.saveGeneration;
      try {
        await save;
      } catch (error) {
        // A failed old write must not roll back edits made while it was pending.
        if (this.data === applied && this.saveGeneration === generation) {
          this.data = current;
          this.historyFuture.pop();
          this.historyPast.push(previous);
        }
        throw error;
      }
    },

    async redo() {
      const next = this.historyFuture.pop();
      if (!next) return;
      const current = cloneResume(this.data);
      this.historyPast.push(current);
      this.historyLastAt = 0;
      this.data = cloneResume(next);
      const applied = this.data;
      const save = this.autoSave();
      const generation = this.saveGeneration;
      try {
        await save;
      } catch (error) {
        if (this.data === applied && this.saveGeneration === generation) {
          this.data = current;
          this.historyPast.pop();
          this.historyFuture.push(next);
        }
        throw error;
      }
    },

    // ... existing actions ...

    // 更新主题配置
    updateTheme(theme: Partial<ThemeConfig>) {
      this.rememberChange();
      this.data.theme = { ...this.data.theme, ...theme };
      this.scheduleSave();
    },

    // 更新模块标题。自定义模块的 sectionTitles 只是旧副本，和 customBlocks.title 一起改。
    updateSectionTitle(section: string, title: string) {
      this.rememberChange();
      if (!this.data.sectionTitles) {
        this.data.sectionTitles = createDefaultResumeData().sectionTitles;
      }
      syncCustomBlockTitle(this.data, section, title);
      this.scheduleSave();
    },

    /**
     * 通过 ID 加载简历
     * @param id 简历 ID
     */
    async loadResume(id: string) {
      const requestId = (loadRequests.get(this) ?? 0) + 1;
      loadRequests.set(this, requestId);
      this.isLoading = true;
      try {
        if (pendingSaveTimers.has(this) || saveQueues.has(this) || this.saveStatus === 'error') {
          await this.flushSave();
        }
        if (loadRequests.get(this) !== requestId) return;

        const resume = await storageManager.read(id);
        if (loadRequests.get(this) !== requestId) return;
        if (!resume) throw new Error(`简历 ${id} 不存在`);

        // 旧简历可能缺少 theme 等新增字段，统一归一再交给界面渲染。
        this.data = normalizeResumeData(resume);
        this.discardedId = '';
        this.historyPast = [];
        this.saveGeneration += 1;
        this.activeSection = null;
        this.historyFuture = [];
        this.historyLastAt = 0;
        this.saveStatus = 'saved';
        this.saveError = null;
      } catch (error) {
        if (loadRequests.get(this) !== requestId) return;
        console.error(`加载简历 ${id} 失败:`, error);
        throw error;
      } finally {
        if (loadRequests.get(this) === requestId) this.isLoading = false;
      }
    },

    /**
     * 创建新简历
     * @param title 简历名称
     * @param templateId 模板 ID
     */
    createNew(title: string = '我的简历', templateId: string = 'modern') {
      this.data = createDefaultResumeData();
      this.data.title = title;
      this.data.templateId = templateId;
    },

    // 更新基础信息
    updateBasic(info: Partial<BasicInfo>) {
      this.rememberChange();
      this.data.basic = { ...this.data.basic, ...info };
      this.scheduleSave();
    },

    /**
     * 经历、教育、技能、项目是同一套列表操作。
     * 改 visible 立刻写；其余字段走防抖。找不到 id 时什么都不做。
     */
    changeEntries(
      key: 'experiences' | 'education' | 'skills' | 'projects',
      action:
        | { op: 'add'; item: object }
        | { op: 'update'; id: string; updates: object }
        | { op: 'remove'; id: string }
        | { op: 'reorder'; items: object[] },
    ) {
      const list = this.data[key];
      if (action.op === 'update') {
        const index = list.findIndex((item) => item.id === action.id);
        const current = list[index];
        if (!current) return;
        this.rememberChange();
        list[index] = { ...current, ...action.updates, id: current.id } as typeof current;
        if ('visible' in action.updates) this.saveImmediately();
        else this.scheduleSave();
        return;
      }
      this.rememberChange();
      const next = action.op === 'add'
        ? [...list, { id: generateId(), ...action.item }]
        : action.op === 'remove'
          ? list.filter((item) => item.id !== action.id)
          : action.items;
      if (key === 'experiences') this.data.experiences = next as Experience[];
      else if (key === 'education') this.data.education = next as Education[];
      else if (key === 'skills') this.data.skills = next as Skill[];
      else this.data.projects = next as Project[];
      this.saveImmediately();
    },

    addExperience(exp: Omit<Experience, 'id'>) {
      this.changeEntries('experiences', { op: 'add', item: exp });
    },
    updateExperience(id: string, updates: Partial<Experience>) {
      this.changeEntries('experiences', { op: 'update', id, updates });
    },
    removeExperience(id: string) {
      this.changeEntries('experiences', { op: 'remove', id });
    },
    reorderExperiences(newOrder: Experience[]) {
      this.changeEntries('experiences', { op: 'reorder', items: newOrder });
    },
    addEducation(edu: Omit<Education, 'id'>) {
      this.changeEntries('education', { op: 'add', item: edu });
    },
    updateEducation(id: string, updates: Partial<Education>) {
      this.changeEntries('education', { op: 'update', id, updates });
    },
    removeEducation(id: string) {
      this.changeEntries('education', { op: 'remove', id });
    },
    reorderEducation(newOrder: Education[]) {
      this.changeEntries('education', { op: 'reorder', items: newOrder });
    },
    addSkill(skill: Omit<Skill, 'id'>) {
      this.changeEntries('skills', { op: 'add', item: skill });
    },
    updateSkill(id: string, updates: Partial<Skill>) {
      this.changeEntries('skills', { op: 'update', id, updates });
    },
    removeSkill(id: string) {
      this.changeEntries('skills', { op: 'remove', id });
    },
    addProject(project: Omit<Project, 'id'>) {
      this.changeEntries('projects', { op: 'add', item: project });
    },
    updateProject(id: string, updates: Partial<Project>) {
      this.changeEntries('projects', { op: 'update', id, updates });
    },
    removeProject(id: string) {
      this.changeEntries('projects', { op: 'remove', id });
    },
    reorderProjects(newOrder: Project[]) {
      this.changeEntries('projects', { op: 'reorder', items: newOrder });
    },

    // 添加自定义模块
    addCustomBlock(block: Omit<CustomBlock, 'id'>): string {
      this.rememberChange();
      const id = generateId();
      const newBlock: CustomBlock = { id, ...block };
      this.data.customBlocks.push(newBlock);
      this.saveImmediately();
      return id;
    },

    // 更新自定义模块
    updateCustomBlock(id: string, updates: Partial<CustomBlock>) {
      const index = this.data.customBlocks.findIndex((b) => b.id === id);
      if (index !== -1) {
        this.rememberChange();
        this.data.customBlocks[index] = { ...this.data.customBlocks[index], ...updates } as CustomBlock;
        if (typeof updates.title === 'string') this.data.sectionTitles[id] = updates.title;
        if ('type' in updates) this.saveImmediately();
        else this.scheduleSave();
      }
    },

    // 删除自定义模块
    removeCustomBlock(id: string) {
      this.rememberChange();
      this.data.customBlocks = this.data.customBlocks.filter((b) => b.id !== id);
      this.saveImmediately();
    },

    // --- 自定义模块内部条目操作 ---

    // 添加条目
    addCustomItem(blockId: string, item: Omit<CustomItem, 'id'>) {
      const block = this.data.customBlocks.find(b => b.id === blockId);
      if (block) {
        this.rememberChange();
        if (!Array.isArray(block.content)) {
          block.content = [];
          block.type = 'list';
        }
        (block.content as CustomItem[]).push({ id: generateId(), ...item });
        this.saveImmediately();
      }
    },

    // 更新条目
    updateCustomItem(blockId: string, itemId: string, updates: Partial<CustomItem>) {
      const block = this.data.customBlocks.find(b => b.id === blockId);
      if (block && Array.isArray(block.content)) {
        const itemIndex = block.content.findIndex(i => i.id === itemId);
        if (itemIndex !== -1) {
          this.rememberChange();
          block.content[itemIndex] = { ...block.content[itemIndex], ...updates } as CustomItem;
          if ('visible' in updates) this.saveImmediately();
          else this.scheduleSave();
        }
      }
    },

    // 删除条目
    removeCustomItem(blockId: string, itemId: string) {
      const block = this.data.customBlocks.find(b => b.id === blockId);
        this.rememberChange();
      if (block && Array.isArray(block.content)) {
        block.content = block.content.filter(i => i.id !== itemId);
        this.saveImmediately();
      }
    },

    // 设置当前选中模块
    setActiveSection(id: string | null) {
      this.activeSection = id;
    },

    // 切换模板。内置模板和自定义版式互斥：切回内置 id 必须清掉嵌入版式，否则旧配方会一直盖住组件。
    setTemplate(templateId: string) {
      this.rememberChange();
      this.data.templateId = templateId;
      delete this.data.layout;
      this.saveImmediately();
    },

    /** 只改当前简历的版式，不改正文。字号和强调色仍以套用后的 theme 为准。 */
    updateLayout(recipe: LayoutRecipe) {
      const layout = readLayoutRecipe(recipe);
      if (!layout) throw new Error('这份版式无法使用。请检查栏数、颜色和模块分区。');
      this.rememberChange();
      this.data.layout = layout;
      this.saveImmediately();
    },

    /** 套用模板库里的版式：替换排版和主题，保留正文、顺序、隐藏模块和岗位信息。 */
    applyLayout(template: SavedRecipe) {
      this.rememberChange();
      const current = this.data;
      const next = applyLayoutToResume(current, template);
      this.data = {
        ...next,
        id: current.id,
        title: current.title,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
      };
      this.saveImmediately();
    },

    /** 用自定义模板快照替换当前简历的内容和样式，保留这份简历自己的 id 与名称。 */
    applyTemplateSnapshot(snapshot: ResumeData) {
      this.rememberChange();
      const current = this.data;
      this.data = {
        ...cloneResume(snapshot),
        id: current.id,
        title: current.title,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
      };
      delete this.data.jobTarget;
      this.saveImmediately();
    },

    // 更新模块排序
    updateSectionOrder(newOrder: string[]) {
      this.rememberChange();
      this.data.sectionOrder = newOrder;
      const aligned = withAlignedCustomBlockOrder(this.data);
      if (aligned !== this.data) this.data.customBlocks = aligned.customBlocks;
      this.saveImmediately();
    },

    // 切换模块可见性
    toggleSectionVisibility(id: string) {
      this.rememberChange();
      if (!this.data.hiddenSections) {
        this.data.hiddenSections = [];
      }
      const index = this.data.hiddenSections.indexOf(id);
      if (index === -1) {
        this.data.hiddenSections.push(id);
      } else {
        this.data.hiddenSections.splice(index, 1);
      }
      this.saveImmediately();
    },

    // 更新简历标题
    updateTitle(title: string) {
      this.rememberChange();
      this.data.title = title;
      this.scheduleSave();
    },

    // 导出数据
    exportData(): ResumeData {
      return cloneResume(this.data);
    },

    // 导入数据
    async importData(data: ResumeData) {
      this.rememberChange();
      const previous = this.data;
      this.data = normalizeResumeData(cloneResume(data));
      const applied = this.data;
      const save = this.autoSave();
      const generation = this.saveGeneration;
      try {
        await save;
      } catch (error) {
        if (this.data === applied && this.saveGeneration === generation) this.data = previous;
        throw error;
      }
    },

    // 重置数据
    reset() {
      const current = this.data;
      this.cancelScheduledSave();
      this.rememberChange();
      const defaults = createDefaultResumeData();
      defaults.id = current.id;
      defaults.title = current.title;
      defaults.createdAt = current.createdAt;
      defaults.jobTarget = current.jobTarget;
      this.data = defaults;
      this.saveImmediately();
    },

    // Explicit saves are FIFO barriers. Background saves may supersede queued work,
    // but never cancel a write that has already started.
    discardOpenResume() {
      this.cancelScheduledSave();
      this.discardedId = this.data.id;
      this.saveGeneration += 1;
    },

    async autoSave(background = false) {
      this.cancelScheduledSave();
      if (this.discardedId && this.data.id === this.discardedId) {
        this.saveStatus = 'saved';
        this.saveError = null;
        return;
      }
      const source = this.data;
      const snapshot = background ? null : this.exportData();
      const token = {};
      if (background) latestBackgroundSave.set(this, token);
      else latestBackgroundSave.delete(this);
      const generation = ++this.saveGeneration;
      this.saveStatus = 'saving';
      this.saveError = null;
      const previousSave = saveQueues.get(this) ?? Promise.resolve();
      const currentSave = previousSave.catch(() => undefined).then(async () => {
        if (background && latestBackgroundSave.get(this) !== token) return;
        // Clone only when a background write actually runs, not on each keystroke.
        const saved = snapshot ?? cloneResume(source);
        const updatedAt = new Date().toISOString();
        saved.updatedAt = updatedAt;
        await storageManager.saveResume(saved);
        if (generation === this.saveGeneration && this.data.id === saved.id) {
          this.data.updatedAt = updatedAt;
          this.saveStatus = 'saved';
        }
      });
      saveQueues.set(this, currentSave);
      try {
        await currentSave;
      } catch (error) {
        if (generation === this.saveGeneration && this.data.id === source.id) {
          this.saveStatus = 'error';
          this.saveError = describeError(error);
        }
        console.error('保存简历失败:', error);
        throw error;
      } finally {
        if (saveQueues.get(this) === currentSave) saveQueues.delete(this);
        if (latestBackgroundSave.get(this) === token) latestBackgroundSave.delete(this);
      }
    },

    async retrySave() {
      await this.autoSave();
    },

    async flushSave(): Promise<void> {
      if (pendingSaveTimers.has(this) || this.saveStatus === 'error') {
        await this.autoSave();
      } else {
        await saveQueues.get(this);
      }
      // An input may arrive while a slow file-system write is pending.
      if (pendingSaveTimers.has(this) || saveQueues.has(this)) await this.flushSave();
    },

    cancelScheduledSave(): boolean {
      const timers = pendingSaveTimers.get(this);
      if (!timers) return false;
      clearTimeout(timers.debounce);
      clearTimeout(timers.maxWait);
      pendingSaveTimers.delete(this);
      return true;
    },

    scheduleSave() {
      this.saveGeneration += 1;
      this.saveStatus = 'saving';
      this.saveError = null;
      const existing = pendingSaveTimers.get(this);
      if (existing) clearTimeout(existing.debounce);
      const resumeId = this.data.id;
      const run = () => {
        if (this.data.id === resumeId) this.saveImmediately();
        else this.cancelScheduledSave();
      };
      pendingSaveTimers.set(this, {
        debounce: setTimeout(run, 500),
        maxWait: existing?.maxWait ?? setTimeout(run, 2000),
      });
    },


  },
});
