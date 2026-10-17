import { defineComponent, h, ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lazyFeature } from '@/utils/lazyFeature';

afterEach(() => vi.restoreAllMocks());

describe('lazy feature loading', () => {
  it('does not load until first activation and preserves local state after closing', async () => {
    const loader = vi.fn().mockResolvedValue({ default: defineComponent({
      props: ['modelValue'], emits: ['update:modelValue'],
      setup(props, { emit }) {
        const count = ref(0);
        return () => h('button', { onClick: () => { count.value++; emit('update:modelValue', false); } }, `${props.modelValue}:${count.value}`);
      },
    }) });
    const onUpdate = vi.fn();
    const wrapper = mount(lazyFeature(loader), { props: { active: false }, attrs: { modelValue: true, 'onUpdate:modelValue': onUpdate } });
    await flushPromises();
    expect(loader).not.toHaveBeenCalled();
    await wrapper.setProps({ active: true });
    await flushPromises();
    await wrapper.get('button').trigger('click');
    expect(onUpdate).toHaveBeenCalledWith(false);
    await wrapper.setProps({ active: false });
    await wrapper.setProps({ active: true });
    expect(wrapper.get('button').text()).toBe('true:1');
    expect(loader).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('shows a loading status for a pending import', async () => {
    vi.useFakeTimers();
    let resolve!: (value: { default: ReturnType<typeof defineComponent> }) => void;
    const wrapper = mount(lazyFeature(() => new Promise((done) => { resolve = done; })));
    await vi.advanceTimersByTimeAsync(120);
    expect(wrapper.get('[role="status"]').text()).toContain('加载');
    resolve({ default: defineComponent(() => () => h('p', 'Ready')) });
    await flushPromises();
    expect(wrapper.text()).toBe('Ready');
    wrapper.unmount();
    vi.useRealTimers();
  });

  it('allows retry after a load failure without refreshing the page', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const loader = vi.fn().mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ default: defineComponent(() => () => h('p', 'Recovered')) });
    const wrapper = mount(lazyFeature(loader));
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('加载失败');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toBe('Recovered');
    expect(loader).toHaveBeenCalledTimes(3);
    wrapper.unmount();
  });
});
