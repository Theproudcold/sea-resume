import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TemplatePreviewDialog from '@/components/template-gallery/TemplatePreviewDialog.vue';

const createWrapper = (canApplyToCurrent: boolean) =>
  mount(TemplatePreviewDialog, {
    props: {
      visible: true,
      template: null,
      previewData: {} as never,
      canApplyToCurrent,
    },
    global: {
      stubs: {
        ElDialog: {
          template: '<div><slot /><slot name="footer" /></div>',
        },
        ElButton: {
          props: ['disabled', 'type'],
          emits: ['click'],
          template: '<button :disabled="disabled" :data-type="type" @click="$emit(\'click\')"><slot /></button>',
        },
        ElTag: true,
        ElEmpty: true,
      },
    },
  });

describe('TemplatePreviewDialog', () => {
  it('offers creation first and explains why apply is unavailable without a current resume', () => {
    const wrapper = createWrapper(false);
    const buttons = wrapper.findAll('button');

    expect(wrapper.text()).toContain('应用到当前简历需从编辑器进入模板库。');
    expect(buttons[0]?.attributes('data-type')).toBe('primary');
    expect(buttons[1]?.attributes('disabled')).toBeDefined();
  });

  it('prioritizes applying to the current resume when entered from the editor', async () => {
    const wrapper = createWrapper(true);
    const buttons = wrapper.findAll('button');

    expect(buttons[0]?.attributes('data-type')).toBe('default');
    expect(buttons[1]?.attributes('data-type')).toBe('primary');
    await buttons[1]?.trigger('click');
    expect(wrapper.emitted('apply')).toHaveLength(1);
  });
});
