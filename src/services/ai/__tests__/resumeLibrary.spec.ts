import { describe, expect, it, vi } from 'vitest';
import { createDefaultResumeData } from '@/utils/resumeData';
import { createResumeLibrary, type ResumeCatalog } from '../resumeLibrary';

function catalog() {
  const first = createDefaultResumeData();
  first.id = 'resume-1';
  first.title = '第一份';
  first.basic.email = 'a@example.com';
  const store = new Map([[first.id, first]]);
  const discardOpen = vi.fn(async () => undefined);
  const backend: ResumeCatalog = {
    list: async () => [...store.values()].map(item => ({ id: item.id, title: item.title, templateId: item.templateId, createdAt: 1, updatedAt: 2 })),
    read: async (id) => store.get(id) ?? null,
    save: async (resume) => { store.set(resume.id, resume); },
    remove: async (id) => { store.delete(id); },
    discardOpen,
  };
  return { library: createResumeLibrary(backend), store, discardOpen, first };
}

describe('resume library MCP', () => {
  it('lists, updates, creates and deletes separate resumes', async () => {
    const { library, store, discardOpen, first } = catalog();
    expect(await library.list()).toEqual([{ id: 'resume-1', title: '第一份', templateId: 'modern', updatedAt: 2 }]);
    const changed = await library.set({ ...first, title: '改过的第一份', basic: { ...first.basic, email: 'b@example.com' } });
    expect(changed.id).toBe('resume-1');
    expect(store.get('resume-1')?.title).toBe('改过的第一份');
    await expect(library.set({ id: first.id, basic: {} })).rejects.toThrow('完整');
    const created = await library.create({ ...first, title: '第二份' });
    expect(created.id).not.toBe('resume-1');
    expect(store.size).toBe(2);
    await library.remove('resume-1');
    expect(discardOpen).toHaveBeenCalledWith('resume-1');
    expect(store.has('resume-1')).toBe(false);
    expect(store.has(created.id)).toBe(true);
    await expect(library.remove('resume-1')).rejects.toThrow('没有这份简历');
  });
});
