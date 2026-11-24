import { defineAsyncComponent, type Component } from 'vue';
import type { ResumeData } from '@/types/resume';
import { effectiveLayout } from '@/utils/layout-template';
import LayoutRecipeTemplate from './templates/LayoutRecipeTemplate.vue';

export const templateRegistry = {
  modern: defineAsyncComponent(() => import('./templates/ModernTemplate.vue')),
  professional: defineAsyncComponent(() => import('./templates/ProfessionalTemplate.vue')),
  creative: defineAsyncComponent(() => import('./templates/CreativeTemplate.vue')),
  minimal: defineAsyncComponent(() => import('./templates/MinimalTemplate.vue')),
  tech: defineAsyncComponent(() => import('./templates/TechTemplate.vue')),
  'ai-agent': defineAsyncComponent(() => import('./templates/AiAgentTemplate.vue')),
};

export function getTemplateComponent(templateId: string) {
  return templateRegistry[templateId as keyof typeof templateRegistry] ?? null;
}

/** 有合法自定义版式时，预览不再看 templateId 指向的内置组件。 */
export function resolveTemplateView(data: Pick<ResumeData, 'templateId' | 'layout'>): Component {
  if (effectiveLayout(data)) return LayoutRecipeTemplate;
  return getTemplateComponent(data.templateId) ?? templateRegistry.modern;
}
