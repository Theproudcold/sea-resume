import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppHeader from '../AppHeader.vue';

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
