import { nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RichTextEditor from '../RichTextEditor.vue';

const state = vi.hoisted(() => ({ quill: undefined as any }));
vi.mock('@vueup/vue-quill', async () => {
  const { defineComponent, onMounted } = await import('vue');
  return {
    QuillEditor: defineComponent({
      name: 'QuillEditor',
      props: ['content'],
      emits: ['ready', 'update:content'],
      setup(props, { expose, emit }) {
        const quill = {
          root: { innerHTML: props.content },
          clipboard: { convert: vi.fn((html: string) => html) },
          getSelection: vi.fn(() => ({ index: 4, length: 0 })),
          getLength: vi.fn(() => 6),
          setSelection: vi.fn(),
          setContents: vi.fn((html: string) => {
            quill.root.innerHTML = html;
            // Deliberately echo even API changes, to exercise the feedback guard.
            emit('update:content', html);
          }),
        };
        state.quill = quill;
        expose({ getQuill: () => quill });
        onMounted(() => emit('ready', quill));
      },
      template: '<div class="ql-editor" contenteditable="true" />',
    }),
  };
});
let wrapper: VueWrapper | undefined;
const render = () => {
  wrapper = mount(RichTextEditor, { props: { modelValue: '<p>初始文字</p>' } });
  return { editor: wrapper.findComponent({ name: 'QuillEditor' }), quill: state.quill };
};
afterEach(() => wrapper?.unmount());

describe('RichTextEditor equality and composition guards', () => {
  it('emits user updates once and does not rewrite DOM/selection for store echoes', async () => {
    const { editor, quill } = render();
    editor.vm.$emit('update:content', '<p>初始文字</p>');
    expect(wrapper!.emitted('update:modelValue')).toBeUndefined();
    quill.root.innerHTML = '<p>新文字</p>';
    editor.vm.$emit('update:content', '<p>新文字</p>');
    editor.vm.$emit('update:content', '<p>新文字</p>');
    await wrapper!.setProps({ modelValue: '<p>新文字</p>' });
    expect(wrapper!.emitted('update:modelValue')).toEqual([['<p>新文字</p>']]);
    expect(quill.setContents).not.toHaveBeenCalled();
    expect(quill.setSelection).not.toHaveBeenCalled();
  });

  it('silently applies undo/import once without emitting, preserving a clamped selection', async () => {
    const { editor, quill } = render();
    quill.getSelection.mockReturnValue({ index: 20, length: 5 });
    await wrapper!.setProps({ modelValue: '<p>撤销</p>' });
    expect(editor.props('content')).toBe('<p>撤销</p>');
    expect(quill.setContents).toHaveBeenCalledExactlyOnceWith('<p>撤销</p>', 'silent');
    expect(quill.setSelection).toHaveBeenCalledExactlyOnceWith(5, 0, 'silent');
    expect(wrapper!.emitted('update:modelValue')).toBeUndefined();
    editor.vm.$emit('update:content', '<p>撤销</p>');
    expect(wrapper!.emitted('update:modelValue')).toBeUndefined();
  });

  it('does not reset Chinese composition on own echoes and defers external changes until composition ends', async () => {
    const { editor, quill } = render();
    await wrapper!.find('.ql-editor').trigger('compositionstart');
    quill.root.innerHTML = '<p>中文输入</p>';
    editor.vm.$emit('update:content', '<p>中文输入</p>');
    await wrapper!.setProps({ modelValue: '<p>中文输入</p>' });
    expect(quill.setContents).not.toHaveBeenCalled();
    await wrapper!.setProps({ modelValue: '<p>外部导入</p>' });
    expect(quill.setContents).not.toHaveBeenCalled();
    editor.vm.$emit('update:content', '<p>中文输入中</p>');
    await wrapper!.find('.ql-editor').trigger('compositionend');
    await nextTick();
    expect(quill.setContents).toHaveBeenCalledExactlyOnceWith('<p>外部导入</p>', 'silent');
    expect(wrapper!.emitted('update:modelValue')).toEqual([['<p>中文输入</p>']]);
  });

  it('uses the latest external value if pending composition changes are reversed', async () => {
    const { quill } = render();
    await wrapper!.find('.ql-editor').trigger('compositionstart');
    await wrapper!.setProps({ modelValue: '<p>临时导入</p>' });
    await wrapper!.setProps({ modelValue: '<p>初始文字</p>' });
    await wrapper!.find('.ql-editor').trigger('compositionend');
    await nextTick();
    expect(quill.setContents).not.toHaveBeenCalled();
  });
});
