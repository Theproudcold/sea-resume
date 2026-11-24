<template>
  <span class="harness-icon" aria-hidden="true">
    <span v-if="mark.raw" class="harness-icon__inline" v-html="mark.raw" />
    <img v-else :src="mark.src" alt="" />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { RelayClient } from '@/services/ai/externalAiBridge';
import amp from '@/assets/harness/amp.svg?raw';
import claude from '@/assets/harness/claudecode-color.svg';
import codex from '@/assets/harness/codex-color.svg';
import copilot from '@/assets/harness/githubcopilot.svg?raw';
import crush from '@/assets/harness/crush.png';
import deepseek from '@/assets/harness/deepseek-color.svg';
import gemini from '@/assets/harness/geminicli-color.svg';
import goose from '@/assets/harness/goose.svg?raw';
import opencode from '@/assets/harness/opencode.svg?raw';
import pi from '@/assets/harness/pi.svg?raw';
import qwen from '@/assets/harness/qwen-color.svg';
import zcode from '@/assets/harness/zcode.png';

const props = defineProps<{ id: RelayClient }>();

/**
 * Color marks and Magpie's PNG logos stay images.
 * Mono marks are inlined: Pi's even-odd hole becomes a solid square when the same file is used as a CSS mask.
 */
const mcpJson = '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="4" cy="4" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="4" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="12" r="2" stroke="currentColor" stroke-width="1.5"/><path d="M5.6 5.2L7 10.2M10.4 5.2L9 10.2M6 4h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

const marks: Record<RelayClient, { src?: string; raw?: string }> = {
  codex: { src: codex },
  'codex-config': { src: codex },
  claude: { src: claude },
  'mcp-json': { raw: mcpJson },
  pi: { raw: pi },
  zcode: { src: zcode },
  dsh: { src: deepseek },
  opencode: { raw: opencode },
  gemini: { src: gemini },
  qwen: { src: qwen },
  amp: { raw: amp },
  copilot: { raw: copilot },
  crush: { src: crush },
  goose: { raw: goose },
};
const mark = computed(() => marks[props.id]);
</script>

<style scoped>
.harness-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: var(--color-ink);
}
.harness-icon img { display: block; width: 100%; height: 100%; object-fit: contain; }
.harness-icon__inline { display: flex; width: 100%; height: 100%; }
.harness-icon__inline :deep(svg) { display: block; width: 100%; height: 100%; }
</style>
