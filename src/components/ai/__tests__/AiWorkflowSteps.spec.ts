import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import AiWorkflowSteps from '../AiWorkflowSteps.vue';
describe('AI execution steps', () => {
  it('announces the current step and completed steps without relying on color', async () => {
    const wrapper = mount(AiWorkflowSteps, { props: { steps: ['分析', '补充', '改写'], current: 1, label: '简历优化步骤' } });
    expect(wrapper.get('ol').attributes('aria-label')).toBe('简历优化步骤');
    expect(wrapper.get('[aria-current=step]').text()).toContain('补充');
    expect(wrapper.findAll('li')[0]!.text()).toContain('已完成');
    await wrapper.setProps({ complete: true });
    expect(wrapper.find('[aria-current]').exists()).toBe(false);
    expect(wrapper.findAll('.is-done')).toHaveLength(3); wrapper.unmount();
  });
});
