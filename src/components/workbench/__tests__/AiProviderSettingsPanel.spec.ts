import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAiModelSettings, clearAiSessionApiKey } from '@/services/ai/AiSettings';
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
    expect(wrapper.findAll('.catalog-card')).toHaveLength(4);
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
    await customWrapper.findAll('.catalog-card')[3]!.trigger('click');
    expect(customWrapper.find('.provider-address-field').exists()).toBe(true);
  });
});
