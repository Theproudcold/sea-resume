import { defineComponent, h, reactive } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resume = reactive({ id: 'resume-1', basic: {}, title: '简历' });
vi.mock('@/stores/resume', () => ({
  useResumeStore: () => ({
    data: resume,
    exportData: () => JSON.parse(JSON.stringify(resume)),
    applyChangeProposal: vi.fn(),
  }),
}));

import ExternalAiPanel from '@/components/ai/ExternalAiPanel.vue';

const Passthrough = defineComponent({ setup(_, { slots }) { return () => h('div', slots.default?.()); } });
const ButtonStub = defineComponent({
  props: { disabled: Boolean },
  emits: ['click'],
  setup(props, { emit, slots }) { return () => h('button', { disabled: props.disabled, onClick: () => emit('click') }, slots.default?.()); },
});
const CheckboxStub = defineComponent({
  props: { modelValue: Boolean },
  emits: ['update:modelValue'],
  setup(props, { emit }) { return () => h('input', { type: 'checkbox', checked: props.modelValue, onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).checked) }); },
});
const stubs = {
  'el-drawer': Passthrough, 'el-alert': Passthrough, 'el-tag': Passthrough, 'el-checkbox': CheckboxStub, 'el-button': ButtonStub,
  'el-radio-group': Passthrough, 'el-radio-button': Passthrough, 'el-collapse': Passthrough, 'el-collapse-item': Passthrough,
  'el-form-item': Passthrough, 'el-input': Passthrough,
};

async function authorize() {
  const wrapper = mount(ExternalAiPanel, { props: { visible: true }, global: { stubs } });
  await wrapper.find('input[type="checkbox"]').setValue(true);
  await wrapper.findAll('button')[0]!.trigger('click');
  await flushPromises();
  return wrapper;
}

beforeEach(() => { vi.unstubAllGlobals(); resume.id = 'resume-1'; });

describe('外部 AI 面板接入', () => {
  it('授权后给出可直接粘贴的一行命令和一句话，且不带 npm ci', async () => {
    const wrapper = await authorize();
    const command = wrapper.find('pre').text();
    expect(command).toContain('http://localhost:3000/ai-relay/relay.mjs');
    expect(command).toContain('codex mcp add sea-resume -- node "$HOME/.sea-resume-ai-relay/relay.mjs"');
    expect(command).toContain('--host 127.0.0.1 --widget-origin http://localhost:3000 --max-payload 500000');
    expect(command).not.toContain('npm ci');
    expect(wrapper.text()).toContain('复制给 AI 的一句话');
    expect(wrapper.text()).toContain('启用 MCP 桥接');
    wrapper.unmount();
  });

  it('复制按钮写入剪贴板，Windows 分支改用 PowerShell', async () => {
    const writeText = vi.fn(async (_value: string) => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const wrapper = await authorize();
    const button = (text: string) => wrapper.findAll('button').find(item => item.text() === text)!;
    await button('复制终端命令').trigger('click');
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('codex mcp add'));
    await button('复制给 AI 的一句话').trigger('click');
    await flushPromises();
    expect(writeText.mock.calls[1]![0]).toContain('sea_resume_get_context');
    wrapper.unmount();
  });

  it('撤销授权或关闭面板后回到授权表单', async () => {
    const wrapper = await authorize();
    const revoke = wrapper.findAll('button').find(button => button.text() === '撤销授权')!;
    await revoke.trigger('click');
    expect(wrapper.text()).toContain('授权当前简历');
    wrapper.unmount();
  });
});
