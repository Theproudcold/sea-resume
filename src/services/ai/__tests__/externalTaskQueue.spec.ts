import { beforeEach, describe, expect, it } from 'vitest';
import {
  cancelExternalTask,
  clearExternalTasks,
  completeExternalTask,
  enqueueExternalTask,
  listExternalTasks,
} from '../externalTaskQueue';
import { resolveAiDriver, setAiDriverPreference } from '../useAiExecutionMode';

beforeEach(() => {
  clearExternalTasks();
  localStorage.clear();
  setAiDriverPreference('auto');
});

describe('MCP 免 API Key 执行通道与任务队列', () => {
  it('按 MCP 连接状态与用户偏好解析执行通道，未连 MCP 时保持原有行为', () => {
    expect(resolveAiDriver(false, false, 'auto')).toBe('none');
    expect(resolveAiDriver(false, true, 'auto')).toBe('api');
    expect(resolveAiDriver(true, false, 'auto')).toBe('mcp');
    expect(resolveAiDriver(true, true, 'auto')).toBe('mcp');
    expect(resolveAiDriver(true, true, 'api')).toBe('api');
    expect(resolveAiDriver(false, true, 'mcp')).toBe('api');
    expect(resolveAiDriver(true, false, 'api')).toBe('mcp');
  });

  it('入队、读取、回填并限制任务数量与载荷大小', () => {
    const { task, prompt } = enqueueExternalTask({
      kind: 'greeting',
      resumeId: 'r-1',
      summary: '结合 JD 生成打招呼语',
      payload: { resumeId: 'r-1', jd: '负责前端架构' },
    });
    expect(prompt).toContain('sea_task_list');
    expect(prompt).toContain(task.id);
    expect(listExternalTasks('pending')).toHaveLength(1);

    const completed = completeExternalTask(task.id, {
      summary: '已生成 2 条打招呼语',
      greetings: ['你好，看到贵司前端岗位...', '   ', '您好，我有 5 年 Vue 经验...'],
    });
    expect(completed.status).toBe('completed');
    expect(completed.result?.greetings).toEqual(['你好，看到贵司前端岗位...', '您好，我有 5 年 Vue 经验...']);
    expect(listExternalTasks('pending')).toHaveLength(0);
    expect(listExternalTasks('completed')).toHaveLength(1);
    expect(() => completeExternalTask(task.id, {})).toThrow('重复回填');

    const second = enqueueExternalTask({ kind: 'quick_edit', summary: '精简简介', payload: {} });
    cancelExternalTask(second.task.id);
    expect(listExternalTasks('cancelled')).toHaveLength(1);

    expect(() => enqueueExternalTask({
      kind: 'pdf_import',
      summary: '超大载荷',
      payload: { text: 'a'.repeat(160_000) },
    })).toThrow('过大');

    clearExternalTasks();
    for (let i = 0; i < 20; i += 1) {
      enqueueExternalTask({ kind: 'quick_edit', summary: `t-${i}`, payload: {} });
    }
    expect(() => enqueueExternalTask({ kind: 'quick_edit', summary: 'overflow', payload: {} })).toThrow('上限');
  });
});
