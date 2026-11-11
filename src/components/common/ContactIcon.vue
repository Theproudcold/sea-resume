<template>
  <div class="contact-icon flex items-center justify-center">
    <el-icon v-if="DisplayIcon" :size="size">
      <component :is="DisplayIcon" />
    </el-icon>
    <!-- Fallback if no icon found (shouldn't happen with defaults) -->
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

// Default mappings
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

const DisplayIcon = computed(() => {
  const iconName = props.icon || defaultIcons[props.type];
  return (Icons as any)[iconName];
});

const defaultLabel = computed(() => defaultLabels[props.type]);
</script>
