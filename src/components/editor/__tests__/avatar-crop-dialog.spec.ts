import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import AvatarCropDialog from '../AvatarCropDialog.vue';
import type { LoadedAvatar } from '@/utils/avatarImage';

const SOURCE: LoadedAvatar = {
  image: {} as HTMLImageElement,
  width: 800,
  height: 400,
  objectUrl: 'blob:avatar',
};

// 与仓库内其他对话框测试一致：只替换 Element Plus 的外壳，组件自身的取景逻辑保持真实。
// 真实弹窗的挂载、遮罩与过渡放到浏览器里验证。
const stubs = {
  ElDialog: { name: 'ElDialog', props: ['modelValue'], emits: ['open'], template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>' },
  ElSlider: { name: 'ElSlider', props: ['modelValue'], template: '<div class="slider-stub" />' },
  ElButton: { name: 'ElButton', template: '<button><slot /></button>' },
};

/** jsdom 没有 canvas 实现，替换成记录调用的替身。 */
function stubCanvas() {
  const drawImage = vi.fn();
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag !== 'canvas') return document.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElement;
    return {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toDataURL: () => 'data:image/jpeg;base64,Y3JvcA==',
    } as unknown as HTMLCanvasElement;
  });
  return { drawImage };
}

/** jsdom 没有排版，取景框回落到 260px 兜底边长，几何因此是确定的。 */
const VIEWPORT = 260;
const FIT_SCALE = 260 / 400;

async function render(source: LoadedAvatar | null = SOURCE, shape: 'circle' | 'square' = 'circle'): Promise<VueWrapper> {
  const wrapper = mount(AvatarCropDialog, {
    props: { modelValue: true, source, shape },
    global: { stubs },
  });
  await flushPromises();
  // 真实弹窗的 open 事件负责测量并建立初始取景。
  wrapper.findComponent({ name: 'ElDialog' }).vm.$emit('open');
  await nextTick();
  return wrapper;
}

function pointer(stage: Element, type: string, x: number, y: number) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { clientX: x, clientY: y, pointerId: 1 });
  stage.dispatchEvent(event);
}

function findButton(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === label);
  if (!button) throw new Error(`找不到按钮：${label}`);
  return button;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('avatar crop dialog', () => {
  it('shows the picked photo fitted to the viewport and follows the stored shape', async () => {
    const wrapper = await render(SOURCE, 'square');

    const stage = wrapper.find('.crop-stage');
    expect(stage.classes()).toContain('is-square');
    expect(wrapper.find('img.crop-image').attributes('src')).toBe('blob:avatar');

    const image = wrapper.find('img.crop-image').element as HTMLElement;
    expect(image.style.width).toBe(`${800 * FIT_SCALE}px`);
    expect(image.style.height).toBe(`${400 * FIT_SCALE}px`);
    expect(image.style.transform).toBe(`translate3d(${(VIEWPORT - 800 * FIT_SCALE) / 2}px, 0px, 0)`);
  });

  it('keeps the circular mask while the stored shape is a circle', async () => {
    const wrapper = await render(SOURCE, 'circle');
    expect(wrapper.find('.crop-stage').classes()).toContain('is-circle');
  });

  it('emits the dragged region instead of the centered one', async () => {
    const { drawImage } = stubCanvas();
    const wrapper = await render();
    const stage = wrapper.find('.crop-stage').element;

    pointer(stage, 'pointerdown', 130, 130);
    pointer(stage, 'pointermove', 65, 130);
    pointer(stage, 'pointerup', 65, 130);
    await nextTick();

    await findButton(wrapper, '应用').trigger('click');

    expect(wrapper.emitted('confirm')?.[0]?.[0]).toBe('data:image/jpeg;base64,Y3JvcA==');
    // 向左拖 65px：源图偏移从 -130 变为 -195，取景区域从居中 (200,0) 移到 (300,0)。
    expect(drawImage).toHaveBeenCalledWith(SOURCE.image, 300, 0, 400, 400, 0, 0, 256, 256);
  });

  it('pans with the arrow keys so the framing is reachable without a pointer', async () => {
    const wrapper = await render();
    const stage = wrapper.find('.crop-stage');

    await stage.trigger('keydown', { key: 'ArrowRight' });

    const image = wrapper.find('img.crop-image').element as HTMLElement;
    expect(image.style.transform).toBe('translate3d(-122px, 0px, 0)');
  });

  it('cancels without touching the resume', async () => {
    const wrapper = await render();

    await findButton(wrapper, '取消').trigger('click');

    const updates = wrapper.emitted('update:modelValue');
    expect(updates?.[updates.length - 1]).toEqual([false]);
    expect(wrapper.emitted('confirm')).toBeUndefined();
  });

  it('does nothing when there is no source to crop', async () => {
    const wrapper = await render(null);

    await findButton(wrapper, '应用').trigger('click');

    expect(wrapper.emitted('confirm')).toBeUndefined();
  });
});
