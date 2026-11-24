import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteLayoutTemplate,
  listLayoutTemplates,
  renameLayoutTemplate,
  saveLayoutTemplate,
} from '@/services/templates/LayoutTemplateRepository';
import { LAYOUT_TEMPLATE_LIMIT, buildLayoutTemplate, builtinToRecipe } from '@/utils/layout-template';
import { createDefaultResumeData } from '@/utils/resumeData';

function template(id: string, now: number) {
  return buildLayoutTemplate(
    builtinToRecipe('modern', createDefaultResumeData().theme),
    { name: id },
    { id, now },
  );
}

describe('layout template repository', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves, renames and deletes layout templates without touching content templates', () => {
    localStorage.setItem('sea-resume_custom-templates', '[]');
    saveLayoutTemplate(template('one', 10));
    saveLayoutTemplate(template('two', 20));
    expect(listLayoutTemplates().map((item) => item.id)).toEqual(['two', 'one']);

    renameLayoutTemplate('one', '校招版式', 30);
    expect(listLayoutTemplates()[0]).toMatchObject({ id: 'one', name: '校招版式', updatedAt: 30 });

    deleteLayoutTemplate('one');
    expect(listLayoutTemplates().map((item) => item.id)).toEqual(['two']);
    expect(localStorage.getItem('sea-resume_custom-templates')).toBe('[]');
  });

  it('refuses to rewrite storage when one stored layout is broken', () => {
    const valid = template('valid', 10);
    const stored = JSON.stringify([valid, { id: 'broken', name: '坏的', recipe: { schemaVersion: 2 } }]);
    localStorage.setItem('sea-resume_layout-templates', stored);

    expect(() => listLayoutTemplates()).toThrow('未继续写入');
    expect(() => saveLayoutTemplate(template('next', 20))).toThrow('未继续写入');
    expect(() => renameLayoutTemplate('valid', '改名', 30)).toThrow('未继续写入');
    expect(() => deleteLayoutTemplate('valid')).toThrow('未继续写入');
    expect(localStorage.getItem('sea-resume_layout-templates')).toBe(stored);
  });

  it('stops at the layout limit', () => {
    for (let index = 0; index < LAYOUT_TEMPLATE_LIMIT; index += 1) {
      saveLayoutTemplate(template(`layout-${index}`, index + 1));
    }
    expect(() => saveLayoutTemplate(template('overflow', 100))).toThrow(`最多保存 ${LAYOUT_TEMPLATE_LIMIT}`);
  });
});
