import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import { applyLayoutToResume, buildLayoutTemplate, builtinToRecipe } from '@/utils/layout-template';

describe('resume layout application', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('replaces structure and theme without replacing the resume body', () => {
    const store = useResumeStore();
    store.data.basic.name = '林夏';
    store.data.sectionOrder = ['skills', 'experience'];
    store.data.hiddenSections = ['education'];
    const template = buildLayoutTemplate(
      builtinToRecipe('professional', { ...store.data.theme, color: '#243447' }),
      { name: '双栏' },
      { id: 'pro' },
    );

    store.applyLayout(template);

    expect(store.data.basic.name).toBe('林夏');
    expect(store.data.sectionOrder).toEqual(['skills', 'experience']);
    expect(store.data.hiddenSections).toEqual(['education']);
    expect(store.data.templateId).toBe('layout:pro');
    expect(store.data.layout?.structure).toBe('sidebar-left');
    expect(store.data.theme.color).toBe('#243447');
  });

  it('clears an embedded layout when switching back to a built-in template', () => {
    const store = useResumeStore();
    store.updateLayout(builtinToRecipe('tech', store.data.theme));
    expect(store.data.layout?.paper).toBe('dark');

    store.setTemplate('modern');

    expect(store.data.templateId).toBe('modern');
    expect(store.data.layout).toBeUndefined();
  });

  it('keeps the layout when a theme slider changes', () => {
    const store = useResumeStore();
    const layout = builtinToRecipe('modern', store.data.theme);
    store.updateLayout(layout);
    store.updateTheme({ fontSize: 13 });
    expect(store.data.theme.fontSize).toBe(13);
    expect(store.data.layout?.sidebarSections).toEqual(layout.sidebarSections);
    expect(applyLayoutToResume(store.data, buildLayoutTemplate(layout, { name: '再套一次' }, { id: 'again' })).basic).toEqual(store.data.basic);
  });
});
