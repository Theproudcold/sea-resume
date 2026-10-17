import { defineStore } from 'pinia';
import type { ResumeData, BasicInfo, Experience, Education, Skill, CustomBlock, Project, ResumeMeta, ThemeConfig, CustomItem } from '@/types/resume';
import { storageManager } from '@/services/storage/StorageManager';
import { generateId } from '@/utils/helpers';
import { RECOMMENDED_FONT_FAMILY } from '@/utils/fonts';
import { assertProposalBaseline, parseChangeProposal, previewProposal } from '@/services/ai/changeProposal';

const applyingProposals = new WeakSet<object>();

// 默认简历数据
const getDefaultResumeData = (): ResumeData => ({
  id: generateId(),
  title: '我的简历',
  basic: {
    name: '',
    title: '',
    email: '',
    phone: '',
  },
  experiences: [],
  education: [],
  skills: [],
  projects: [],
  customBlocks: [],
  templateId: 'modern',
  theme: {
    color: '#2563eb', // blue-600
    fontFamily: RECOMMENDED_FONT_FAMILY,
    fontSize: 14,
    lineHeight: 1.5,
    moduleMargins: {
      top: 0,
      bottom: 24,
      left: 0,
      right: 0,
    },
    pageMargins: 24,
    dateFormat: 'YYYY.MM',
    displayIcons: true,
  },
  sectionOrder: ['experience', 'projects', 'education', 'skills'],
  hiddenSections: [],
  sectionTitles: {
    experience: '工作经历',
    projects: '项目经验',
    education: '教育背景',
    skills: '技能证书',
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

type SaveTimers = { debounce: ReturnType<typeof setTimeout>; maxWait: ReturnType<typeof setTimeout> };
const pendingSaveTimers = new WeakMap<object, SaveTimers>();
const saveQueues = new WeakMap<object, Promise<void>>();
const latestBackgroundSave = new WeakMap<object, object>();
const loadRequests = new WeakMap<object, number>();

export const useResumeStore = defineStore('resume', {
  state: () => ({
    data: getDefaultResumeData(),
    saveStatus: 'saved' as 'saving' | 'saved' | 'error',
    saveError: null as string | null,
    historyPast: [] as ResumeData[],
    historyFuture: [] as ResumeData[],
    historyLastAt: 0,
    saveGeneration: 0,
    isLoading: false,
    activeSection: null as string | null, // 当前选中的模块 ID
    appliedProposalIds: [] as string[],
  }),
  getters: {
    canUndo: (state) => state.historyPast.length > 0,
    canRedo: (state) => state.historyFuture.length > 0,
  },


  actions: {
    /** Only UI approval calls this action; external tools can never save directly. */
    async applyChangeProposal(input: unknown, assertAuthorized: () => void = () => undefined): Promise<void> {
      const proposal = parseChangeProposal(input);
      if (this.appliedProposalIds.includes(proposal.proposalId)) throw new Error('此草稿已应用，不能重复保存。');
      if (applyingProposals.has(this) || this.isLoading) throw new Error('正在处理简历，请稍后重试。');
      applyingProposals.add(this);
      try {
        assertAuthorized();
        const previous = this.exportData();
        const generation = this.saveGeneration;
        await assertProposalBaseline(previous, proposal);
        assertAuthorized();
        if (this.isLoading || this.saveGeneration !== generation || this.data.id !== previous.id || JSON.stringify({ ...this.data, updatedAt: '' }) !== JSON.stringify({ ...previous, updatedAt: '' })) {
          throw new Error('简历已发生变化，请重新检查草稿。');
        }
        const next = previewProposal(previous, proposal);
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
        this.historyPast.push(JSON.parse(JSON.stringify(this.data)) as ResumeData);
        if (this.historyPast.length > 100) this.historyPast.shift();
        this.historyFuture = [];
      }
      this.historyLastAt = now;
    },

    startHistoryGroup() {
      this.rememberChange();
    },

    saveImmediately() {
      void this.autoSave(true).catch(() => undefined);
    },

    async undo() {
      const previous = this.historyPast.pop();
      if (!previous) return;
      const current = this.exportData();
      this.historyFuture.push(current);
      this.historyLastAt = 0;
      this.data = JSON.parse(JSON.stringify(previous)) as ResumeData;
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
      const current = this.exportData();
      this.historyPast.push(current);
      this.historyLastAt = 0;
      this.data = JSON.parse(JSON.stringify(next)) as ResumeData;
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

    // 更新模块标题
    updateSectionTitle(section: string, title: string) {
      this.rememberChange();
      if (!this.data.sectionTitles) {
        this.data.sectionTitles = getDefaultResumeData().sectionTitles;
      }
      this.data.sectionTitles[section] = title;
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

        // Merge with defaults so old stored resumes gain newly introduced fields.
        const defaults = getDefaultResumeData();
        this.data = {
          ...defaults,
          ...resume,
          theme: {
            ...defaults.theme,
            ...(resume.theme || {}),
            fontFamily: resume.theme?.fontFamily === 'sans-serif'
              ? defaults.theme.fontFamily
              : resume.theme?.fontFamily || defaults.theme.fontFamily,
          },
          sectionTitles: {
            ...defaults.sectionTitles,
            ...(resume.sectionTitles || {}),
          },
        };
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
      this.data = getDefaultResumeData();
      this.data.title = title;
      this.data.templateId = templateId;
    },

    // 更新基础信息
    updateBasic(info: Partial<BasicInfo>) {
      this.rememberChange();
      this.data.basic = { ...this.data.basic, ...info };
      this.scheduleSave();
    },

    // 添加工作经历
    addExperience(exp: Omit<Experience, 'id'>) {
      this.rememberChange();
      const newExp: Experience = { id: generateId(), ...exp };
      this.data.experiences.push(newExp);
      this.saveImmediately();
    },

    // 更新工作经历
    updateExperience(id: string, updates: Partial<Experience>) {
      const index = this.data.experiences.findIndex((e) => e.id === id);
      if (index !== -1) {
        this.rememberChange();
        this.data.experiences[index] = { ...this.data.experiences[index], ...updates } as Experience;
        if ('visible' in updates) this.saveImmediately();
        else this.scheduleSave();
      }
    },

    // 删除工作经历
    removeExperience(id: string) {
      this.rememberChange();
      this.data.experiences = this.data.experiences.filter((e) => e.id !== id);
      this.saveImmediately();
    },

    // 重新排序工作经历
    reorderExperiences(newOrder: Experience[]) {
      this.rememberChange();
      this.data.experiences = newOrder;
      this.saveImmediately();
    },

    // 添加教育背景
    addEducation(edu: Omit<Education, 'id'>) {
      this.rememberChange();
      const newEdu: Education = { id: generateId(), ...edu };
      this.data.education.push(newEdu);
      this.saveImmediately();
    },

    // 更新教育背景
    updateEducation(id: string, updates: Partial<Education>) {
      const index = this.data.education.findIndex((e) => e.id === id);
      if (index !== -1) {
        this.rememberChange();
        this.data.education[index] = { ...this.data.education[index], ...updates } as Education;
        if ('visible' in updates) this.saveImmediately();
        else this.scheduleSave();
      }
    },

    // 删除教育背景
    removeEducation(id: string) {
      this.rememberChange();
      this.data.education = this.data.education.filter((e) => e.id !== id);
      this.saveImmediately();
    },

    // 添加技能
    addSkill(skill: Omit<Skill, 'id'>) {
      this.rememberChange();
      const newSkill: Skill = { id: generateId(), ...skill };
      this.data.skills.push(newSkill);
      this.saveImmediately();
    },

    // 更新技能
    updateSkill(id: string, updates: Partial<Skill>) {
      this.rememberChange();
      const index = this.data.skills.findIndex((s) => s.id === id);
      if (index !== -1) {
        this.data.skills[index] = { ...this.data.skills[index], ...updates } as Skill;
        if ('visible' in updates) this.saveImmediately();
        else this.scheduleSave();
      }
    },

    // 删除技能
    removeSkill(id: string) {
      this.rememberChange();
      this.data.skills = this.data.skills.filter((s) => s.id !== id);
      this.saveImmediately();
    },

    // 添加项目经验
    addProject(project: Omit<Project, 'id'>) {
      this.rememberChange();
      const newProject: Project = { id: generateId(), ...project };
      this.data.projects.push(newProject);
      this.saveImmediately();
    },

    // 更新项目经验
    updateProject(id: string, updates: Partial<Project>) {
      const index = this.data.projects.findIndex((p) => p.id === id);
      if (index !== -1) {
        this.rememberChange();
        this.data.projects[index] = { ...this.data.projects[index], ...updates } as Project;
        if ('visible' in updates) this.saveImmediately();
        else this.scheduleSave();
      }
    },

    // 删除项目经验
    removeProject(id: string) {
      this.rememberChange();
      this.data.projects = this.data.projects.filter((p) => p.id !== id);
      this.saveImmediately();
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

    // 切换模板
    setTemplate(templateId: string) {
      this.rememberChange();
      this.data.templateId = templateId;
      this.saveImmediately();
    },

    // 更新模块排序
    updateSectionOrder(newOrder: string[]) {
      this.rememberChange();
      this.data.sectionOrder = newOrder;
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
      return JSON.parse(JSON.stringify(this.data));
    },

    // 导入数据
    async importData(data: ResumeData) {
      this.rememberChange();
      const previous = this.data;
      const defaults = getDefaultResumeData();
      this.data = {
        ...defaults,
        ...JSON.parse(JSON.stringify(data)) as ResumeData,
        theme: {
          ...defaults.theme,
          ...(data.theme || {}),
          moduleMargins: { ...defaults.theme.moduleMargins, ...(data.theme?.moduleMargins || {}) },
        },
        sectionTitles: { ...defaults.sectionTitles, ...(data.sectionTitles || {}) },
        sectionOrder: data.sectionOrder?.length ? [...data.sectionOrder] : ['experience', 'projects', 'education', 'skills'],
      };
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
      const defaults = getDefaultResumeData();
      defaults.id = current.id;
      defaults.title = current.title;
      defaults.createdAt = current.createdAt;
      defaults.jobTarget = current.jobTarget;
      this.data = defaults;
      this.saveImmediately();
    },

    // Explicit saves are FIFO barriers. Background saves may supersede queued work,
    // but never cancel a write that has already started.
    async autoSave(background = false) {
      this.cancelScheduledSave();
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
        const saved = snapshot ?? JSON.parse(JSON.stringify(source)) as ResumeData;
        const updatedAt = new Date().toISOString();
        saved.updatedAt = updatedAt;
        const meta: ResumeMeta = {
          id: saved.id,
          title: saved.title,
          templateId: saved.templateId,
          createdAt: Date.parse(saved.createdAt),
          updatedAt: Date.parse(updatedAt),
        };
        await storageManager.save(saved, meta);
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
          this.saveError = error instanceof Error ? error.message : '未知错误';
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
