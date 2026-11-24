import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({ startExternalAiBridge: vi.fn() }));
vi.mock('@/services/ai/externalAiBridge', async () => {
  const actual = await vi.importActual<typeof import('@/services/ai/externalAiBridge')>('@/services/ai/externalAiBridge');
  return { ...actual, startExternalAiBridge: bridge.startExternalAiBridge };
});
vi.mock('vue-router', () => ({ useRouter: () => ({ currentRoute: { value: { path: '/' } }, push: vi.fn() }) }));

import McpConnection from '../McpConnection.vue';

const Passthrough = defineComponent({ setup(_, { slots }) { return () => h('div', slots.default?.()); } });
const ButtonStub = defineComponent({
  props: { disabled: Boolean },
  emits: ['click'],
  setup(props, { emit, slots }) { return () => h('button', { disabled: props.disabled, onClick: () => emit('click') }, slots.default?.()); },
});
const DialogStub = defineComponent({
  props: { modelValue: Boolean },
  setup(props, { slots }) { return () => props.modelValue ? h('div', slots.default?.()) : null; },
});
const stubs = { 'el-alert': Passthrough, 'el-tag': Passthrough, 'el-button': ButtonStub, 'el-dialog': DialogStub, 'el-radio-group': Passthrough, 'el-radio-button': Passthrough };
const baseUrl = import.meta.env.BASE_URL;

beforeEach(() => { vi.resetModules(); bridge.startExternalAiBridge.mockReset(); });

describe('主页 MCP 连接', () => {
  it('直接显示全部简历的接入命令，并反映本机握手', async () => {
    let report: ((state: 'waiting' | 'connected' | 'reconnecting') => void) | undefined;
    bridge.startExternalAiBridge.mockImplementation(async (_library, _signal, onLink) => {
      report = onLink as typeof report;
      onLink('waiting');
      return () => undefined;
    });
    const wrapper = mount(McpConnection, { global: { stubs } });
    const button = (text: string) => wrapper.findAll('button').find(item => item.text() === text)!;
    expect(wrapper.text()).toBe('外部 AI');
    await button('外部 AI').trigger('click');
    expect(wrapper.text()).toContain('全部简历');
    expect(wrapper.find('pre').text()).toContain(`${location.origin}${baseUrl}ai-relay/relay.mjs`);
    await button('启用 MCP 桥接').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('尚未连接本机 relay');
    report?.('connected');
    await flushPromises();
    expect(wrapper.text()).toContain('本机 relay 已连接');
    wrapper.unmount();
  });
});
