import { defineStore } from 'pinia';
import type { ResumeMeta, ResumeData } from '@/types/resume';
import { storageManager } from '@/services/storage/StorageManager';
import { generateId } from '@/utils/helpers';
import { RECOMMENDED_FONT_FAMILY } from '@/utils/fonts';
import { createJobResumeVersion, type JobTarget } from '@/utils/resumeVersions';

/**
 * 工作台 Store
 * 管理简历列表和当前选中的简历
 */
export const useWorkbenchStore = defineStore('workbench', {
  state: () => ({
    resumeList: [] as ResumeMeta[],
    currentResumeId: null as string | null,
    isLoading: false,
    error: null as string | null,
  }),

  getters: {
    /**
     * 当前选中的简历元数据
     */
    currentResumeMeta: (state) => {
      if (!state.currentResumeId) return null;
      return state.resumeList.find((r) => r.id === state.currentResumeId) || null;
    },

    /**
     * 简历总数
     */
    totalCount: (state) => state.resumeList.length,

    /**
     * 是否有简历
     */
    hasResumes: (state) => state.resumeList.length > 0,
  },

  actions: {
    /**
     * 初始化：加载简历列表
     */
    async init() {
      this.isLoading = true;
      this.error = null;

      try {
        this.resumeList = await storageManager.list();
      } catch (error) {
        console.error('加载简历列表失败:', error);
        this.error = error instanceof Error ? error.message : '未知错误';
        this.resumeList = [];
      } finally {
        this.isLoading = false;
      }
    },

    /**
     * 刷新简历列表
     */
    async refresh() {
      await this.init();
    },

    /**
     * 创建新简历
     * @param title 简历名称
     * @param templateId 模板 ID
     * @returns 新简历的 ID
     */
    async createResume(title: string, templateId: string = 'modern'): Promise<string> {
      const now = new Date().toISOString();
      const timestamp = Date.now();

      const newResume: ResumeData = {
        id: generateId(),
        title: title || '未命名简历',
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
        templateId,
        theme: {
          color: '#2563eb',
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
        createdAt: now,
        updatedAt: now,
      };

      const meta: ResumeMeta = {
        id: newResume.id,
        title: newResume.title,
        templateId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      try {
        await storageManager.save(newResume, meta);
        await this.refresh();
        return newResume.id;
      } catch (error) {
        console.error('创建简历失败:', error);
        throw error;
      }
    },

    /** Create a distinct resume from imported or restored structured data. */
    async createResumeFromData(source: ResumeData, title = source.title, templateId = source.templateId): Promise<string> {
      const now = new Date().toISOString();
      const id = generateId();
      const moduleMargins = source.theme?.moduleMargins || { top: 0, bottom: 24, left: 0, right: 0 };
      const newResume: ResumeData = {
        ...JSON.parse(JSON.stringify(source)) as ResumeData,
        id,
        title: title.trim() || source.title || '导入的简历',
        templateId: ['modern', 'professional', 'creative', 'minimal', 'tech', 'ai-agent'].includes(templateId) ? templateId : 'modern',
        theme: {
          color: source.theme?.color || '#2563eb',
          fontFamily: source.theme?.fontFamily && source.theme.fontFamily !== 'sans-serif'
            ? source.theme.fontFamily
            : RECOMMENDED_FONT_FAMILY,
          fontSize: source.theme?.fontSize || 14,
          lineHeight: source.theme?.lineHeight || 1.5,
          moduleMargins: { ...{ top: 0, bottom: 24, left: 0, right: 0 }, ...moduleMargins },
          pageMargins: source.theme?.pageMargins ?? 24,
          dateFormat: source.theme?.dateFormat || 'YYYY.MM',
          displayIcons: source.theme?.displayIcons !== false,
        },
        sectionOrder: source.sectionOrder?.length ? [...source.sectionOrder] : ['experience', 'projects', 'education', 'skills'],
        hiddenSections: [...(source.hiddenSections || [])],
        createdAt: now,
        updatedAt: now,
      };
      const timestamp = Date.now();
      const meta: ResumeMeta = { id, title: newResume.title, templateId: newResume.templateId, createdAt: timestamp, updatedAt: timestamp };
      await storageManager.save(newResume, meta);
      await this.refresh();
      return id;
    },

    async createJobVersion(sourceId: string, target: Omit<JobTarget, 'sourceResumeId'>): Promise<string> {
      const source = await storageManager.read(sourceId);
      if (!source) throw new Error('源简历不存在。');
      const version = createJobResumeVersion(source, target, generateId());
      const timestamp = Date.now();
      const meta: ResumeMeta = {
        id: version.id,
        title: version.title,
        templateId: version.templateId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await storageManager.save(version, meta);
      await this.refresh();
      return version.id;
    },

    /**
     * 删除简历
     * @param id 简历 ID
     */
    async deleteResume(id: string) {
      try {
        await storageManager.delete(id);
        await this.refresh();

        // 如果删除的是当前选中的简历，清除选中状态
        if (this.currentResumeId === id) {
          this.currentResumeId = null;
        }
      } catch (error) {
        console.error(`删除简历 ${id} 失败:`, error);
        throw error;
      }
    },

    /**
     * 复制简历
     * @param id 要复制的简历 ID
     * @returns 新简历的 ID
     */
    async duplicateResume(id: string): Promise<string> {
      try {
        // 读取原简历数据
        const originalData = await storageManager.read(id);
        if (!originalData) {
          throw new Error(`简历 ${id} 不存在`);
        }

        // 创建新简历
        const now = new Date().toISOString();
        const timestamp = Date.now();
        const newId = generateId();

        const newResume: ResumeData = {
          ...originalData,
          id: newId,
          title: `${originalData.title} (副本)`,
          createdAt: now,
          updatedAt: now,
        };

        const meta: ResumeMeta = {
          id: newId,
          title: newResume.title,
          templateId: newResume.templateId,
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        await storageManager.save(newResume, meta);
        await this.refresh();
        return newId;
      } catch (error) {
        console.error(`复制简历 ${id} 失败:`, error);
        throw error;
      }
    },

    /**
     * 重命名简历
     * @param id 简历 ID
     * @param newTitle 新名称
     */
    async renameResume(id: string, newTitle: string) {
      try {
        // 读取简历数据
        const data = await storageManager.read(id);
        if (!data) {
          throw new Error(`简历 ${id} 不存在`);
        }

        // 更新数据
        data.title = newTitle;
        data.updatedAt = new Date().toISOString();

        const meta: ResumeMeta = {
          id: data.id,
          title: newTitle,
          templateId: data.templateId,
          createdAt: new Date(data.createdAt).getTime(),
          updatedAt: Date.now(),
        };

        await storageManager.save(data, meta);
        await this.refresh();
      } catch (error) {
        console.error(`重命名简历 ${id} 失败:`, error);
        throw error;
      }
    },

    /**
     * 选中简历
     * @param id 简历 ID
     */
    selectResume(id: string | null) {
      this.currentResumeId = id;
    },

    /**
     * 清除错误
     */
    clearError() {
      this.error = null;
    },
  },
});
