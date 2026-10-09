import { describe, expect, it, vi } from 'vitest';
import { FileSystemAdapter } from '../FileSystemAdapter';
import type { ResumeData, ResumeMeta } from '@/types/resume';

function makeDirectory(files: Record<string, string>, removeError?: Error) {
  const writes = vi.fn();
  const directories = new Set<string>();
  const makeHandle = (prefix = ''): FileSystemDirectoryHandle => {
    const fullName = (name: string) => prefix ? `${prefix}/${name}` : name;
    return {
      name: prefix.split('/').slice(-1)[0] || 'resumes',
      getFileHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
        const path = fullName(name);
        if (!(path in files) && !options?.create) {
          const error = new Error('Not found');
          error.name = 'NotFoundError';
          throw error;
        }
        return {
          getFile: async () => ({ text: async () => files[path] ?? '' }),
          createWritable: async () => {
            let pending = '';
            return {
              write: async (value: string) => { pending = value; },
              close: async () => { files[path] = pending; writes(path); },
              abort: async () => undefined,
            };
          },
        } as unknown as FileSystemFileHandle;
      }),
      getDirectoryHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
        const path = fullName(name);
        if (!directories.has(path) && !options?.create) {
          const error = new Error('Not found');
          error.name = 'NotFoundError';
          throw error;
        }
        directories.add(path);
        return makeHandle(path);
      }),
      removeEntry: vi.fn(async (name: string) => {
        if (removeError) throw removeError;
        delete files[fullName(name)];
      }),
    } as unknown as FileSystemDirectoryHandle;
  };
  return { directory: makeHandle(), writes };
}

const meta = (id: string, title = 'Test'): ResumeMeta => ({
  id, title, templateId: 'modern', createdAt: 1, updatedAt: 1,
});

describe('FileSystemAdapter directory integrity', () => {
  it('rejects a malformed legacy index instead of treating it as empty', async () => {
    const { directory } = makeDirectory({ 'index.json': '{broken' });
    const adapter = new FileSystemAdapter(directory);

    await expect(adapter.list()).rejects.toThrow();
  });

  it('does not write resume files when the existing index is invalid', async () => {
    const { directory, writes } = makeDirectory({ 'index.json': '{broken' });
    const adapter = new FileSystemAdapter(directory);

    await expect(adapter.save({ id: 'resume-1' } as ResumeData, meta('resume-1'))).rejects.toThrow();
    expect(writes).not.toHaveBeenCalled();
  });

  it('rejects a resume file whose embedded ID differs from the requested ID', async () => {
    const { directory } = makeDirectory({ 'resume-requested.json': JSON.stringify({ id: 'other' }) });
    const adapter = new FileSystemAdapter(directory);

    await expect(adapter.read('requested')).rejects.toThrow('ID 不匹配');
  });

  it('upgrades legacy data by copying it and keeps the original files intact', async () => {
    const legacyResume = { id: 'legacy-1', title: 'Old title' };
    const { directory, writes } = makeDirectory({
      'index.json': JSON.stringify([meta('legacy-1', 'Old title')]),
      'resume-legacy-1.json': JSON.stringify(legacyResume),
    });
    const adapter = new FileSystemAdapter(directory);
    await adapter.save({ id: 'legacy-1', title: 'Updated title' } as ResumeData, meta('legacy-1', 'Updated title'));
    const manifestFile = await directory.getFileHandle('manifest.json');
    const manifest = JSON.parse(await (await manifestFile.getFile()).text());
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.resumes[0].title).toBe('Updated title');
    expect(writes).toHaveBeenCalledWith('resumes/legacy-1.json');
    expect(writes).toHaveBeenCalledWith('manifest.json');
    expect(JSON.parse(await (await directory.getFileHandle('index.json')).getFile().then((file) => file.text()))[0].title).toBe('Old title');
    expect(await adapter.read('legacy-1')).toMatchObject({ id: 'legacy-1', title: 'Updated title' });
  });
  it('restores the manifest when removing a resume file fails', async () => {
    const legacyResume = { id: 'legacy-delete', title: 'Keep me' };
    const { directory } = makeDirectory({
      'index.json': JSON.stringify([meta('legacy-delete', 'Keep me')]),
      'resume-legacy-delete.json': JSON.stringify(legacyResume),
    }, new Error('disk busy'));
    const adapter = new FileSystemAdapter(directory);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(adapter.delete('legacy-delete')).rejects.toThrow('disk busy');
    expect(await adapter.list()).toEqual([meta('legacy-delete', 'Keep me')]);
    expect(await adapter.read('legacy-delete')).toMatchObject(legacyResume);
    log.mockRestore();
  });
});
