import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppHeader from '../AppHeader.vue';
import { COLOR_SCHEME_KEY } from '@/composables/useColorScheme';

describe('AppHeader repository link', () => {
  it('links to the Sea Resume GitHub repository safely', () => {
    const wrapper = mount(AppHeader, {
      props: { title: '工作台' },
      global: { stubs: ['el-input', 'el-icon', 'el-button'] },
    });
    const link = wrapper.get('a.repository-link');

    expect(link.attributes('href')).toBe('https://github.com/Theproudcold/sea-resume');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toBe('noopener noreferrer');
    expect(link.attributes('aria-label')).toBe('查看 Sea Resume GitHub 仓库');

    wrapper.unmount();
  });
});

describe('AppHeader color scheme', () => {
  it('offers light, system and dark, and remembers the choice', async () => {
    const wrapper = mount(AppHeader, {
      props: { title: '工作台' },
      global: { stubs: ['el-input', 'el-icon', 'el-button'] },
    });
    const options = wrapper.findAll('[role="radio"]');

    expect(options.map((option) => option.attributes('aria-label'))).toEqual(['浅色主题', '跟随系统', '深色主题']);
    expect(wrapper.get('[aria-label="跟随系统"]').attributes('aria-checked')).toBe('true');

    await wrapper.get('[aria-label="深色主题"]').trigger('click');
    expect(localStorage.getItem(COLOR_SCHEME_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(wrapper.get('[aria-label="深色主题"]').attributes('aria-checked')).toBe('true');
    expect(wrapper.get('.scheme-switch').attributes('style')).toContain('--scheme-index: 2');

    await wrapper.get('[aria-label="深色主题"]').trigger('click');
    expect(localStorage.getItem(COLOR_SCHEME_KEY)).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(wrapper.get('[aria-label="浅色主题"]').attributes('aria-checked')).toBe('true');

    wrapper.unmount();
    document.documentElement.classList.remove('dark', 'scheme-rippling');
  });
});
