import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import SectionQuickNav from '@/components/editor/SectionQuickNav.vue';
import ResumeQualityPanel from '@/components/editor/ResumeQualityPanel.vue';

describe('editor navigation and quality panel', () => {
  it('emits the requested section when a quick-nav button is activated', async () => {
    const wrapper = mount(SectionQuickNav, { props: { sections: [{ id: 'basic', title: '基础信息' }, { id: 'projects', title: '项目经验' }] } });
    await wrapper.get('button:nth-of-type(2)').trigger('click');
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['projects']);
  });

  it('allows each quality issue to navigate to its target section', async () => {
    const wrapper = mount(ResumeQualityPanel, {
      props: { modelValue: true, issues: [{ id: 'p', section: 'projects', severity: 'warning', message: '项目描述为空。' }] },
      global: { stubs: { 'el-dialog': { template: '<div><slot /></div>', props: ['modelValue'] }, 'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' }, 'el-empty': true } },
    });
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['projects']);
  });
});
