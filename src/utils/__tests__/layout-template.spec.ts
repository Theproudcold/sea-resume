import { describe, expect, it } from 'vitest';
import { layoutEditBasis } from '@/services/ai/layoutPrompt';
import { createDefaultResumeData } from '@/utils/resumeData';
import {
  applyLayoutToResume,
  builtinToRecipe,
  buildSavedRecipe,
  layoutWithVisibleTheme,
  parseSavedRecipeFile,
  readLayoutRecipe,
  recipeFromCurrent,
  reorderColumn,
  serializeSavedRecipe,
  splitSections,
} from '@/utils/layout-template';
import { BUILTIN_LAYOUT_IDS } from '@/utils/custom-template';

describe('layout recipes', () => {
  it('derives a distinct editable seed for every built-in template', () => {
    const theme = createDefaultResumeData().theme;
    const recipes = BUILTIN_LAYOUT_IDS.map((id) => builtinToRecipe(id, theme));
    expect(recipes.map((recipe) => recipe.seedId)).toEqual([...BUILTIN_LAYOUT_IDS]);
    expect(recipes.find((recipe) => recipe.seedId === 'professional')).toMatchObject({
      structure: 'sidebar-left',
      sidebarSections: ['education', 'skills'],
      summaryPlacement: 'sidebar',
      contactsPlacement: 'sidebar',
    });
    expect(recipes.find((recipe) => recipe.seedId === 'tech')?.paper).toBe('dark');
    expect(recipes.find((recipe) => recipe.seedId === 'creative')?.header.fill).toBe('accent');
    expect(recipes.find((recipe) => recipe.seedId === 'ai-agent')?.header.avatar).toBe('start');
    expect(recipes.find((recipe) => recipe.seedId === 'minimal')?.header.avatar).toBe('none');
  });

  it('drops an unknown version, a bad color and any extra field', () => {
    const recipe = builtinToRecipe('modern', createDefaultResumeData().theme);
    expect(readLayoutRecipe({ ...recipe, schemaVersion: 2 })).toBeNull();
    expect(readLayoutRecipe({ ...recipe, tokens: { ...recipe.tokens, accent: 'blue' } })).toBeNull();
    expect(readLayoutRecipe({ ...recipe, css: 'body{color:red}' })).toBeNull();
    expect(readLayoutRecipe(recipe)?.structure).toBe('single');
  });

  it('sends the visible type size to AI without replacing the layout ink', () => {
    const resume = createDefaultResumeData();
    const stored = builtinToRecipe('modern', resume.theme);
    stored.tokens.ink = '#123456';
    stored.tokens.fontSize = 12;
    resume.layout = stored;
    resume.theme = { ...resume.theme, fontSize: 18, color: '#0f766e' };

    const basis = layoutEditBasis(resume);

    expect(basis.layout?.tokens.fontSize).toBe(18);
    expect(basis.layout?.tokens.accent).toBe('#0f766e');
    expect(basis.layout?.tokens.ink).toBe('#123456');
    expect(layoutWithVisibleTheme(stored, resume.theme).structure).toBe('single');
  });

  it('keeps the current theme tokens when saving the structure', () => {
    const resume = createDefaultResumeData();
    resume.templateId = 'professional';
    resume.theme = { ...resume.theme, color: '#0f766e', fontSize: 16, pageMargins: 32 };
    const saved = recipeFromCurrent(resume);
    expect(saved.structure).toBe('sidebar-left');
    expect(saved.tokens).toMatchObject({ accent: '#0f766e', fontSize: 16, pageMargins: 32 });
    expect(saved.paper).toBe('light');
  });

  it('rejects a version 2 file outright and round-trips version 1', () => {
    const template = buildSavedRecipe(
      builtinToRecipe('tech', createDefaultResumeData().theme),
      { name: '  深色单栏  ', description: '  技术岗  ' },
      { id: 'layout-1', now: 10 },
    );
    const file = serializeSavedRecipe(template);
    expect(parseSavedRecipeFile(file)).toMatchObject({ name: '深色单栏', description: '技术岗' });
    expect(() => parseSavedRecipeFile({ ...file, schemaVersion: 2 })).toThrow('版本不受支持');
    expect(() => parseSavedRecipeFile({ ...file, kind: 'resume' })).toThrow('不是海简历的版式文件');
  });

  it('applies structure and theme without copying body content', () => {
    const resume = createDefaultResumeData();
    resume.basic.name = '林夏';
    resume.sectionOrder = ['skills', 'experience'];
    resume.hiddenSections = ['education'];
    const template = buildSavedRecipe(
      builtinToRecipe('professional', { ...resume.theme, color: '#243447' }),
      { name: '双栏' },
      { id: 'pro' },
    );
    const applied = applyLayoutToResume(resume, template);
    expect(applied.basic.name).toBe('林夏');
    expect(applied.sectionOrder).toEqual(['skills', 'experience']);
    expect(applied.hiddenSections).toEqual(['education']);
    expect(applied.templateId).toBe('layout:pro');
    expect(applied.layout?.structure).toBe('sidebar-left');
    expect(applied.theme.color).toBe('#243447');
    expect(resume.layout).toBeUndefined();
  });

  it('keeps sidebar modules out of the main column and reorders only the dragged column', () => {
    const recipe = builtinToRecipe('professional', createDefaultResumeData().theme);
    const order = ['experience', 'projects', 'education', 'skills'];
    expect(splitSections(recipe, order, ['projects'])).toEqual({
      sidebar: ['education', 'skills'],
      main: ['experience'],
    });
    expect(reorderColumn(order, ['experience'], ['experience'])).toEqual(order);
    expect(reorderColumn(order, ['education', 'skills'], ['skills', 'education'])).toEqual([
      'experience', 'projects', 'skills', 'education',
    ]);
    expect(() => reorderColumn(order, ['education'], ['experience'])).toThrow('当前栏');
  });
});
