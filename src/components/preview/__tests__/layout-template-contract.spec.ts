import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ElIcon } from 'element-plus';
import LayoutRecipeTemplate from '@/components/preview/templates/LayoutRecipeTemplate.vue';
import { useResumeStore } from '@/stores/resume';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { builtinToRecipe } from '@/utils/layout-template';
import { resolveTemplateView } from '@/components/preview/template-registry';
import draggable from 'vuedraggable';

const markdown = `# 契约测试用户 | 工程师\n- **电话**：13800000000\n\n## 工作经历\n### 测试公司 | 开发工程师 | 2022.01 — 至今\n负责可检索的业务正文。\n- 独立成果标记：交付自动化工具\n\n## 教育背景\n### 测试大学 | 学士 | 软件工程 | 2018.09 — 2022.06\n`;

enableAutoUnmount(afterEach);
beforeEach(() => setActivePinia(createPinia()));

describe('custom layout preview', () => {
  it('renders visible body once, omits a hidden section, and keeps sidebar sections out of the main column', async () => {
    const data = parseResumeMarkdown(markdown, 'layout.md').resume;
    data.layout = builtinToRecipe('professional', data.theme);
    data.hiddenSections = [];
    const wrapper = mount(LayoutRecipeTemplate, { props: { data }, global: { components: { ElIcon } } });
    await flushPromises();
    expect(wrapper.text().split('负责可检索的业务正文。').length - 1).toBe(1);
    expect(wrapper.text()).toContain('独立成果标记：交付自动化工具');
    expect(wrapper.text()).toContain('13800000000');
    expect(wrapper.get('[data-region="sidebar"]').text()).toContain('测试大学');
    expect(wrapper.get('[data-region="main"]').text()).not.toContain('测试大学');

    await wrapper.setProps({ data: { ...data, hiddenSections: ['experience'] } });
    expect(wrapper.text()).not.toContain('负责可检索的业务正文。');
    expect(wrapper.text()).toContain('测试大学');
  });

  it('reorders only the dragged column and resolves a valid layout ahead of a built-in template id', async () => {
    const data = parseResumeMarkdown(markdown, 'layout.md').resume;
    data.templateId = 'modern';
    data.layout = builtinToRecipe('professional', data.theme);
    data.sectionOrder = ['experience', 'education', 'skills'];
    expect(resolveTemplateView(data)).toBe(LayoutRecipeTemplate);
    const wrapper = mount(LayoutRecipeTemplate, { props: { data }, global: { components: { ElIcon } } });
    const sidebar = wrapper.findAllComponents(draggable)[0]!;
    sidebar.vm.$emit('update:modelValue', ['skills', 'education']);
    expect(useResumeStore().data.sectionOrder).toEqual(['experience', 'skills', 'education']);

    const broken = { ...data, layout: { schemaVersion: 2 } };
    expect(resolveTemplateView(broken as never)).not.toBe(LayoutRecipeTemplate);
  });
});
