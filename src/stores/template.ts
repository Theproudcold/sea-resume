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
  {
    id: 'classic',
    name: '经典学院 / ATS',
    description: '居中页眉与极细横线分区，高信息密度且打印与 ATS 机筛友好',
    category: 'minimal',
    categoryLabel: '极简',
    keywords: ['经典', 'ATS', '学院', '大厂', '外企', '投行', '咨询', 'LaTeX', '单栏'],
    recommendedOrder: 7,
  },
  {
    id: 'editorial',
    name: '现代杂志双栏',
    description: '左侧主栏与右侧暖灰轻侧栏，符合自然阅读动线，优雅克制',
    category: 'modern',
    categoryLabel: '现代',
    keywords: ['双栏', '杂志', '产品', 'UX', '运营', '设计', '右侧栏'],
    recommendedOrder: 8,
  },
  {
    id: 'engineer',
    name: '浅色工程文档',
    description: '白底细线时间轴与等宽技术标签，兼具技术辨识度与打印友好体验',
    category: 'tech',
    categoryLabel: '技术',
    keywords: ['工程师', '开发', '前端', '后端', '全栈', '时间轴', '白底'],
    recommendedOrder: 9,
  },
  {
    id: 'executive',
    name: '资深管理 / 专家',
    description: '顶部双色细带与沉稳字阶，突出核心摘要与资深履历层次',
    category: 'professional',
    categoryLabel: '商务',
    keywords: ['管理', '总监', '架构师', '专家', '资深', '负责人'],
    recommendedOrder: 10,
  },
  {
    id: 'campus',
    name: '校招 / 学术科研',
    description: '紧凑单栏并突出教育背景与 GPA 徽章，适合校招、实习与科研投递',
    category: 'minimal',
    categoryLabel: '极简',
    keywords: ['校招', '应届生', '实习', '学术', '科研', '研究生', '保研'],
    recommendedOrder: 11,
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
