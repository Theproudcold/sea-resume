<template>
  <div class="contact-icon" :class="{ 'contact-icon--aligned': aligned }">
    <svg
      v-if="aligned && glyph"
      class="contact-icon__glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path v-for="(d, index) in glyph" :key="index" :d="d" />
    </svg>
    <el-icon v-else-if="DisplayIcon" :size="size">
      <component :is="DisplayIcon" />
    </el-icon>
    <span v-else>{{ defaultLabel }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import * as Icons from '@element-plus/icons-vue';

const props = defineProps<{
  type: 'email' | 'phone' | 'location' | 'website' | 'github' | 'custom';
  icon?: string; // Icon component name override
  size?: number | string;
}>();

/**
 * 默认联系方式图标。
 *
 * Element Plus 的 Message / Iphone / Location 描边盒差太多：邮箱扁、手机瘦高、
 * 定位针几乎顶满画布，排进同一行时视觉中心对不齐。这里用同一套 24 视口、2px 圆角描边，
 * 并且把图形都收在四周留 2px 的视觉盒里，行内中心和文字基线才能对齐。
 * 用户手动换成其他图标时仍走 Element Plus，避免丢掉已有的图标选择。
 * 路径直接写在 <path> 上，不要套 <template>，否则 SVG 命名空间会丢，图标不渲染。
 */
const alignedGlyphs: Record<'email' | 'phone' | 'location', string[]> = {
  // 视觉盒都以 (12, 12) 为中心。定位针的圆头对齐这个中心，针尖再向下伸出。
  email: [
    'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
    'M3 8.2 12 13.4 21 8.2',
  ],
  phone: [
    'M7.15 5.75h2.1l1.1 2.7-1.4 1a11 11 0 0 0 5.7 5.7l1-1.4 2.7 1.1v2.1a1.4 1.4 0 0 1-1.5 1.4A14.2 14.2 0 0 1 5.75 7.25a1.4 1.4 0 0 1 1.4-1.5z',
  ],
  location: [
    'M12 22s6-5.2 6-10a6 6 0 0 0-12 0c0 4.8 6 10 6 10z',
    'M14.1 12a2.1 2.1 0 1 1-4.2 0 2.1 2.1 0 1 1 4.2 0',
  ],
};

const defaultIcons = {
  email: 'Message',
  phone: 'Iphone',
  location: 'Location',
  website: 'Monitor',
  github: 'Platform',
  custom: 'Link',
};

const defaultLabels = {
  email: '邮箱',
  phone: '电话',
  location: '地址',
  website: '网站',
  github: 'GitHub',
  custom: '链接',
};

const aligned = computed(() => {
  if (props.type !== 'email' && props.type !== 'phone' && props.type !== 'location') return false;
  const override = props.icon;
  return !override || override === defaultIcons[props.type];
});

const glyph = computed(() => (aligned.value && props.type in alignedGlyphs
  ? alignedGlyphs[props.type as keyof typeof alignedGlyphs]
  : null));

const DisplayIcon = computed(() => {
  const iconName = props.icon || defaultIcons[props.type];
  return (Icons as Record<string, unknown>)[iconName];
});

const defaultLabel = computed(() => defaultLabels[props.type]);
</script>

<style scoped>
.contact-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  line-height: 0;
}

/* 固定槽，不跟字号一起被 flex 拉伸；图形在槽内居中，行与行的图标中心落在同一条线上。 */
.contact-icon--aligned {
  width: 1.15em;
  height: 1.15em;
}

.contact-icon__glyph {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
