import { describe, expect, it } from 'vitest';
import { identityProblems } from './release-tag.mjs';

describe('发版 tag 与更新日志', () => {
  it('合法 tag 缺少条目时只报更新日志', () => {
    expect(identityProblems('v1.2.3', '1.2.3', '# 更新日志\n')).toEqual([
      'CHANGELOG.md 缺少 [1.2.3] 条目。',
    ]);
  });

  it('tag 格式不对时不另报一条由它拼出来的更新日志错误', () => {
    const problems = identityProblems('1.2.3', '1.2.3', '# 更新日志\n');

    expect(problems).toContain('tag 必须是 vX.Y.Z 或 vX.Y.Z-预发布，收到：1.2.3');
    expect(problems.some((problem) => problem.includes('CHANGELOG.md'))).toBe(false);
  });

  it('格式合法且条目存在时，身份检查通过', () => {
    expect(identityProblems('v1.2.3', '1.2.3', '## [1.2.3]\n')).toEqual([]);
  });
});
