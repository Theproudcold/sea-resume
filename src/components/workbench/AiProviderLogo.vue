<script setup lang="ts">
import { Connection } from '@element-plus/icons-vue';
import type { AiProviderPresetId } from '@/services/ai/AiSettings';
import openAiLogo from '@/assets/openai.svg';
import deepSeekLogo from '@/assets/deepseek.svg';
import qwenLogo from '@/assets/qwen.svg';

defineProps<{ presetId: AiProviderPresetId }>();
</script>

<template>
  <span class="provider-logo" :class="`logo-${presetId}`" aria-hidden="true">
    <img v-if="presetId === 'openai'" :src="openAiLogo" alt="" />
    <img v-else-if="presetId === 'deepseek'" :src="deepSeekLogo" alt="" />
    <img v-else-if="presetId === 'qwen'" :src="qwenLogo" alt="" />
    <Connection v-else />
  </span>
</template>

<style scoped>
.provider-logo {
  display: grid;
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-card);
  background: var(--color-paper-3);
  color: var(--color-ink-2);
}
.provider-logo img { display: block; width: 25px; height: 25px; object-fit: contain; }
.logo-deepseek { background: var(--color-accent-wash); }
.logo-qwen { border: 0; background: transparent; }
.logo-qwen img { width: 36px; height: 36px; }
.logo-custom { background: var(--color-paper-2); }
</style>
