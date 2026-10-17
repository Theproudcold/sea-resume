import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ResumeCanvas from '../ResumeCanvas.vue';

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];
  observe = vi.fn();
  disconnect = vi.fn();
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverMock.instances.push(this);
  }
  notify() { this.callback([], this as unknown as ResizeObserver); }
}

class IntersectionObserverMock {
  static instances: IntersectionObserverMock[] = [];
  observe = vi.fn();
  disconnect = vi.fn();
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    IntersectionObserverMock.instances.push(this);
  }
  notify() {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

describe('ResumeCanvas pagination', () => {
  let wrapper: VueWrapper | undefined;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  let visible: boolean;
  let contentHeight: number;
  let physicalHeight: number;
  let readHeight: ReturnType<typeof vi.fn>;
  let readRuler: ReturnType<typeof vi.fn>;
  let fonts: EventTarget & { ready: Promise<void> };
  let resolveFonts: () => void;
  let originalFonts: PropertyDescriptor | undefined;

  const resize = () => ResizeObserverMock.instances[0]!.notify();
  const render = () => {
    wrapper = mount(ResumeCanvas, {
      attachTo: document.body,
      slots: { default: '<article><p>Resume</p><img src="avatar.png"></article>' },
    });
    return wrapper;
  };
  const flushFrame = async () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
    await nextTick();
    await Promise.resolve();
  };

  beforeEach(() => {
    ResizeObserverMock.instances = [];
    IntersectionObserverMock.instances = [];
    frames = new Map();
    nextFrame = 0;
    visible = true;
    contentHeight = 2400;
    physicalHeight = 1000;
    readHeight = vi.fn(() => contentHeight);
    readRuler = vi.fn(() => ({ width: 1, height: physicalHeight }) as DOMRect);
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)));
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function () {
      return (visible ? [{ width: 794, height: 1000 }] : []) as unknown as DOMRectList;
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('a4-ruler') ? readRuler() : new DOMRect();
    });
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      // Marker overflow on the canvas must not be used as the content height.
      return this.classList.contains('resume-canvas-content') ? readHeight() : 99999;
    });
    originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
    fonts = Object.assign(new EventTarget(), {
      ready: new Promise<void>((resolve) => { resolveFonts = resolve; }),
    });
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
    else Reflect.deleteProperty(document, 'fonts');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('batches mutations, resize, fonts and image events into one measurement per frame', async () => {
    const view = render();
    resize();
    resize();
    view.get('p').element.textContent = 'Updated';
    view.get('img').element.dispatchEvent(new Event('load'));
    resolveFonts();
    fonts.dispatchEvent(new Event('loadingdone'));
    await nextTick();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).not.toHaveBeenCalled();
    await flushFrame();
    expect(readHeight).toHaveBeenCalledTimes(1);
    expect(view.findAll('.page-break-line')).toHaveLength(2);
    expect(frames.size).toBe(0);

    // Executing the callback clears the pending ID, allowing the next frame.
    resize();
    resize();
    expect(frames.size).toBe(1);
    await flushFrame();
    expect(readHeight).toHaveBeenCalledTimes(2);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
  });

  it('observes only slot content and never schedules itself from marker updates', async () => {
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    const view = render();
    const content = view.get('.resume-canvas-content').element;
    expect(ResizeObserverMock.instances[0]!.observe).toHaveBeenCalledExactlyOnceWith(content);
    expect(observe).toHaveBeenCalledExactlyOnceWith(content, {
      childList: true, subtree: true, characterData: true, attributes: true,
    });
    await flushFrame();
    expect(frames.size).toBe(0);
    const marker = view.get('.page-break-line').element;
    expect(content.contains(marker)).toBe(false);
    marker.textContent = 'Not resume content';
    await nextTick();
    expect(frames.size).toBe(0);
    view.get('article').element.setAttribute('style', 'font-size: 18px');
    await nextTick();
    expect(frames.size).toBe(1);
  });

  it('reuses the ruler and skips DOM writes when the page count is unchanged', async () => {
    const view = render();
    const ruler = view.get('.a4-ruler').element;
    await flushFrame();
    const mutations = vi.fn();
    const observer = new MutationObserver(mutations);
    observer.observe(view.get('.resume-canvas').element, { childList: true, subtree: true, attributes: true });
    contentHeight = 2500;
    resize();
    await flushFrame();
    expect(readRuler).toHaveBeenCalledTimes(1);
    expect(view.get('.a4-ruler').element).toBe(ruler);
    expect(mutations).not.toHaveBeenCalled();
    observer.disconnect();

    physicalHeight = 1200;
    window.dispatchEvent(new Event('resize'));
    await flushFrame();
    expect(readRuler).toHaveBeenCalledTimes(2);
    expect(view.get('.a4-ruler').element).toBe(ruler);
  });

  it('skips hidden layout reads and remeasures when ResizeObserver reports restoration', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    visible = false;
    const view = render();
    await flushFrame();
    expect(readHeight).not.toHaveBeenCalled();
    expect(readRuler).not.toHaveBeenCalled();
    expect(view.findAll('.page-break-line')).toHaveLength(0);
    visible = true;
    resize();
    await flushFrame();
    expect(view.findAll('.page-break-line')).toHaveLength(2);

    visible = false;
    contentHeight = 1200;
    resize();
    await flushFrame();
    expect(readHeight).toHaveBeenCalledTimes(1);
    expect(view.findAll('.page-break-line')).toHaveLength(2);
    visible = true;
    resize();
    await flushFrame();
    expect(view.findAll('.page-break-line')).toHaveLength(1);
  });

  it('remeasures on intersection, later fonts, image loads/errors and image-driven resize', async () => {
    const view = render();
    await flushFrame();
    const triggers = [
      () => IntersectionObserverMock.instances[0]!.notify(),
      () => fonts.dispatchEvent(new Event('loadingdone')),
      () => view.get('img').element.dispatchEvent(new Event('load')),
      () => view.get('img').element.dispatchEvent(new Event('error')),
      resize,
    ];
    for (const [index, trigger] of triggers.entries()) {
      contentHeight = (index + 3) * 1000 + 500;
      trigger();
      expect(frames.size).toBe(1);
      await flushFrame();
      expect(readHeight).toHaveBeenCalledTimes(index + 2);
      expect(view.findAll('.page-break-line')).toHaveLength(index + 3);
    }
    contentHeight = 1500;
    resolveFonts();
    await Promise.resolve();
    await flushFrame();
    expect(view.findAll('.page-break-line')).toHaveLength(1);
  });

  it('preserves export selectors, marker positioning and no-print exclusions', async () => {
    const view = render();
    await flushFrame();
    const canvas = document.querySelector('.resume-canvas')!;
    expect(canvas.querySelector('article')).toBe(view.get('article').element);
    expect(canvas.querySelector('.a4-ruler')).toBeNull();
    expect(view.get('.a4-ruler').classes()).toContain('no-print');
    const markers = view.findAll('.page-break-line');
    expect(markers[0]!.element.parentElement).toBe(canvas);
    expect(markers[0]!.classes()).toContain('no-print');
    expect(markers[0]!.attributes('style')).toContain('top: calc(1 * var(--a4-height))');
    expect(markers[0]!.text()).toBe('Page 2');
  });

  it('disconnects observers, cancels rAF and ignores late callbacks after unmount', async () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const view = render();
    const content = view.get('.resume-canvas-content').element;
    const image = view.get('img').element;
    const removeListener = vi.spyOn(content, 'removeEventListener');
    const removeFonts = vi.spyOn(fonts, 'removeEventListener');
    const queuedCallback = [...frames.values()][0]!;
    view.unmount();
    wrapper = undefined;
    expect(ResizeObserverMock.instances[0]!.disconnect).toHaveBeenCalledOnce();
    expect(IntersectionObserverMock.instances[0]!.disconnect).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(removeListener).toHaveBeenCalledWith('load', expect.any(Function), true);
    expect(removeListener).toHaveBeenCalledWith('error', expect.any(Function), true);
    expect(removeFonts).toHaveBeenCalledWith('loadingdone', expect.any(Function));
    expect(document.querySelector('.a4-ruler')).toBeNull();
    resize();
    IntersectionObserverMock.instances[0]!.notify();
    image.dispatchEvent(new Event('load'));
    fonts.dispatchEvent(new Event('loadingdone'));
    window.dispatchEvent(new Event('resize'));
    resolveFonts();
    queuedCallback(0);
    await Promise.resolve();
    expect(frames.size).toBe(0);
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    expect(readHeight).not.toHaveBeenCalled();
  });
});
