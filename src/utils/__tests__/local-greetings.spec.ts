import { describe, expect, it } from 'vitest';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { buildLocalGreetings } from '@/utils/localGreetings';

describe('localGreetings', () => {
  it('generates concise boss, standard and headhunter templates using only visible resume facts', () => {
    const resume = parseResumeMarkdown(`# 私密姓名 | 高级后端工程师
private@example.test · 13800138000 · 上海

## 工作经历
### 某科技公司 | 后端负责人 | 2021-01 — 至今
负责订单核心服务

## 技能
### 后端组件
熟练使用 MySQL，熟悉 InnoDB 与 MVCC, Redis, Go`).resume;

    const boss = buildLocalGreetings(resume, 'boss');
    const headhunter = buildLocalGreetings(resume, 'headhunter', '需要 Go 后端经验');
    const standard = buildLocalGreetings(resume, 'standard');

    expect(boss).toHaveLength(2);
    expect(boss[0]).toContain('高级后端工程师');
    expect(boss[0]).toContain('熟悉 MySQL');
    expect(boss[0]).not.toContain('熟悉 熟练使用');
    expect(boss[0]!.length).toBeLessThanOrEqual(100);
    expect(headhunter[0]).toContain('上海');
    expect(standard[0]).toContain('后端负责人');

    const serialized = JSON.stringify({ boss, headhunter, standard });
    for (const secret of ['私密姓名', 'private@example.test', '13800138000']) {
      expect(serialized).not.toContain(secret);
    }
  });
});
