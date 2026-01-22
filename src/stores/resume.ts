import { defineStore } from 'pinia';
import type { ResumeData, BasicInfo, Experience, Education, Skill, CustomBlock, Project, ResumeMeta } from '@/types/resume';
import { storageManager } from '@/services/storage/StorageManager';
import { generateId, debounce } from '@/utils/helpers';

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
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export const useResumeStore = defineStore('resume', {
  state: () => ({
    data: getDefaultResumeData(),
    isLoading: false,
  }),

  actions: {
    /**
     * 通过 ID 加载简历
     * @param id 简历 ID
     */
    async loadResume(id: string) {
      this.isLoading = true;
      try {
        const resume = await storageManager.read(id);
        if (resume) {
          this.data = resume;
        } else {
          throw new Error(`简历 ${id} 不存在`);
        }
      } catch (error) {
        console.error(`加载简历 ${id} 失败:`, error);
        throw error;
      } finally {
        this.isLoading = false;
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
      this.data.basic = { ...this.data.basic, ...info };
      this.debouncedSave();
    },

    // 添加工作经历
    addExperience(exp: Omit<Experience, 'id'>) {
      const newExp: Experience = { id: generateId(), ...exp };
      this.data.experiences.push(newExp);
      this.autoSave();
    },

    // 更新工作经历
    updateExperience(id: string, updates: Partial<Experience>) {
      const index = this.data.experiences.findIndex((e) => e.id === id);
      if (index !== -1) {
        this.data.experiences[index] = { ...this.data.experiences[index], ...updates } as Experience;
        this.autoSave();
      }
    },

    // 删除工作经历
    removeExperience(id: string) {
      this.data.experiences = this.data.experiences.filter((e) => e.id !== id);
      this.autoSave();
    },

    // 重新排序工作经历
    reorderExperiences(newOrder: Experience[]) {
      this.data.experiences = newOrder;
      this.autoSave();
    },

    // 添加教育背景
    addEducation(edu: Omit<Education, 'id'>) {
      const newEdu: Education = { id: generateId(), ...edu };
      this.data.education.push(newEdu);
      this.autoSave();
    },

    // 更新教育背景
    updateEducation(id: string, updates: Partial<Education>) {
      const index = this.data.education.findIndex((e) => e.id === id);
      if (index !== -1) {
        this.data.education[index] = { ...this.data.education[index], ...updates } as Education;
        this.autoSave();
      }
    },

    // 删除教育背景
    removeEducation(id: string) {
      this.data.education = this.data.education.filter((e) => e.id !== id);
      this.autoSave();
    },

    // 添加技能
    addSkill(skill: Omit<Skill, 'id'>) {
      const newSkill: Skill = { id: generateId(), ...skill };
      this.data.skills.push(newSkill);
      this.autoSave();
    },

    // 更新技能
    updateSkill(id: string, updates: Partial<Skill>) {
      const index = this.data.skills.findIndex((s) => s.id === id);
      if (index !== -1) {
        this.data.skills[index] = { ...this.data.skills[index], ...updates } as Skill;
        this.autoSave();
      }
    },

    // 删除技能
    removeSkill(id: string) {
      this.data.skills = this.data.skills.filter((s) => s.id !== id);
      this.autoSave();
    },

    // 添加项目经验
    addProject(project: Omit<Project, 'id'>) {
      const newProject: Project = { id: generateId(), ...project };
      this.data.projects.push(newProject);
      this.autoSave();
    },

    // 更新项目经验
    updateProject(id: string, updates: Partial<Project>) {
      const index = this.data.projects.findIndex((p) => p.id === id);
      if (index !== -1) {
        this.data.projects[index] = { ...this.data.projects[index], ...updates } as Project;
        this.autoSave();
      }
    },

    // 删除项目经验
    removeProject(id: string) {
      this.data.projects = this.data.projects.filter((p) => p.id !== id);
      this.autoSave();
    },

    // 添加自定义模块
    addCustomBlock(block: Omit<CustomBlock, 'id'>) {
      const newBlock: CustomBlock = { id: generateId(), ...block };
      this.data.customBlocks.push(newBlock);
      this.autoSave();
    },

    // 更新自定义模块
    updateCustomBlock(id: string, updates: Partial<CustomBlock>) {
      const index = this.data.customBlocks.findIndex((b) => b.id === id);
      if (index !== -1) {
        this.data.customBlocks[index] = { ...this.data.customBlocks[index], ...updates } as CustomBlock;
        this.autoSave();
      }
    },

    // 删除自定义模块
    removeCustomBlock(id: string) {
      this.data.customBlocks = this.data.customBlocks.filter((b) => b.id !== id);
      this.autoSave();
    },

    // 切换模板
    setTemplate(templateId: string) {
      this.data.templateId = templateId;
      this.autoSave();
    },

    // 更新简历标题
    updateTitle(title: string) {
      this.data.title = title;
      this.autoSave();
    },

    // 导出数据
    exportData(): ResumeData {
      return JSON.parse(JSON.stringify(this.data));
    },

    // 导入数据
    async importData(data: ResumeData) {
      this.data = data;
      await this.autoSave();
    },

    // 重置数据
    reset() {
      this.data = getDefaultResumeData();
    },

    // 立即保存
    async autoSave() {
      this.data.updatedAt = new Date().toISOString();

      const meta: ResumeMeta = {
        id: this.data.id,
        title: this.data.title,
        templateId: this.data.templateId,
        createdAt: new Date(this.data.createdAt).getTime(),
        updatedAt: Date.now(),
      };

      try {
        await storageManager.save(this.data, meta);
      } catch (error) {
        console.error('保存简历失败:', error);
        throw error;
      }
    },

    // 防抖保存
    debouncedSave: debounce(function (this: any) {
      this.autoSave();
    }, 500),
  },
});
