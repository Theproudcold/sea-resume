import { mount } from '@vue/test-utils';
import { ElIcon } from 'element-plus';
import { describe, expect, it } from 'vitest';
import ContactIcon from '../ContactIcon.vue';

const global = { components: { ElIcon } };

/**
 * Element Plus 默认图标的描边盒不一致：邮箱是扁的、定位针几乎贴满画布、
 * 手机又细又高。同一行里它们的视觉中心对不齐，文字基线也被带歪。
 * 默认三件套必须是同一套 24 视口、2px 描边、并且都落在同一块视觉区域内。
 */
const ALIGNED_DEFAULTS = ['email', 'phone', 'location'] as const;

function iconMarkup(type: (typeof ALIGNED_DEFAULTS)[number]) {
  return mount(ContactIcon, { props: { type }, global }).html();
}

function strokePresentation(markup: string) {
  const viewBox = markup.match(/viewBox="([^"]+)"/)?.[1] ?? '';
  const strokes = [...markup.matchAll(/stroke-width="([^"]+)"/g)].map((match) => match[1]);
  const linecaps = [...markup.matchAll(/stroke-linecap="([^"]+)"/g)].map((match) => match[1]);
  return { viewBox, strokes, linecaps };
}

describe('联系方式图标视觉对齐', () => {
  it('默认邮箱、电话、定位使用同一套描边图标，而不是 Element Plus 的实心图标', () => {
    for (const type of ALIGNED_DEFAULTS) {
      const markup = iconMarkup(type);
      const { viewBox, strokes, linecaps } = strokePresentation(markup);

      expect(viewBox, type).toBe('0 0 24 24');
      expect(strokes.length, type).toBeGreaterThan(0);
      expect(new Set(strokes), type).toEqual(new Set(['2']));
      expect(new Set(linecaps), type).toEqual(new Set(['round']));
      expect(markup, type).not.toContain('viewBox="0 0 1024 1024"');

      const paths = mount(ContactIcon, { props: { type }, global }).findAll('path');
      expect(paths.length, type).toBeGreaterThan(0);
      for (const path of paths) {
        expect(path.element.namespaceURI, type).toBe('http://www.w3.org/2000/svg');
      }
    }
  });

  it('三个默认图标都放进同一个固定对齐槽，避免字形高低不一', () => {
    for (const type of ALIGNED_DEFAULTS) {
      const root = mount(ContactIcon, { props: { type }, global }).get('.contact-icon');
      expect(root.classes()).toContain('contact-icon--aligned');
    }
  });

  it('手动指定的图标仍走原来的图标，不会被默认图形替换', () => {
    const wrapper = mount(ContactIcon, {
      props: { type: 'email', icon: 'Promotion' },
      global,
    });

    expect(wrapper.get('.contact-icon').classes()).not.toContain('contact-icon--aligned');
    expect(wrapper.find('svg').attributes('viewBox')).toBe('0 0 1024 1024');
  });
});
