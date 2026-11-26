import { beforeEach, describe, expect, it } from 'vitest';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import {
  buildResumeExamAudit,
  loadExamAuditStatuses,
  saveExamAuditStatus,
} from '@/utils/resumeExamAudit';

describe('resumeExamAudit', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('extracts tech depth, metric provenance and ownership exam probes from visible entries only', () => {
    const resume = parseResumeMarkdown(`# 测试候选人 | 后端工程师

## 工作经历
### 星海科技 | 高级后端 | 2022-01 — 至今
主导支付网关架构重构，接口延迟降低 45%，基于 Kafka 异步解耦。

## 项目经验
### 隐身项目 | 负责人 | 2021-01 — 2021-12
实现 Redis 分布式锁，QPS 提升 3 倍。

## 技能
### 后端组件
熟练使用 MySQL，理解 InnoDB、MVCC 与 binlog 原理`).resume;
    resume.projects[0]!.visible = false;

    const points = buildResumeExamAudit(resume);
    const ids = points.map((item) => item.id);

    expect(ids).toContain('tech-mysql');
    expect(ids).toContain('tech-mq');
    expect(ids).toContain(`metric-exp-${resume.experiences[0]!.id}`);
    expect(ids).toContain(`owner-exp-${resume.experiences[0]!.id}`);
    // 隐藏项目不应进入考纲清单
    expect(ids).not.toContain('tech-redis');
    expect(ids).not.toContain(`metric-proj-${resume.projects[0]!.id}`);
  });

  it('persists and toggles per-resume audit statuses locally', () => {
    saveExamAuditStatus('r1', 'tech-mysql', 'study');
    expect(loadExamAuditStatuses('r1')).toEqual({ 'tech-mysql': 'study' });

    saveExamAuditStatus('r1', 'tech-mysql', 'remove');
    expect(loadExamAuditStatuses('r1')).toEqual({ 'tech-mysql': 'remove' });

    saveExamAuditStatus('r1', 'tech-mysql', 'unchecked');
    expect(loadExamAuditStatuses('r1')).toEqual({});
  });
});
