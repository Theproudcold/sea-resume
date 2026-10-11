import { defineStore } from 'pinia';
import type { ResumeData, BasicInfo, Experience, Education, Skill, CustomBlock, Project, ResumeMeta, ThemeConfig, CustomItem } from '@/types/resume';
import { storageManager } from '@/services/storage/StorageManager';
import { generateId } from '@/utils/helpers';
import { RECOMMENDED_FONT_FAMILY } from '@/utils/fonts';

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

const pendingSaveTimers = new WeakMap<object, ReturnType<typeof setTimeout>>();
const saveQueues = new WeakMap<object, Promise<void>>();
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
  }),
  getters: {
    canUndo: (state) => state.historyPast.length > 0,
    canRedo: (state) => state.historyFuture.length > 0,
  },


  actions: {
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
      void this.autoSave().catch(() => undefined);
    },

    async undo() {
      const previous = this.historyPast.pop();
      if (!previous) return;
      const current = this.exportData();
      this.historyFuture.push(current);
      this.historyLastAt = 0;
      this.data = JSON.parse(JSON.stringify(previous)) as ResumeData;
      try {
        await this.autoSave();
      } catch (error) {
        this.data = current;
        this.historyFuture.pop();
        this.historyPast.push(previous);
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
      try {
        await this.autoSave();
      } catch (error) {
        this.data = current;
        this.historyPast.pop();
        this.historyFuture.push(next);
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
        const hadPendingSave = this.cancelScheduledSave();
        if (hadPendingSave) await this.autoSave();
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
        this.saveImmediately();
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
        this.saveImmediately();
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
        this.saveImmediately();
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
        this.saveImmediately();
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
        this.saveImmediately();
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
          this.saveImmediately();
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
      this.saveImmediately();
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
      try {
        await this.autoSave();
      } catch (error) {
        this.data = previous;
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

    // 立即保存
    async autoSave() {
      const snapshot = this.exportData();

      const updatedAt = new Date().toISOString();
      snapshot.updatedAt = updatedAt;
      if (this.data.id === snapshot.id) this.data.updatedAt = updatedAt;

      const meta: ResumeMeta = {
        id: snapshot.id,
        title: snapshot.title,
        templateId: snapshot.templateId,
        createdAt: new Date(snapshot.createdAt).getTime(),
        updatedAt: Date.now(),
      };
      const generation = ++this.saveGeneration;

      this.saveStatus = 'saving';
      this.saveError = null;
      const previousSave = saveQueues.get(this) ?? Promise.resolve();
      const currentSave = previousSave.catch(() => undefined).then(() => storageManager.save(snapshot, meta));
      saveQueues.set(this, currentSave);
      try {
        await currentSave;
        if (generation === this.saveGeneration && this.data.id === snapshot.id) this.saveStatus = 'saved';
      } catch (error) {
        if (generation === this.saveGeneration && this.data.id === snapshot.id) {
          this.saveStatus = 'error';
          this.saveError = error instanceof Error ? error.message : '未知错误';
        }
        console.error('保存简历失败:', error);
        throw error;
      } finally {
        if (saveQueues.get(this) === currentSave) saveQueues.delete(this);
      }
    },

    async retrySave() {
      this.cancelScheduledSave();
      await this.autoSave();
    },

    cancelScheduledSave(): boolean {
      const timer = pendingSaveTimers.get(this);
      if (timer === undefined) return false;
      clearTimeout(timer);
      pendingSaveTimers.delete(this);
      return true;
    },

    scheduleSave() {
      this.saveStatus = 'saving';
      this.saveError = null;
      this.cancelScheduledSave();
      const resumeId = this.data.id;
      const timer = setTimeout(() => {
        pendingSaveTimers.delete(this);
        if (this.data.id === resumeId) this.saveImmediately();
      }, 500);
      pendingSaveTimers.set(this, timer);
    },


  },
});
