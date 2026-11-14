import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import PanelSplitter from '@/components/common/PanelSplitter.vue';

const render = (props: Record<string, unknown> = {}) => mount(PanelSplitter, {
  props: { label: '调整模块导航宽度', ...props },
  global: { stubs: { 'el-icon': { template: '<i><slot /></i>' } } },
});

describe('栏间分隔条', () => {
  it('暴露分隔条语义与宽度区间', () => {
    const wrapper = render({ value: 232, min: 168, max: 360 });
    const handle = wrapper.get('[role="separator"]');
    expect(handle.attributes('aria-orientation')).toBe('vertical');
    expect(handle.attributes('aria-label')).toBe('调整模块导航宽度');
    expect(handle.attributes('aria-valuenow')).toBe('232');
    expect(handle.attributes('aria-valuemin')).toBe('168');
    expect(handle.attributes('aria-valuemax')).toBe('360');
    expect(handle.attributes('tabindex')).toBe('0');
  });

  it('拖拽按位移增量上报宽度变化', async () => {
    const wrapper = render();
    const handle = wrapper.get('[role="separator"]');
    await handle.trigger('pointerdown', { clientX: 100, button: 0, pointerId: 1 });
    await handle.trigger('pointermove', { clientX: 140 });
    await handle.trigger('pointermove', { clientX: 190 });
    await handle.trigger('pointerup', { pointerId: 1 });
    await handle.trigger('pointermove', { clientX: 260 });
    expect(wrapper.emitted('resize')).toEqual([[40], [50]]);
  });

  it('忽略非左键拖拽', async () => {
    const wrapper = render();
    const handle = wrapper.get('[role="separator"]');
    await handle.trigger('pointerdown', { clientX: 100, button: 2 });
    await handle.trigger('pointermove', { clientX: 160 });
    expect(wrapper.emitted('resize')).toBeUndefined();
  });

  it('键盘方向键调整宽度，Shift 加速', async () => {
    const wrapper = render({ value: 232, min: 168, max: 360 });
    const handle = wrapper.get('[role="separator"]');
    await handle.trigger('keydown', { key: 'ArrowRight' });
    await handle.trigger('keydown', { key: 'ArrowLeft' });
    await handle.trigger('keydown', { key: 'ArrowRight', shiftKey: true });
    await handle.trigger('keydown', { key: 'Home' });
    await handle.trigger('keydown', { key: 'End' });
    expect(wrapper.emitted('resize')).toEqual([[16], [-16], [64], [168 - 232], [360 - 232]]);
  });

  it('回车与按钮都能折叠展开栏目', async () => {
    const wrapper = render();
    await wrapper.get('[role="separator"]').trigger('keydown', { key: 'Enter' });
    await wrapper.get('.panel-splitter__toggle').trigger('click');
    expect(wrapper.emitted('toggle')).toHaveLength(2);
    await wrapper.get('[role="separator"]').trigger('dblclick');
    expect(wrapper.emitted('reset')).toHaveLength(1);
  });

  it('折叠后不再拖拽，但按钮仍可展开', async () => {
    const wrapper = render({ collapsed: true });
    const handle = wrapper.get('[role="separator"]');
    expect(handle.attributes('tabindex')).toBe('-1');
    expect(wrapper.get('.panel-splitter__toggle').attributes('aria-expanded')).toBe('false');
    await handle.trigger('pointerdown', { clientX: 100, button: 0 });
    await handle.trigger('pointermove', { clientX: 160 });
    expect(wrapper.emitted('resize')).toBeUndefined();
    await wrapper.get('.panel-splitter__toggle').trigger('click');
    expect(wrapper.emitted('toggle')).toHaveLength(1);
  });

  it('不允许折叠时按钮禁用', () => {
    const wrapper = render({ toggleable: false });
    expect(wrapper.get('.panel-splitter__toggle').attributes('disabled')).toBeDefined();
  });
});
