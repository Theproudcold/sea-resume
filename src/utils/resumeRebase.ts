/**
 * 把主干的新增内容并入岗位版本。
 *
 * 这里是确定性的第一层：只做结构与文本比对，不调用模型。模型可以帮助判断
 * 「这条新内容放在哪个条目下更合适」，但放不下的时候必须能退回这一层，
 * 而不是把内容丢到文末。
 *
 * 核心约束：绝不产生「新增内容」这类悬挂模块。新条目要么并进已有条目，
 * 要么作为整体新增到对应列表的开头，要么如实报告为「未能放置」。
 */
import type { Experience, Project, ResumeData } from '@/types/resume';

export type MasterAdditionKind = 'highlight' | 'experience' | 'project';

export interface MasterAdditionBase {
  /** 主干里这条内容所属的条目 ID。 */
  sourceItemId: string;
  /** 分支对该条目做过改写，位置需要人工确认。 */
  conflict: boolean;
}

export interface HighlightAddition extends MasterAdditionBase {
  kind: 'highlight';
  text: string;
}

export interface ExperienceAddition extends MasterAdditionBase {
  kind: 'experience';
  block: Experience;
}

export interface ProjectAddition extends MasterAdditionBase {
  kind: 'project';
  block: Project;
}

export type MasterAddition = HighlightAddition | ExperienceAddition | ProjectAddition;

export interface RebasePlacement {
  /** 被放入的内容摘要，用于展示。 */
  text: string;
  kind: MasterAdditionKind;
  /** 实际落入的条目 ID；整体新增时为新条目自身。 */
  targetItemId: string;
  /** 面向用户的落点说明。 */
  reason: string;
  /** 源条目在分支里找不到，落到了最近的一段经历上。 */
  fallback?: boolean;
}

export interface RebaseResult {
  resume: ResumeData;
  placements: RebasePlacement[];
  /** 没有合适落点、原样跳过的条目。 */
  unplaced: MasterAddition[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 去空白与 Markdown 前缀后比较，避免同一句话因格式差异被判成新增。 */
function normalizeBullet(text: string): string {
  return String(text ?? '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s*/u, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

function bulletsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function sameBlock(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 找出主干相对分支基线新增的内容。
 *
 * @param base 分支派生时的主干快照
 * @param latest 当前主干
 * @param branch 当前岗位版本（用于跳过它已经有的内容）
 */
export function collectMasterAdditions(base: ResumeData, latest: ResumeData, branch: ResumeData): MasterAddition[] {
  const additions: MasterAddition[] = [];
  const branchExperiences = new Map((branch.experiences ?? []).map((item) => [item.id, item]));
  const branchProjects = new Map((branch.projects ?? []).map((item) => [item.id, item]));

  for (const latestItem of latest.experiences ?? []) {
    const baseItem = (base.experiences ?? []).find((item) => item.id === latestItem.id);
    const branchItem = branchExperiences.get(latestItem.id);

    if (!baseItem) {
      // 主干新增了整段经历；分支已经有同 ID 的才算重复。
      if (!branchItem) {
        additions.push({ kind: 'experience', sourceItemId: latestItem.id, block: clone(latestItem), conflict: false });
      }
      continue;
    }

    const baseBullets = new Set(bulletsOf(baseItem.highlights).map(normalizeBullet));
    const branchBullets = new Set(bulletsOf(branchItem?.highlights).map(normalizeBullet));
    const conflict = Boolean(branchItem) && !sameBlock(baseItem.highlights, branchItem!.highlights);
    for (const text of bulletsOf(latestItem.highlights)) {
      const key = normalizeBullet(text);
      if (!key || baseBullets.has(key) || branchBullets.has(key)) continue;
      additions.push({ kind: 'highlight', sourceItemId: latestItem.id, text, conflict });
    }
  }

  for (const latestItem of latest.projects ?? []) {
    const baseItem = (base.projects ?? []).find((item) => item.id === latestItem.id);
    if (!baseItem) {
      if (!branchProjects.has(latestItem.id)) {
        additions.push({ kind: 'project', sourceItemId: latestItem.id, block: clone(latestItem), conflict: false });
      }
    }
    // 项目正文是富文本，逐句 diff 噪声太大，这里不收集正文改动；
    // 整体新增的项目已经覆盖。
  }

  return additions;
}

/**
 * 把新增条目并入分支。返回新对象，不修改入参。
 *
 * - highlight：并进来源经历；来源不在分支时落到第一段经历，并标记 fallback。
 * - experience / project：整体插到列表最前面（最新的一段），与主干顺序一致。
 * - 已有相同内容的条目跳过，不重复。
 */
export function applyMasterAdditions(branch: ResumeData, additions: MasterAddition[]): RebaseResult {
  const resume = clone(branch);
  const placements: RebasePlacement[] = [];
  const unplaced: MasterAddition[] = [];
  resume.experiences = resume.experiences ?? [];
  resume.projects = resume.projects ?? [];

  for (const addition of additions) {
    if (addition.kind === 'experience') {
      if (resume.experiences.some((item) => item.id === addition.block.id)) continue;
      resume.experiences.unshift(clone(addition.block));
      placements.push({
        kind: 'experience',
        text: `${addition.block.company || '新经历'} · ${addition.block.position || ''}`.trim(),
        targetItemId: addition.block.id,
        reason: '主干新增的整段经历，已放在工作经历最前面',
      });
      continue;
    }

    if (addition.kind === 'project') {
      if (resume.projects.some((item) => item.id === addition.block.id)) continue;
      resume.projects.unshift(clone(addition.block));
      placements.push({
        kind: 'project',
        text: addition.block.name || '新项目',
        targetItemId: addition.block.id,
        reason: '主干新增的整段项目，已放在项目经验最前面',
      });
      continue;
    }

    const text = addition.text;
    if (!normalizeBullet(text)) continue;

    let target = resume.experiences.find((item) => item.id === addition.sourceItemId);
    let fallback = false;
    if (!target) {
      target = resume.experiences[0];
      fallback = Boolean(target);
    }
    if (!target) {
      unplaced.push(addition);
      continue;
    }

    const existing = bulletsOf(target.highlights).map(normalizeBullet);
    if (existing.includes(normalizeBullet(text))) continue;
    target.highlights = [...bulletsOf(target.highlights), text];
    placements.push({
      kind: 'highlight',
      text,
      targetItemId: target.id,
      reason: fallback
        ? `主干新增的要点；原条目在本岗位版本中已不存在，已并入「${target.company}」`
        : `主干新增的要点，已并入「${target.company}」`,
      ...(fallback ? { fallback } : {}),
    });
  }

  resume.updatedAt = new Date().toISOString();
  return { resume, placements, unplaced };
}
