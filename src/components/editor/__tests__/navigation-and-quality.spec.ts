import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ResumeQualityPanel from '@/components/editor/ResumeQualityPanel.vue';
import type { ResumeQualityIssue } from '@/utils/resumeQuality';

const stubs = {
  'el-dialog': { template: '<div><slot /></div>', props: ['modelValue'] },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-empty': true,
};

const mountPanel = (issues: ResumeQualityIssue[]) =>
  mount(ResumeQualityPanel, { props: { modelValue: true, issues }, global: { stubs } });

const issue = (overrides: Partial<ResumeQualityIssue>): ResumeQualityIssue => ({
  id: 'x',
  section: 'projects',
  target: 'project-description-p1',
  severity: 'warning',
  message: '项目描述为空。',
  ...overrides,
});

describe('editor quality panel navigation', () => {
  it('allows each quality issue to navigate to its target section', async () => {
    const wrapper = mountPanel([issue({})]);
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['projects', 'project-description-p1']);
  });

  it('groups issues by section in a fixed order', () => {
    const wrapper = mountPanel([
      issue({ id: 'skills', section: 'skills', target: 'skill-items-s', message: '技能为空。' }),
      issue({ id: 'basic', section: 'basic', target: 'basic-name', message: '请填写姓名。' }),
      issue({ id: 'experience', section: 'experience', target: 'experience-company-e', message: '公司为空。' }),
    ]);
    expect(wrapper.findAll('.quality-group__title').map((title) => title.text())).toEqual(['基础信息', '工作经历', '技能证书']);
  });

  it('marks suggestions differently from warnings', () => {
    const wrapper = mountPanel([
      issue({ id: 'warn', severity: 'warning', message: '请填写姓名。' }),
      issue({ id: 'info', severity: 'info', message: '建议补充个人简介。' }),
    ]);
    expect(wrapper.findAll('.quality-dot--warning')).toHaveLength(1);
    expect(wrapper.findAll('.quality-dot--info')).toHaveLength(1);
  });

  it('navigates to the section root when an issue has no field target', async () => {
    const wrapper = mountPanel([issue({ id: 'experience-empty', section: 'experience', target: null, message: '尚未添加工作经历。' })]);
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['experience', null]);
  });

  it('names the destination button after its own issue', () => {
    const wrapper = mountPanel([
      issue({ id: 'a', message: '请填写姓名。' }),
      issue({ id: 'b', message: '请填写求职意向。' }),
    ]);
    expect(wrapper.findAll('button').map((button) => button.attributes('aria-label'))).toEqual([
      '去编辑：请填写姓名。',
      '去编辑：请填写求职意向。',
    ]);
  });

  it('renders duplicate issue ids as separate rows', () => {
    const wrapper = mountPanel([
      issue({ id: 'dup', message: '第一条。' }),
      issue({ id: 'dup', message: '第二条。' }),
    ]);
    expect(wrapper.findAll('.quality-list li')).toHaveLength(2);
  });

  it('shows the empty state when nothing needs attention', () => {
    const wrapper = mountPanel([]);
    expect(wrapper.find('.quality-groups').exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'el-empty' }).exists() || wrapper.html().includes('未发现')).toBe(true);
  });
});
