import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Component } from 'vue';
import type { ResumeData } from '@/types/resume';
import { templateDemoData } from '@/data/template-demo';
import ModernTemplate from '../templates/ModernTemplate.vue';
import ProfessionalTemplate from '../templates/ProfessionalTemplate.vue';
import CreativeTemplate from '../templates/CreativeTemplate.vue';
import MinimalTemplate from '../templates/MinimalTemplate.vue';
import TechTemplate from '../templates/TechTemplate.vue';
import AiAgentTemplate from '../templates/AiAgentTemplate.vue';

const templates: Record<string, Component> = {
  ModernTemplate,
  ProfessionalTemplate,
  CreativeTemplate,
  MinimalTemplate,
  TechTemplate,
  AiAgentTemplate,
};

const global = { stubs: { draggable: true, 'el-divider': true, 'el-empty': true, 'el-icon': true } };

describe('template rendering with partial legacy data', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('renders legacy resumes that predate the theme field', () => {
    const legacy = JSON.parse(JSON.stringify(templateDemoData)) as Record<string, unknown>;
    delete legacy.theme;

    for (const [name, component] of Object.entries(templates)) {
      expect(
        () => mount(component, { props: { data: legacy as unknown as ResumeData }, global }),
        `${name} 不应因缺少 theme 而崩溃`,
      ).not.toThrow();
    }
  });
});
