import { defineStore } from 'pinia';
import type { ResumeSnapshot } from '@/types/custom-template';
import type { SavedRecipe } from '@/types/layout-template';
import type { ResumeData, TemplateMetadata } from '@/types/resume';
import {
  deleteResumeSnapshot,
  listResumeSnapshots,
  renameResumeSnapshot,
  saveResumeSnapshot,
} from '@/services/templates/CustomTemplateRepository';
import {
  deleteSavedRecipe,
  listSavedRecipes,
  renameSavedRecipe,
  saveSavedRecipe,
} from '@/services/templates/SavedRecipeRepository';
import {
  buildResumeSnapshot,
  resumeSnapshotToMetadata,
} from '@/utils/custom-template';
import {
  buildSavedRecipe,
  savedRecipeToMetadata,
  recipeFromCurrent,
} from '@/utils/layout-template';

export const builtinTemplates: TemplateMetadata[] = [
  {
    id: 'modern',
    name: '现代简约',
    description: '单栏布局，信息清晰，适合互联网与通用岗位投递',
    category: 'modern',
    categoryLabel: '现代',
    keywords: ['前端', '互联网', '产品', '运营'],
    recommendedOrder: 1,
  },
  {
    id: 'professional',
    name: '商务专业',
    description: '双栏结构，排版稳重，适合金融、咨询与职能岗位',
    category: 'professional',
    categoryLabel: '商务',
    keywords: ['金融', '咨询', '人事', '行政'],
    recommendedOrder: 2,
  },
  {
    id: 'creative',
    name: '创意设计',
    description: '色块页眉与卡片分区，适合设计与创意相关岗位',
    category: 'creative',
    categoryLabel: '创意',
    keywords: ['设计', '品牌', '视觉', 'UI'],
    recommendedOrder: 4,
  },
  {
    id: 'minimal',
    name: '极简主义',
    description: '纯净留白，阅读负担低，适合正式简历投递场景',
    category: 'minimal',
    categoryLabel: '极简',
    keywords: ['简洁', '应届生', '通用', '正式'],
    recommendedOrder: 3,
  },
  {
    id: 'tech',
    name: '科技感',
    description: '深色纸面、等宽标题，适合技术岗位展示',
    category: 'tech',
    categoryLabel: '技术',
    keywords: ['后端', '算法', '开发', '工程师'],
    recommendedOrder: 5,
  },
  {
    id: 'ai-agent',
    name: 'AI Agent 技术',
    description: '参考 AI 工程师简历的紧凑单栏布局，适合 Agent、模型应用与全栈研发岗位',
    category: 'tech',
    categoryLabel: '技术',
    keywords: ['AI', 'Agent', '大模型', '人工智能', '全栈', '研发'],
    recommendedOrder: 6,
  },
];

export const useTemplateStore = defineStore('template', {
  state: () => ({
    builtinTemplates,
    resumeSnapshots: [] as ResumeSnapshot[],
    savedRecipes: [] as SavedRecipe[],
    currentTemplateId: 'modern',
    loaded: false,
  }),

  getters: {
    templates(state): TemplateMetadata[] {
      return [
        ...state.savedRecipes.map(savedRecipeToMetadata),
        ...state.resumeSnapshots.map(resumeSnapshotToMetadata),
        ...state.builtinTemplates,
      ];
    },
    currentTemplate(): TemplateMetadata | undefined {
      return this.templates.find((template) => template.id === this.currentTemplateId);
    },
  },

  actions: {
    setCurrentTemplate(id: string) {
      this.currentTemplateId = id;
    },

    loadTemplateLibrary() {
      this.resumeSnapshots = listResumeSnapshots();
      // 版式库损坏只影响版式，不让已经读出的内容模板一起消失。
      try {
        this.savedRecipes = listSavedRecipes();
      } catch (error) {
        this.savedRecipes = [];
        this.loaded = true;
        throw error;
      }
      this.loaded = true;
    },

    saveCurrentRecipe(resume: ResumeData, input: { name: string; description?: string }): SavedRecipe {
      const template = buildSavedRecipe(recipeFromCurrent(resume), input);
      this.savedRecipes = saveSavedRecipe(template);
      this.loaded = true;
      return template;
    },

    importLayout(input: { name: string; description?: string; recipe: SavedRecipe['recipe'] }): SavedRecipe {
      const template = buildSavedRecipe(input.recipe, input);
      this.savedRecipes = saveSavedRecipe(template);
      this.loaded = true;
      return template;
    },

    renameSavedRecipe(id: string, name: string) {
      this.savedRecipes = renameSavedRecipe(id, name);
    },

    deleteSavedRecipe(id: string) {
      this.savedRecipes = deleteSavedRecipe(id);
    },

    findSavedRecipe(id: string): SavedRecipe | undefined {
      return this.savedRecipes.find((template) => template.id === id);
    },

    saveCurrentAsSnapshot(
      resume: ResumeData,
      input: { name: string; description?: string },
    ): ResumeSnapshot {
      const template = buildResumeSnapshot(resume, input);
      this.resumeSnapshots = saveResumeSnapshot(template);
      this.loaded = true;
      return template;
    },

    renameResumeSnapshot(id: string, name: string) {
      this.resumeSnapshots = renameResumeSnapshot(id, name);
    },

    deleteResumeSnapshot(id: string) {
      this.resumeSnapshots = deleteResumeSnapshot(id);
    },

    findResumeSnapshot(id: string): ResumeSnapshot | undefined {
      return this.resumeSnapshots.find((template) => template.id === id);
    },
  },
});
