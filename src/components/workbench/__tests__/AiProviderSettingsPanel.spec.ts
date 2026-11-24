import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAiModelSettings, clearAiSessionApiKey, getAiStoredApiKey, hasAiStoredApiKey, loadAiProviderProfiles, saveAiModelSettings, setAiSessionApiKey } from '@/services/ai/AiSettings';
import { useMcpState } from '@/services/ai/useMcpBridge';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
import AiProviderSettingsPanel from '@/components/workbench/AiProviderSettingsPanel.vue';

const ButtonStub = defineComponent({
  props: { disabled: Boolean },
  emits: ['click'],
  setup(props, { emit, slots }) {
    return () => h('button', { disabled: props.disabled, onClick: () => emit('click') }, slots.default?.());
  },
});

const CheckboxStub = defineComponent({
  props: { modelValue: Boolean },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('input', {
      type: 'checkbox',
      checked: props.modelValue,
      onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).checked),
      'onUpdate:modelValue': (value: boolean) => emit('update:modelValue', value),
    });
  },
});

const PassthroughStub = defineComponent({
  setup(_, { slots }) { return () => h('div', slots.default?.()); },
});

const stubs = {
  'el-button': ButtonStub,
  'el-tag': PassthroughStub,
  'el-icon': PassthroughStub,
  'el-form': PassthroughStub,
  'el-form-item': PassthroughStub,
  'el-select': PassthroughStub,
  'el-option': PassthroughStub,
  'el-switch': PassthroughStub,
  'el-input': PassthroughStub,
  'el-input-number': PassthroughStub,
  'el-alert': PassthroughStub,
  'el-checkbox': CheckboxStub,
};

beforeEach(() => {
  localStorage.clear();
  clearAiModelSettings();
  clearAiSessionApiKey();
});

describe('AiProviderSettingsPanel', () => {
  it('opens the inline provider catalog from the empty-state plus card', async () => {
    const wrapper = mount(AiProviderSettingsPanel, { global: { stubs } });

    expect(wrapper.find('.add-first-provider-card').exists()).toBe(true);
    expect(wrapper.find('.provider-catalog-view').exists()).toBe(false);

    await wrapper.find('.add-first-provider-card').trigger('click');

    expect(wrapper.find('.provider-catalog-view').exists()).toBe(true);
    expect(wrapper.findAll('.catalog-card')).toHaveLength(6);
  });

  it('moves directly from provider choice to inline configuration without opening another dialog', async () => {
    const wrapper = mount(AiProviderSettingsPanel, { global: { stubs } });
    await wrapper.find('.add-first-provider-card').trigger('click');
    await wrapper.find('.catalog-card').trigger('click');

    expect(wrapper.find('.provider-detail-view').exists()).toBe(true);
    expect(wrapper.find('.provider-catalog-view').exists()).toBe(false);
    expect(wrapper.find('.provider-list').exists()).toBe(false);
    expect(wrapper.findAll('el-dialog')).toHaveLength(0);
    expect(wrapper.find('.provider-form').exists()).toBe(true);
  });

  it('shows the service address only for custom providers', async () => {
    const standardWrapper = mount(AiProviderSettingsPanel, { global: { stubs } });
    await standardWrapper.find('.add-first-provider-card').trigger('click');
    await standardWrapper.find('.catalog-card').trigger('click');
    expect(standardWrapper.find('.provider-address-field').exists()).toBe(false);

    const customWrapper = mount(AiProviderSettingsPanel, { global: { stubs } });
    await customWrapper.find('.add-first-provider-card').trigger('click');
    await customWrapper.findAll('.catalog-card')[5]!.trigger('click');
    expect(customWrapper.find('.provider-address-field').exists()).toBe(true);
  });
  it('offers local presets with editable address and no key field', async () => {
    for (const label of ['Ollama', 'LM Studio']) {
      const wrapper = mount(AiProviderSettingsPanel, { global: { stubs } });
      await wrapper.find('.add-first-provider-card').trigger('click');
      await wrapper.findAll('.catalog-card').find(card => card.text().includes(label))!.trigger('click');
      expect(wrapper.find('.provider-address-field').exists()).toBe(true);
      expect(wrapper.find('[type="password"]').exists()).toBe(false);
      expect(wrapper.text()).toContain('本地失败不会回退到云端');
      wrapper.unmount();
    }
  });
  it('round-trips local options through export and import without credentials', async () => {
    saveAiModelSettings({ presetId: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3', authMode: 'none', jsonMode: false, timeoutMs: 180000 });
    let exported!: Blob;
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL(blob: Blob) { exported = blob; return 'blob:config'; }
      static revokeObjectURL() {}
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const wrapper = mount(AiProviderSettingsPanel, { global: { stubs } });
    await wrapper.findAll('button').find(button => button.text() === '导出配置')!.trigger('click');
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(exported);
    });
    const payload = JSON.parse(text);
    expect(payload.providers[0]).toMatchObject({ authMode: 'none', jsonMode: false, timeoutMs: 180000 });
    expect(text).not.toContain('apiKey');
    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, 'files', { value: [{ size: text.length, text: async () => text }], configurable: true });
    await input.trigger('change'); await flushPromises();
    expect(loadAiProviderProfiles()).toHaveLength(2);
    expect(loadAiProviderProfiles()[1]).toMatchObject({ authMode: 'none', jsonMode: false, timeoutMs: 180000 });
    wrapper.unmount();
  });
  it('remembers the session key only when asked, and forgets it when unchecked', async () => {
    saveAiModelSettings({ presetId: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' });
    setAiSessionApiKey('panel-secret');
    const saveButton = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('button').find(button => button.text() === '保存配置')!;

    const wrapper = mount(AiProviderSettingsPanel, { global: { stubs } });
    await wrapper.find('.provider-row-main').trigger('click');
    expect(hasAiStoredApiKey()).toBe(false);
    await wrapper.find('input[type="checkbox"]').setValue(true);
    await saveButton(wrapper).trigger('click');
    expect(hasAiStoredApiKey()).toBe(true);
    expect(getAiStoredApiKey()).toBe('panel-secret');
    wrapper.unmount();

    const second = mount(AiProviderSettingsPanel, { global: { stubs } });
    await second.find('.provider-row-main').trigger('click');
    expect((second.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true);
    await saveButton(second).trigger('click');
    expect(hasAiStoredApiKey()).toBe(true);
    expect(getAiStoredApiKey()).toBe('panel-secret');
    await second.find('.provider-row-main').trigger('click');
    await second.find('input[type="checkbox"]').setValue(false);
    await saveButton(second).trigger('click');
    expect(hasAiStoredApiKey()).toBe(false);
    expect(getAiStoredApiKey()).toBe('');
    second.unmount();
  });
  it('keeps advanced options collapsed and places the API key before the model picker', async () => {
    const wrapper = mount(AiProviderSettingsPanel, { global: { stubs } });
    await wrapper.find('.add-first-provider-card').trigger('click');
    await wrapper.find('.catalog-card').trigger('click');
    expect(wrapper.find('.advanced-settings').attributes('open')).toBeUndefined();
    const key = wrapper.find('[type="password"]').element;
    const models = wrapper.find('.model-picker-row').element;
    expect(key.compareDocumentPosition(models) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(wrapper.findAll('button').find(button => button.text() === '获取模型列表')!.attributes('disabled')).toBeDefined();
  });

  it('explains missing fields and disables both save actions', async () => {
    const wrapper = mount(AiProviderSettingsPanel, { global: { stubs } });
    await wrapper.find('.add-first-provider-card').trigger('click');
    await wrapper.findAll('.catalog-card')[5]!.trigger('click');
    const state = (wrapper.vm as any).$.setupState;
    state.selectedProfile.profileName = '';
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.validation-message').text()).toBe('请填写服务商名称。');
    for (const button of wrapper.findAll('button').filter(button => button.text().startsWith('保存'))) {
      expect(button.attributes('disabled')).toBeDefined();
    }
  });

  it('edits the waiting time in seconds while saving milliseconds', async () => {
    saveAiModelSettings({ presetId: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3', authMode: 'none', timeoutMs: 90000 });
    const wrapper = mount(AiProviderSettingsPanel, { global: { stubs } });
    await wrapper.find('.provider-row-main').trigger('click');
    const state = (wrapper.vm as any).$.setupState;
    expect(state.timeoutSeconds).toBe(90);
    state.timeoutSeconds = 120;
    await wrapper.findAll('button').find(button => button.text() === '保存配置')!.trigger('click');
    expect(loadAiProviderProfiles()[0]!.timeoutMs).toBe(120000);
  });

  it('shows the external MCP channel as ready without API keys when connected', async () => {
    const mcp = useMcpState();
    mcp.linkState.value = 'connected';
    const beforeRequests = mcp.dialogRequests.value;
    try {
      const wrapper = mount(AiProviderSettingsPanel, { global: { stubs } });
      expect(wrapper.text()).toContain('已就绪 · 免 API Key');
      expect(wrapper.text()).toContain('无需配置 API Key');
      await wrapper.findAll('button').find(button => button.text() === '管理 MCP 连接')!.trigger('click');
      expect(mcp.dialogRequests.value).toBe(beforeRequests + 1);
      wrapper.unmount();
    } finally {
      mcp.linkState.value = '';
    }
  });

});
