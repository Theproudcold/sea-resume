import { defineComponent } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SmoothCollapse from '../SmoothCollapse.vue';

let wrapper: VueWrapper | undefined;
let reduced: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
let print: typeof reduced;
const Harness = defineComponent({
  components: { SmoothCollapse },
  props: { open: { default: true } },
  template: `<section><SmoothCollapse><div v-show="open" class="existing-body" style="padding-top: 12px; overflow: visible;"><input value="保留草稿" /></div></SmoothCollapse><SmoothCollapse><div v-show="true" class="other-body">other</div></SmoothCollapse></section>`,
});
const render = () => {
  wrapper = mount(Harness, { global: { stubs: { transition: false } } });
  const body = wrapper.find('.existing-body').element as HTMLElement;
  const measure = vi.spyOn(body, 'getBoundingClientRect').mockReturnValue({ height: 180 } as DOMRect);
  const otherMeasure = vi.spyOn(wrapper.find('.other-body').element, 'getBoundingClientRect');
  return { body, measure, otherMeasure, input: wrapper.find('input').element };
};

beforeEach(() => {
  vi.useFakeTimers();
  reduced = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  print = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', vi.fn((query: string) => query === 'print' ? print : reduced));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 16));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SmoothCollapse v-show lifecycle', () => {
  it('starts expanded without measurement and restores auto height, styles and existing content', async () => {
    const { body, measure, otherMeasure, input } = render();
    expect(body.style.display).not.toBe('none');
    expect(measure).not.toHaveBeenCalled();
    await wrapper!.setProps({ open: false });
    expect(body.style.height).toBe('180px');
    await vi.advanceTimersByTimeAsync(16);
    expect(body.style.height).toBe('0px');
    expect(body.style.transition).toContain('200ms');
    expect(body.style.paddingTop).toBe('0px');
    await vi.advanceTimersByTimeAsync(250);
    expect(body.style.display).toBe('none');
    expect(body.style.height).toBe('');
    expect(body.style.transition).toBe('');
    expect(body.style.overflow).toBe('visible');
    expect(body.style.paddingTop).toBe('12px');
    await wrapper!.setProps({ open: true });
    expect(body.style.height).toBe('0px');
    await vi.advanceTimersByTimeAsync(266);
    expect(body.style.display).not.toBe('none');
    expect(body.style.height).toBe('');
    expect(wrapper!.find('input').element).toBe(input);
    expect(input.value).toBe('保留草稿');
    expect(otherMeasure).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reverses rapidly from the current height and cancels stale completion work', async () => {
    const { body, measure } = render();
    await wrapper!.setProps({ open: false });
    await vi.advanceTimersByTimeAsync(16);
    measure.mockReturnValueOnce({ height: 74 } as DOMRect);
    await wrapper!.setProps({ open: true });
    expect(body.style.height).toBe('74px');
    expect(body.style.display).not.toBe('none');
    await vi.advanceTimersByTimeAsync(16);
    expect(body.style.height).toBe('180px');
    measure.mockReturnValueOnce({ height: 120 } as DOMRect);
    await wrapper!.setProps({ open: false });
    expect(body.style.height).toBe('120px');
    await vi.advanceTimersByTimeAsync(266);
    expect(body.style.display).toBe('none');
    expect(body.style.height).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['before-frame', 'during-animation'])('cleans up pending work and original inline styles on unmount: %s', async (phase) => {
    const { body } = render();
    const remove = vi.spyOn(body, 'removeEventListener');
    await wrapper!.setProps({ open: false });
    if (phase === 'during-animation') await vi.advanceTimersByTimeAsync(16);
    wrapper!.unmount();
    wrapper = undefined;
    expect(body.style.height).toBe('');
    expect(body.style.overflow).toBe('visible');
    expect(body.style.paddingTop).toBe('12px');
    expect(remove).toHaveBeenCalledWith('transitionend', expect.any(Function));
    expect(reduced.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['reduced', 'print'])('skips animation with %s media', async (media) => {
    (media === 'print' ? print : reduced).matches = true;
    const { body } = render();
    await wrapper!.setProps({ open: false });
    expect(body.style.display).toBe('none');
    expect(body.style.height).toBe('');
    expect(body.style.transition).toBe('');
    expect(vi.getTimerCount()).toBe(0);
    await wrapper!.setProps({ open: true });
    expect(body.style.display).not.toBe('none');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('finishes and removes listeners if reduced motion is enabled mid-animation', async () => {
    const { body } = render();
    await wrapper!.setProps({ open: false });
    await vi.advanceTimersByTimeAsync(16);
    reduced.matches = true;
    reduced.addEventListener.mock.calls[0]![1]();
    expect(body.style.display).toBe('none');
    expect(body.style.height).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });
});
