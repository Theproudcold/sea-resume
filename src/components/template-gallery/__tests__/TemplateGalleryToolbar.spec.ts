import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import TemplateGalleryToolbar from '@/components/template-gallery/TemplateGalleryToolbar.vue';
import type { TemplateMetadata } from '@/types/resume';

const categories: Array<{ value: TemplateMetadata['category'] | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'modern', label: '现代' },
  { value: 'professional', label: '商务' },
  { value: 'creative', label: '创意' },
];

let wrapper: VueWrapper | undefined;

const layoutButtons = (current: VueWrapper) => {
  current.findAll('.toolbar__tag').forEach((button, index) => {
    const element = button.element as HTMLButtonElement;
    Object.defineProperty(element, 'offsetLeft', { configurable: true, value: 2 + index * 52 });
    Object.defineProperty(element, 'offsetTop', { configurable: true, value: 2 });
    Object.defineProperty(element, 'offsetWidth', { configurable: true, value: index === 3 ? 64 : 50 });
    Object.defineProperty(element, 'offsetHeight', { configurable: true, value: 30 });
  });
};

const createWrapper = async (activeCategory: TemplateMetadata['category'] | 'all' = 'all') => {
  wrapper = mount(TemplateGalleryToolbar, {
    props: {
      categories,
      activeCategory,
      search: '',
      sortBy: 'recommended',
    },
    global: {
      stubs: {
        ElInput: true,
        ElSelect: true,
        ElOption: true,
      },
    },
  });

  layoutButtons(wrapper);
  const nudge = activeCategory === 'modern' ? 'all' : 'modern';
  await wrapper.setProps({ activeCategory: nudge });
  await wrapper.setProps({ activeCategory });
  return wrapper;
};

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

describe('TemplateGalleryToolbar category thumb', () => {
  it('places the sliding thumb on the active category', async () => {
    const current = await createWrapper('modern');

    const thumb = current.get('.toolbar__thumb').element as HTMLElement;
    expect(thumb.classList.contains('is-ready')).toBe(true);
    expect(thumb.classList.contains('is-sliding')).toBe(true);
    expect(thumb.style.transform).toBe('translate(54px, 2px)');
    expect(thumb.style.width).toBe('50px');
    expect(current.get('.toolbar__tag.is-active').text()).toBe('现代');
  });

  it('slides the thumb to the next category, including a different width', async () => {
    const current = await createWrapper('all');

    await current.setProps({ activeCategory: 'creative' });

    const thumb = current.get('.toolbar__thumb').element as HTMLElement;
    expect(thumb.classList.contains('is-sliding')).toBe(true);
    expect(thumb.style.transform).toBe('translate(158px, 2px)');
    expect(thumb.style.width).toBe('64px');
    expect(current.emitted('update:category')).toBeUndefined();
  });

  it('emits the clicked category', async () => {
    const current = await createWrapper();
    await current.findAll('.toolbar__tag')[2]?.trigger('click');
    expect(current.emitted('update:category')?.[0]).toEqual(['professional']);
  });
});
