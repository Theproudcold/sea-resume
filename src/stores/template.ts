import { defineStore } from 'pinia';
import type { TemplateMetadata } from '@/types/resume';

export const useTemplateStore = defineStore('template', {
  state: () => ({
    templates: [
      {
        id: 'modern',
        name: '现代简约',
        description: '单栏布局，蓝色主题，适合互联网行业',
        category: 'modern' as const,
      },
      {
        id: 'professional',
        name: '商务专业',
        description: '双栏布局，灰色主题，适合传统行业',
        category: 'professional' as const,
      },
      {
        id: 'creative',
        name: '创意设计',
        description: '卡片式布局，渐变主题，适合设计岗位',
        category: 'creative' as const,
      },
      {
        id: 'minimal',
        name: '极简主义',
        description: '纯黑白，大留白，简洁专业',
        category: 'minimal' as const,
      },
      {
        id: 'tech',
        name: '科技感',
        description: '深色模式，绿色点缀，适合技术岗位',
        category: 'tech' as const,
      },
    ] as TemplateMetadata[],
    currentTemplateId: 'modern',
  }),

  getters: {
    currentTemplate: (state) => {
      return state.templates.find((t) => t.id === state.currentTemplateId);
    },
  },

  actions: {
    setCurrentTemplate(id: string) {
      this.currentTemplateId = id;
    },
  },
});
