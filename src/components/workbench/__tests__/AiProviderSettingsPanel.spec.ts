import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAiModelSettings, clearAiSessionApiKey, loadAiProviderProfiles, saveAiModelSettings } from '@/services/ai/AiSettings';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
import AiProviderSettingsPanel from '@/components/workbench/AiProviderSettingsPanel.vue';

const ButtonStub = defineComponent({
  props: { disabled: Boolean },
  emits: ['click'],
  setup(props, { emit, slots }) {
    return () => h('button', { disabled: props.disabled, onClick: () => emit('click') }, slots.default?.());
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
});
