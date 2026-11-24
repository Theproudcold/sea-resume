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
import ClassicTemplate from '../templates/ClassicTemplate.vue';
import EditorialTemplate from '../templates/EditorialTemplate.vue';
import EngineerTemplate from '../templates/EngineerTemplate.vue';
import ExecutiveTemplate from '../templates/ExecutiveTemplate.vue';
import CampusTemplate from '../templates/CampusTemplate.vue';
import LayoutRecipeTemplate from '../templates/LayoutRecipeTemplate.vue';
import { templateDemoData } from '@/data/template-demo';
import { recipeForResume } from '@/utils/layout-template';
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

  const tokenizedNewTemplates: Array<[string, Component, string]> = [
    ['ClassicTemplate', ClassicTemplate, '.classic-template'],
    ['EditorialTemplate', EditorialTemplate, '.editorial-template'],
    ['EngineerTemplate', EngineerTemplate, '.engineer-template'],
    ['ExecutiveTemplate', ExecutiveTemplate, '.executive-template'],
    ['CampusTemplate', CampusTemplate, '.campus-template'],
  ];

  for (const [name, component, rootClass] of tokenizedNewTemplates) {
    it(`${name} defines typography and spacing tokens consumed by its styles`, () => {
      const style = rootStyle(component, rootClass);
      expect(style()).toContain('--font-size: 18px');
      expect(style()).toContain('--line-height: 1.2');
      expect(style()).toContain('--spacing: 32px');
    });
  }

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

  const allBuiltInTemplates: Array<[string, Component, string]> = [
    ['ModernTemplate', ModernTemplate, '.modern-template'],
    ['ProfessionalTemplate', ProfessionalTemplate, '.professional-template'],
    ['MinimalTemplate', MinimalTemplate, '.minimal-template'],
    ['CreativeTemplate', CreativeTemplate, '.creative-template'],
    ['TechTemplate', TechTemplate, '.tech-template'],
    ['AiAgentTemplate', AiAgentTemplate, '.ai-agent-template'],
    ['ClassicTemplate', ClassicTemplate, '.classic-template'],
    ['EditorialTemplate', EditorialTemplate, '.editorial-template'],
    ['EngineerTemplate', EngineerTemplate, '.engineer-template'],
    ['ExecutiveTemplate', ExecutiveTemplate, '.executive-template'],
    ['CampusTemplate', CampusTemplate, '.campus-template'],
  ];

  for (const [name, component, rootClass] of allBuiltInTemplates) {
    it(`${name} binds all four module margin tokens and preserves explicit 0px`, async () => {
      dataFixture.theme.moduleMargins = { top: 12, bottom: 0, left: 16, right: 20 };
      const style = rootStyle(component, rootClass);
      expect(style()).toContain('--margin-top: 12px');
      expect(style()).toContain('--margin-bottom: 0px');
      expect(style()).toContain('--margin-left: 16px');
      expect(style()).toContain('--margin-right: 20px');

      dataFixture.theme.moduleMargins = { top: 24, bottom: 36, left: 8, right: 4 };
      await nextTick();
      expect(style()).toContain('--margin-top: 24px');
      expect(style()).toContain('--margin-bottom: 36px');
      expect(style()).toContain('--margin-left: 8px');
      expect(style()).toContain('--margin-right: 4px');
    });
  }

  it('LayoutRecipeTemplate binds all four module margin tokens and preserves explicit 0px', async () => {
    dataFixture.layout = recipeForResume(dataFixture);
    dataFixture.theme.moduleMargins = { top: 12, bottom: 0, left: 16, right: 20 };
    const style = rootStyle(LayoutRecipeTemplate, '.layout-template');
    expect(style()).toContain('--margin-top: 12px');
    expect(style()).toContain('--margin-bottom: 0px');
    expect(style()).toContain('--margin-left: 16px');
    expect(style()).toContain('--margin-right: 20px');
  });
});
