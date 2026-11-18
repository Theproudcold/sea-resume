import templatePreviewSource from '@/components/template-gallery/TemplatePreviewDialog.vue?raw';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TemplatePreviewDialog from '@/components/template-gallery/TemplatePreviewDialog.vue';
import { builtinTemplates } from '@/stores/template';

vi.mock('@/components/preview/template-registry', () => ({ getTemplateComponent: () => undefined }));

const createWrapper = (canApplyToCurrent: boolean) =>
  mount(TemplatePreviewDialog, {
    props: {
      visible: true,
      template: builtinTemplates[0]!,
      previewData: {} as never,
      canApplyToCurrent,
    },
    global: {
      stubs: {
        ElDialog: { template: '<div><slot /><slot name="footer" /></div>' },
        ElButton: {
          props: ['disabled', 'type', 'loading'],
          emits: ['click'],
          template: '<button :disabled="disabled || loading" :data-type="type" @click="$emit(\'click\')"><slot /></button>',
        },
        ElTag: true,
        ElEmpty: true,
      },
    },
  });

afterEach(() => vi.unstubAllGlobals());

describe('TemplatePreviewDialog', () => {
  it('offers one primary creation action without an irrelevant disabled apply action', async () => {
    const wrapper = createWrapper(false);
    const buttons = wrapper.findAll('button');
    expect(buttons.map((button) => button.text())).toEqual(['返回模板库', '用此模板新建']);
    expect(buttons[1]!.attributes('data-type')).toBe('primary');
    await buttons[1]!.trigger('click');
    expect(wrapper.emitted('create')).toHaveLength(1);
  });

  it('prioritizes applying to the current resume and explains that builtin templates keep content', async () => {
    const wrapper = createWrapper(true);
    const apply = wrapper.findAll('button').find((button) => button.text() === '使用此模板')!;
    expect(wrapper.text()).toContain('已填写的内容保持不变');
    expect(apply.attributes('data-type')).toBe('primary');
    await apply.trigger('click');
    expect(wrapper.emitted('apply')).toHaveLength(1);
  });

  it('warns that custom templates replace the current content', async () => {
    const wrapper = createWrapper(true);
    await wrapper.setProps({ template: { ...builtinTemplates[0]!, source: 'custom' } });
    expect(wrapper.text()).toContain('使用时会替换当前内容');
  });

  it('resets the shared horizontal flex basis when stacking mobile actions', () => {
    const mobileStyle = templatePreviewSource.slice(templatePreviewSource.indexOf('@media (max-width: 768px)'));
    const buttonRule = mobileStyle.match(/\.preview-dialog__actions :deep\(\.el-button\)\s*\{([^}]+)\}/)?.[1];
    // The shared flex-basis: 120px must not become a 120px button height in a column.
    expect(buttonRule).toContain('flex: 0 0 auto;');
    expect(buttonRule).toContain('min-height: 40px;');
  });

  it('fits the A4 page to available width and disconnects its observer', async () => {
    let resize: ResizeObserverCallback | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      observe() {}
      disconnect = disconnect;
    });
    const wrapper = createWrapper(false);
    await wrapper.vm.$nextTick();
    resize!([{ contentRect: { width: 320 } } as ResizeObserverEntry], {} as ResizeObserver);
    await wrapper.vm.$nextTick();
    expect(Number((wrapper.get('.preview-dialog__paper').element as HTMLElement).style.getPropertyValue('--preview-scale'))).toBeCloseTo(320 / 796);
    wrapper.unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
