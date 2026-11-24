import { reactive } from 'vue';
import { generateId } from '@/utils/helpers';

export type ExternalTaskKind = 'optimize' | 'polish' | 'quick_edit' | 'greeting' | 'pdf_import';
export type ExternalTaskStatus = 'pending' | 'completed' | 'cancelled';

export interface ExternalTaskResult {
  summary?: string;
  greetings?: string[];
  resumeId?: string;
}

export interface ExternalTask {
  id: string;
  kind: ExternalTaskKind;
  resumeId?: string;
  summary: string;
  payload: Record<string, unknown>;
  status: ExternalTaskStatus;
  createdAt: string;
  updatedAt: string;
  result?: ExternalTaskResult;
}

const MAX_EXTERNAL_TASKS = 20;
const MAX_TASK_PAYLOAD_BYTES = 150_000;
const MAX_SUMMARY_CHARS = 4000;
const MAX_GREETINGS = 5;
const MAX_GREETING_CHARS = 1000;

const tasks = reactive<ExternalTask[]>([]);

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function sanitizeResult(input: unknown): ExternalTaskResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const raw = input as Record<string, unknown>;
  const result: ExternalTaskResult = {};
  const summary = cleanText(raw.summary, MAX_SUMMARY_CHARS);
  if (summary) result.summary = summary;
  const resumeId = cleanText(raw.resumeId, 120);
  if (resumeId) result.resumeId = resumeId;
  if (Array.isArray(raw.greetings)) {
    const greetings = raw.greetings
      .map((item) => cleanText(item, MAX_GREETING_CHARS))
      .filter(Boolean)
      .slice(0, MAX_GREETINGS);
    if (greetings.length) result.greetings = greetings;
  }
  return result;
}

function evictCompletedIfFull() {
  if (tasks.length < MAX_EXTERNAL_TASKS) return;
  const removableIndex = tasks.findIndex((item) => item.status !== 'pending');
  if (removableIndex >= 0) {
    tasks.splice(removableIndex, 1);
    return;
  }
  throw new Error('待处理外部 Agent 任务已达上限，请先完成或取消已有任务。');
}

/** 生成给外部 Agent 的单句短触发指令，避免用户手动复制整份简历。 */
export function buildExternalTaskPrompt(task: Pick<ExternalTask, 'id' | 'summary'>): string {
  return `请调用 sea_task_list 读取并执行 Sea Resume 待处理任务 ${task.id}（${task.summary}），完成后调用 sea_task_complete 回填结果。`;
}

/** 网页端入队一个免 API Key 的外部 Agent 任务，仅保留在当前页面内存。 */
export function enqueueExternalTask(input: {
  kind: ExternalTaskKind;
  resumeId?: string;
  summary: string;
  payload: Record<string, unknown>;
}): { task: ExternalTask; prompt: string } {
  const payload = JSON.parse(JSON.stringify(input.payload ?? {})) as Record<string, unknown>;
  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > MAX_TASK_PAYLOAD_BYTES) {
    throw new Error('任务内容过大，请精简后再派发给外部 Agent。');
  }
  evictCompletedIfFull();
  const now = new Date().toISOString();
  const task: ExternalTask = {
    id: `task-${generateId().slice(-8)}`,
    kind: input.kind,
    ...(input.resumeId ? { resumeId: input.resumeId } : {}),
    summary: cleanText(input.summary, 200) || input.kind,
    payload,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  tasks.push(task);
  return { task, prompt: buildExternalTaskPrompt(task) };
}

/** 供 MCP 工具 sea_task_list 读取任务列表，默认只返回待处理任务。 */
export function listExternalTasks(status: ExternalTaskStatus | 'all' = 'pending'): ExternalTask[] {
  const filtered = status === 'all' ? tasks : tasks.filter((item) => item.status === status);
  return JSON.parse(JSON.stringify(filtered)) as ExternalTask[];
}

/** 供 MCP 工具 sea_task_complete 标记任务完成并回填结果。 */
export function completeExternalTask(id: string, result: unknown = {}): ExternalTask {
  const task = tasks.find((item) => item.id === id);
  if (!task) throw new Error('没有这个待处理任务。');
  if (task.status !== 'pending') throw new Error('该任务已结束，不能重复回填。');
  task.status = 'completed';
  task.updatedAt = new Date().toISOString();
  task.result = sanitizeResult(result);
  return JSON.parse(JSON.stringify(task)) as ExternalTask;
}

export function cancelExternalTask(id: string): void {
  const task = tasks.find((item) => item.id === id);
  if (task && task.status === 'pending') {
    task.status = 'cancelled';
    task.updatedAt = new Date().toISOString();
  }
}

export function clearExternalTasks(): void {
  tasks.splice(0, tasks.length);
}

/** 供组件响应式订阅任务状态变化（例如外部 Agent 回填打招呼语）。 */
export function useExternalTasks() {
  return {
    tasks,
    findTask: (id: string | null | undefined) => (id ? tasks.find((item) => item.id === id) ?? null : null),
  };
}

/** 尝试将触发指令写入剪贴板，受限时返回 false 由界面提示手动复制。 */
export async function copyExternalTaskPrompt(prompt: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(prompt);
    return true;
  } catch {
    return false;
  }
}
