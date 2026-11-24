import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h, type PropType } from 'vue';
import { ElIcon } from 'element-plus';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { templateDemoData } from '@/data/template-demo';
import type { ResumeData } from '@/types/resume';
import { builtinToRecipe } from '@/utils/layout-template';
import { templateRegistry } from '../template-registry';
import LayoutRecipeTemplate from '../templates/LayoutRecipeTemplate.vue';

enableAutoUnmount(afterEach);
beforeEach(() => setActivePinia(createPinia()));

function buildSmartFieldResume(templateId: string): ResumeData {
  const data = structuredClone(templateDemoData);
  data.templateId = templateId;
  data.basic.birthDate = '1998-02-01';
  data.basic.showAge = true;
  data.basic.showExperienceYears = true;
  return data;
}

describe('ResumeSmartFields rendering across every built-in template and custom layout', () => {
  it.each(Object.entries(templateRegistry))('%s renders age and work tenure inside dedicated smart-fields container', async (id, component) => {
    const data = buildSmartFieldResume(id);
    const Host = defineComponent({
      props: { data: { type: Object as PropType<ResumeData>, required: true } },
      setup: (props) => () => h(component, { data: props.data }),
    });
    const wrapper = mount(Host, { props: { data }, global: { components: { ElIcon } } });
    await flushPromises();
    // 异步组件需要微任务完成后渲染
    for (let i = 0; i < 10 && !wrapper.find('.resume-smart-fields').exists(); i++) {
      await new Promise((r) => setTimeout(r, 20));
      await flushPromises();
    }
    const smart = wrapper.find('.resume-smart-fields');
    expect(smart.exists(), `${id} should render .resume-smart-fields`).toBe(true);
    const items = smart.findAll('.resume-smart-field').map((node) => node.text());
    expect(items).toHaveLength(2);
    expect(items[0]).toMatch(/^\d+ 岁$/);
    expect(items[1]).toMatch(/^工作经验 \d+ 年$/);
    // 经典学院模板将智能字段置于独立身份副行，不与邮箱直接拼接
    if (id === 'classic') {
      expect(wrapper.find('.classic-contacts .resume-smart-fields').exists()).toBe(false);
      expect(wrapper.find('.classic-subline .resume-smart-fields').exists()).toBe(true);
    }
  });

  it('LayoutRecipeTemplate renders smart fields when contacts are placed in the sidebar', () => {
    const data = buildSmartFieldResume('professional');
    data.layout = builtinToRecipe('professional', data.theme);
    expect(data.layout.contactsPlacement).toBe('sidebar');
    const wrapper = mount(LayoutRecipeTemplate, {
      props: { data },
      global: { components: { ElIcon } },
    });
    const smart = wrapper.find('[data-region="sidebar"] .resume-smart-fields');
    expect(smart.exists()).toBe(true);
    expect(smart.text()).toContain('岁');
    expect(smart.text()).toContain('工作经验');
  });
});
