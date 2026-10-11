import { defineAsyncComponent } from 'vue';

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
