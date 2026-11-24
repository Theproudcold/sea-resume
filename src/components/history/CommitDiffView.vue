<template>
  <section class="commit-diff" aria-label="版本差异">
    <template v-if="diff.initial">
      <div class="diff-initial">
        <strong>初始版本</strong>
        <span v-if="diff.stats.sections.length">{{ diff.stats.sections.join(' · ') }}</span>
        <p>这是这份简历的第一个版本，没有更早的版本可以对比。</p>
      </div>
    </template>
    <template v-else>
      <header class="diff-summary">
        <span>共 {{ diff.hunks.length }} 处变化</span>
        <span class="diff-add">+{{ diff.stats.additions }}</span>
        <span class="diff-del">−{{ diff.stats.deletions }}</span>
        <span v-if="diff.truncated" class="diff-truncated">内容较长，仅显示部分行</span>
      </header>

      <div v-if="!diff.hunks.length" class="diff-empty">这个版本与父版本内容一致。</div>
      <div v-else class="diff-hunks">
        <article v-for="hunk in diff.hunks" :key="hunk.id" class="diff-hunk" :class="`is-${hunk.type}`">
          <header class="hunk-head">
            <span class="hunk-badge">{{ typeLabel(hunk.type) }}</span>
            <strong>{{ hunk.section }}</strong>
            <span class="hunk-label">{{ hunk.label }}</span>
          </header>
          <p v-if="hunk.note" class="hunk-note">{{ hunk.note }}</p>
          <div v-else class="hunk-lines" role="group" :aria-label="`${hunk.section} ${hunk.label} 差异`">
            <div v-for="(line, index) in hunk.lines" :key="index" class="diff-line" :class="`is-${line.kind}`">
              <span class="line-mark" aria-hidden="true">{{ line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' ' }}</span>
              <span class="line-text">{{ line.text || ' ' }}</span>
            </div>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import type { CommitDiff } from '@/services/history/diff';
import type { ResumeDifferenceType } from '@/utils/resumeVersions';

defineProps<{ diff: CommitDiff }>();

function typeLabel(type: ResumeDifferenceType): string {
  return { added: '新增', removed: '删除', modified: '修改', formatted: '格式' }[type];
}
</script>

<style scoped>
.commit-diff { min-width: 0; }
.diff-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--ui-border); color: var(--ui-text-secondary); font-size: var(--ui-font-xs); }
.diff-add { color: var(--ui-success); font-family: var(--ui-font-mono, ui-monospace, monospace); }
.diff-del { color: var(--ui-danger); font-family: var(--ui-font-mono, ui-monospace, monospace); }
.diff-truncated { margin-left: auto; color: var(--ui-warning); }
.diff-hunks { display: flex; flex-direction: column; gap: 18px; padding-top: 16px; }
.diff-hunk { border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); overflow: hidden; background: var(--ui-bg-surface); }
.hunk-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 12px; background: var(--ui-bg-subtle); border-bottom: 1px solid var(--ui-border); font-size: var(--ui-font-xs); }
.hunk-head strong { color: var(--ui-text-main); }
.hunk-label { color: var(--ui-text-secondary); overflow-wrap: anywhere; }
.hunk-badge { padding: 1px 6px; border-radius: 999px; background: var(--ui-bg-elevated); color: var(--ui-text-secondary); }
.diff-hunk.is-added .hunk-badge { color: var(--ui-success); }
.diff-hunk.is-removed .hunk-badge { color: var(--ui-danger); }
.diff-hunk.is-modified .hunk-badge { color: var(--ui-info); }
.hunk-note { margin: 0; padding: 10px 12px; color: var(--ui-text-secondary); font-size: var(--ui-font-xs); }
.hunk-lines { overflow-x: auto; font-family: var(--ui-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 12px; line-height: 1.6; }
.diff-line { display: grid; grid-template-columns: 24px minmax(0, 1fr); min-width: 0; }
.line-mark { text-align: center; user-select: none; color: var(--ui-text-muted); }
.line-text { padding-right: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
.diff-line.is-add { background: color-mix(in srgb, var(--ui-success) 10%, transparent); }
.diff-line.is-add .line-mark { color: var(--ui-success); }
.diff-line.is-del { background: color-mix(in srgb, var(--ui-danger) 10%, transparent); }
.diff-line.is-del .line-mark { color: var(--ui-danger); }
.diff-line.is-del .line-text { text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--ui-danger) 60%, transparent); }
.diff-initial { padding: 24px 0; color: var(--ui-text-secondary); }
.diff-initial strong { display: block; margin-bottom: 6px; color: var(--ui-text-main); font-size: var(--ui-font-lg); }
.diff-initial p { margin: 6px 0 0; }
.diff-empty { padding: 28px 0; color: var(--ui-text-secondary); text-align: center; }
@media (max-width: 720px) {
  .diff-hunks { gap: 14px; }
  .diff-summary { gap: 8px; }
}
</style>
