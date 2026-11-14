import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick, reactive, type Component } from 'vue';
import { beforeEach, describe, expect, it } from 'vitest';
import ModernTemplate from '../templates/ModernTemplate.vue';
import ProfessionalTemplate from '../templates/ProfessionalTemplate.vue';
import AiAgentTemplate from '../templates/AiAgentTemplate.vue';
import MinimalTemplate from '../templates/MinimalTemplate.vue';
import CreativeTemplate from '../templates/CreativeTemplate.vue';
import TechTemplate from '../templates/TechTemplate.vue';
import { templateDemoData } from '@/data/template-demo';
import type { ResumeData } from '@/types/resume';

let dataFixture: ResumeData;

function makeData(): ResumeData {
  const data = JSON.parse(JSON.stringify(templateDemoData)) as ResumeData;
  data.theme.fontSize = 18;
  data.theme.lineHeight = 1.2;
  data.theme.moduleMargins = { top: 0, bottom: 32, left: 0, right: 0 };
  return reactive(data);
}

function rootStyle(component: Component, rootClass: string): () => string {
  const wrapper = mount(component, {
    props: { data: dataFixture },
    global: { stubs: { draggable: true, 'el-divider': true, 'el-empty': true, 'el-icon': true } },
  });
  return () => wrapper.find(rootClass).attributes('style') ?? '';
}

describe('template theme tokens', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    dataFixture = makeData();
  });

  it('ModernTemplate defines the tokens its var() references consume', () => {
    const style = rootStyle(ModernTemplate, '.modern-template');
    expect(style()).toContain('--font-size: 18px');
    expect(style()).toContain('--line-height: 1.2');
    expect(style()).toContain('--spacing: 32px');
    expect(style()).toContain('font-size: var(--font-size)');
    expect(style()).toContain('line-height: var(--line-height)');
  });

  it('ProfessionalTemplate defines --spacing as well', () => {
    const style = rootStyle(ProfessionalTemplate, '.professional-template');
    expect(style()).toContain('--font-size: 18px');
    expect(style()).toContain('--line-height: 1.2');
    expect(style()).toContain('--spacing: 32px');
  });

  it('AiAgentTemplate still defines its typography tokens', () => {
    const style = rootStyle(AiAgentTemplate, '.ai-agent-template');
    expect(style()).toContain('--font-size: 18px');
    expect(style()).toContain('--line-height: 1.2');
  });

  const directTemplates: Array<[string, Component, string]> = [
    ['MinimalTemplate', MinimalTemplate, '.minimal-template'],
    ['CreativeTemplate', CreativeTemplate, '.creative-template'],
    ['TechTemplate', TechTemplate, '.tech-template'],
  ];

  for (const [name, component, rootClass] of directTemplates) {
    it(`${name} applies the theme font size directly on the template root`, () => {
      const style = rootStyle(component, rootClass);
      expect(style()).toContain('font-size: 18px');
      expect(style()).toContain('line-height: 1.2');
    });
  }

  it('ModernTemplate keeps following live theme edits', async () => {
    const style = rootStyle(ModernTemplate, '.modern-template');
    dataFixture.theme.fontSize = 15;
    dataFixture.theme.lineHeight = 1.8;
    dataFixture.theme.moduleMargins.bottom = 8;
    await nextTick();
    expect(style()).toContain('--font-size: 15px');
    expect(style()).toContain('--line-height: 1.8');
    expect(style()).toContain('--spacing: 8px');
  });
});
