import { describe, expect, it, vi, beforeEach } from 'vitest';
import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { useOnePageFit } from '@/composables/useOnePageFit';
import { MAX_FIT_STEPS, MIN_FONT_SIZE } from '@/utils/pageFit';
import type { ThemeConfig } from '@/types/resume';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';

const confirmMock = vi.hoisted(() => vi.fn());
const successMock = vi.hoisted(() => vi.fn());
const warningMock = vi.hoisted(() => vi.fn());
const errorMock = vi.hoisted(() => vi.fn());

vi.mock('element-plus', () => ({
  ElMessageBox: { confirm: confirmMock },
  ElMessage: { success: successMock, warning: warningMock, error: errorMock },
}));

const baseTheme = parseResumeMarkdown('# Alex').resume.theme;

/** 大排版：逐档阶梯需要 47 步才到底，用来覆盖步数上限。 */
function largeTheme(): ThemeConfig {
  return {
    ...baseTheme,
    fontSize: 18,
    lineHeight: 2,
    pageMargins: 60,
    moduleMargins: { top: 64, bottom: 64, left: 64, right: 64 },
  };
}

interface Harness {
  theme: Ref<ThemeConfig>;
  pages: Ref<number | null>;
  pending: ComputedRef<boolean>;
  pageCount: ComputedRef<number | null>;
  updates: Partial<ThemeConfig>[];
  saveCount: () => number;
  historyGroups: () => number;
  api: ReturnType<typeof useOnePageFit>;
}

/**
 * 模拟预览画布：每收到一档主题改动就按给定序列回报页数，
 * 序列读完后保持最后一页数，用于验证「够一页就停」。
 */
function harness(theme: ThemeConfig, pageSequence: (number | null)[]): Harness {
  const themeRef = ref(theme) as Ref<ThemeConfig>;
  const pages = ref<number | null>(pageSequence[0] ?? 1) as Ref<number | null>;
  let saveCount = 0;
  let historyGroups = 0;
  const updates: Partial<ThemeConfig>[] = [];
  let readIndex = 0;

  const pageCount = computed(() => pages.value ?? null);
  const pending = computed(() => pages.value === null);

  const api = useOnePageFit(
    themeRef,
    { pageCount, pending },
    {
      updateTheme: (patch) => {
        updates.push(patch);
        themeRef.value = { ...themeRef.value, ...patch } as ThemeConfig;
        // 每档改动后画布重测：按序列推进页数。
        readIndex += 1;
        if (readIndex < pageSequence.length) pages.value = pageSequence[readIndex] ?? null;
      },
      autoSave: async () => { saveCount += 1; },
      beginHistoryGroup: () => { historyGroups += 1; },
    },
  );

  return {
    theme: themeRef,
    pages,
    pending,
    pageCount,
    updates,
    saveCount: () => saveCount,
    historyGroups: () => historyGroups,
    api,
  };
}

beforeEach(() => {
  confirmMock.mockReset().mockResolvedValue('confirm');
  successMock.mockReset();
  warningMock.mockReset();
  errorMock.mockReset();
});

describe('useOnePageFit ladder', () => {
  it('stops as soon as the resume fits one page instead of compressing to the floor', async () => {
    // 3 页起，第 1 档后回到 1 页：应立刻停止，不再继续收紧。
    const h = harness(largeTheme(), [3, 1]);
    await h.api.fitToOnePage();

    expect(h.updates).toHaveLength(1);
    // 只收紧了模块下边距，字号与行高原封不动。
    expect(h.updates[0]).toEqual({ moduleMargins: { top: 64, bottom: 60, left: 64, right: 64 } });
    expect(h.theme.value.fontSize).toBe(18);
    expect(h.theme.value.lineHeight).toBe(2);
    expect(successMock).toHaveBeenCalledWith('已适配为一页 A4，可直接查看打印预览。');
    expect(warningMock).not.toHaveBeenCalled();
  });

  it('walks the whole ladder when the resume never fits, and then reports the floor', async () => {
    const h = harness(largeTheme(), [3]);
    await h.api.fitToOnePage();

    // 一直收紧到 nextFitStep 返回 null：47 档。
    expect(h.updates.length).toBe(47);
    expect(h.updates.length).toBeLessThan(MAX_FIT_STEPS);
    expect(h.theme.value.fontSize).toBe(MIN_FONT_SIZE);
    expect(h.theme.value.lineHeight).toBe(1.2);
    expect(h.theme.value.pageMargins).toBe(12);
    expect(h.theme.value.moduleMargins.bottom).toBe(4);
    // 真的到底了，才允许说「已到下限」。
    expect(warningMock).toHaveBeenCalledWith(
      expect.stringContaining('已收紧到可读性下限'),
    );
    expect(successMock).not.toHaveBeenCalled();
  });

  it('persists once after the walk and merges the batch into a single history group', async () => {
    const h = harness(largeTheme(), [3, 1]);
    await h.api.fitToOnePage();

    // 中间档只改内存，落盘只发生一次。
    expect(h.saveCount()).toBe(1);
    expect(h.historyGroups()).toBe(1);
  });

  it('does not start when the resume is already one page or not yet measured', async () => {
    const fits = harness(largeTheme(), [1]);
    await fits.api.fitToOnePage();
    expect(confirmMock).not.toHaveBeenCalled();
    expect(fits.updates).toHaveLength(0);

    const unmeasured = harness(largeTheme(), [null]);
    await unmeasured.api.fitToOnePage();
    expect(confirmMock).not.toHaveBeenCalled();
    expect(unmeasured.updates).toHaveLength(0);
  });

  it('leaves the theme untouched when the confirmation is dismissed', async () => {
    confirmMock.mockRejectedValue(new Error('cancel'));
    const h = harness(largeTheme(), [3, 1]);
    await h.api.fitToOnePage();

    expect(h.updates).toHaveLength(0);
    expect(h.saveCount()).toBe(0);
    expect(successMock).not.toHaveBeenCalled();
  });

  it('rolls back to the pre-fit theme when saving fails', async () => {
    const themeRef = ref(largeTheme()) as Harness['theme'];
    const pages = ref<number | null>(3) as Harness['pages'];
    const start = JSON.parse(JSON.stringify(themeRef.value)) as ThemeConfig;
    let calls = 0;

    const api = useOnePageFit(
      themeRef,
      { pageCount: computed(() => pages.value ?? null), pending: computed(() => pages.value === null) },
      {
        updateTheme: (patch) => { themeRef.value = { ...themeRef.value, ...patch } as ThemeConfig; },
        autoSave: async () => {
          calls += 1;
          // 第一次 autoSave（落盘中间档）失败。
          if (calls === 1) throw new Error('disk full');
        },
        beginHistoryGroup: () => {},
      },
    );

    await api.fitToOnePage();

    expect(themeRef.value).toEqual(start);
    expect(errorMock).toHaveBeenCalledWith(expect.stringContaining('紧凑排版未能保存'));
  });

  it('restores the pre-fit theme and clears the snapshot', async () => {
    const h = harness(largeTheme(), [3, 1]);
    await h.api.fitToOnePage();
    expect(h.api.canRestore.value).toBe(true);

    const afterFit = JSON.parse(JSON.stringify(h.theme.value)) as ThemeConfig;
    await h.api.restoreOriginalTheme();

    expect(h.theme.value.fontSize).toBe(18);
    expect(h.theme.value).not.toEqual(afterFit);
    expect(h.api.canRestore.value).toBe(false);
    expect(successMock).toHaveBeenCalledWith('已还原适配前的主题排版');
  });

  it('exposes isFitting only while the walk is running', async () => {
    const h = harness(largeTheme(), [3, 1]);
    expect(h.api.isFitting.value).toBe(false);
    await h.api.fitToOnePage();
    expect(h.api.isFitting.value).toBe(false);
  });
});
