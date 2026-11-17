/**
 * 编辑器分区的 KeepAlive 宿主管理。
 *
 * 为什么需要它：每个分区（工作经历、项目…）里都有富文本编辑器，切分区时如果整棵
 * 子树重建，输入焦点、滚动位置和未提交的输入法状态都会丢。做法是给**每个
 * (简历, 分区) 组合**一个独立的组件名，交给 `<KeepAlive :include>`，这样切分区
 * 只是显示/隐藏，而不是重建；同时移出一个模块时可以只淘汰它自己。
 *
 * 约束（改这里之前先读）：
 * 1. `KeepAlive` 的 include 是**按逗号切分的字符串模式**，所以生成的组件名里
 *    不能出现逗号——分区 ID 是用户可命名的，必须编码。
 * 2. 名字里必须带简历 ID：同一分区在两份简历之间必须重新挂载，不能复用实例，
 *    否则会把上一份简历的内容画到新简历里。
 * 3. 宿主是 `markRaw` 的：它作为组件定义被复用，不需要（也不应该）变成响应式。
 */
import { computed, markRaw, ref, watch, type Component, type ComputedRef, type Ref } from 'vue';

export interface SectionKeepAliveApi {
  /** 当前应该渲染的宿主组件（按 (简历, 分区) 复用）。 */
  host: ComputedRef<Component>;
  /** 交给 `<KeepAlive :include>` 的名字列表：只有仍然有效的分区会被缓存。 */
  cacheableHostNames: ComputedRef<string[]>;
}

export function useSectionKeepAlive(options: {
  /** 宿主组件的原始定义。 */
  hostComponent: Component;
  /** 当前简历 ID；变化时清空已缓存的宿主。 */
  resumeId: Ref<string>;
  /** 当前分区 ID。 */
  sectionId: Ref<string>;
  /** 当前仍然有效的分区 ID（顺序 + 内置）列表。 */
  validSectionIds: ComputedRef<string[]>;
}): SectionKeepAliveApi {
  const { hostComponent, resumeId, sectionId, validSectionIds } = options;

  const hosts = new Map<string, Component>();
  const hostName = (resume: string, section: string) =>
    `EditorContent_${encodeURIComponent(JSON.stringify([resume, section]))}`;

  const cacheableHostNames = computed(() =>
    validSectionIds.value.map((id) => hostName(resumeId.value, id)));

  const host = computed(() => {
    const name = hostName(resumeId.value, sectionId.value);
    let cached = hosts.get(name);
    if (!cached) {
      cached = markRaw({ ...hostComponent, name });
      hosts.set(name, cached);
    }
    return cached;
  });

  // 换简历时整批作废：新简历的分区必须是新实例。
  watch(resumeId, () => hosts.clear());

  // 已经不在顺序里的分区要从 include 移出，让 KeepAlive 卸载它。
  watch(cacheableHostNames, (names) => {
    const valid = new Set(names);
    for (const name of hosts.keys()) {
      if (!valid.has(name)) hosts.delete(name);
    }
  });

  return { host, cacheableHostNames };
}

/**
 * 当前分区是否仍然有效；无效时回落到第一个可用分区（兜底到「基础信息」）。
 *
 * `sectionOrder` 可以把模块移出去而不删数据，所以 store 里的 `activeSection`
 * 可能指向一个当前不在顺序里的 ID。
 */
export function useValidSectionFallback(options: {
  sectionId: Ref<string>;
  validSectionIds: ComputedRef<string[]>;
  sectionOrder: Ref<string[]>;
  select: (id: string) => void;
}) {
  const { sectionId, validSectionIds, sectionOrder, select } = options;
  const lastFallback = ref('');

  watch([validSectionIds, sectionId], ([ids]) => {
    if (!ids.length || ids.includes(sectionId.value)) return;
    const next = sectionOrder.value.find((id) => ids.includes(id)) || 'basic';
    if (next === lastFallback.value) return;
    lastFallback.value = next;
    select(next);
  });
}
