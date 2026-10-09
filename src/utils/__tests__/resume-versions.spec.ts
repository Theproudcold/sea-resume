import { describe, expect, it } from 'vitest';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { compareResumeVersions, createJobResumeVersion } from '@/utils/resumeVersions';

describe('resume job versions', () => {
  it('creates a metadata-bearing independent resume copy', () => {
    const source = parseResumeMarkdown('# Alex\n\n## 个人简介\n\nOriginal').resume;
    source.basic.name = 'Alex';
    const variant = createJobResumeVersion(source, { versionName: 'Acme 前端', company: 'Acme', position: '前端工程师' }, 'variant-1');
    variant.basic.name = 'Changed only in copy';
    expect(variant.id).toBe('variant-1');
    expect(variant.jobTarget).toEqual({ versionName: 'Acme 前端', company: 'Acme', position: '前端工程师', sourceResumeId: source.id });
    expect(source.basic.name).toBe('Alex');
    expect(source.jobTarget).toBeUndefined();
  });

  it('returns field-level differences and an empty list when content is identical', () => {
    const left = parseResumeMarkdown('# Alex').resume;
    const right = JSON.parse(JSON.stringify(left));
    right.basic.title = 'Product Designer';
    right.projects = [{ id: 'p', name: 'Portfolio', role: 'Owner', startDate: '', endDate: '', description: 'Built it' }];
    const changes = compareResumeVersions(left, right);
    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'basic.title', after: 'Product Designer' }),
      expect.objectContaining({ path: 'projects[1].name', after: 'Portfolio' }),
    ]));
    expect(compareResumeVersions(left, JSON.parse(JSON.stringify(left)))).toEqual([]);
  });
});
