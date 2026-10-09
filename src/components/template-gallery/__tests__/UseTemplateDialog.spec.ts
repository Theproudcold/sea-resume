import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import UseTemplateDialog from '@/components/template-gallery/UseTemplateDialog.vue';

const createWrapper = (canApplyToCurrent: boolean) =>
  mount(UseTemplateDialog, {
    props: {
      visible: true,
      templateName: '现代简约',
      canApplyToCurrent,
    },
    global: {
      stubs: {
        ElDialog: {
          props: ['modelValue'],
          template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>',
        },
        ElButton: {
          props: ['disabled'],
          emits: ['click'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
        },
      },
    },
  });

describe('UseTemplateDialog', () => {
  it('disables apply action when there is no current resume context', () => {
    const wrapper = createWrapper(false);
    expect(wrapper.text()).toContain('需从编辑页进入后才能应用到当前简历');
    const buttons = wrapper.findAll('button');
    expect(buttons[1]?.attributes('disabled')).toBeDefined();
  });

  it('emits create action when create button is clicked', async () => {
    const wrapper = createWrapper(true);
    const buttons = wrapper.findAll('button');
    await buttons[0]?.trigger('click');
    expect(wrapper.emitted('create')).toHaveLength(1);
  });
});
