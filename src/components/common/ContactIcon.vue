<template>
  <div class="contact-icon flex items-center justify-center">
    <el-icon v-if="DisplayIcon" :size="size">
      <component :is="DisplayIcon" />
    </el-icon>
    <!-- Fallback if no icon found (shouldn't happen with defaults) -->
    <span v-else>{{ defaultEmoji }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import * as Icons from '@element-plus/icons-vue';

const props = defineProps<{
  type: 'email' | 'phone' | 'location' | 'website' | 'github';
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
};

const defaultEmojis = {
  email: '📧',
  phone: '📱',
  location: '📍',
  website: '🌐',
  github: '🔗',
};

const DisplayIcon = computed(() => {
  const iconName = props.icon || defaultIcons[props.type];
  return (Icons as any)[iconName];
});

const defaultEmoji = computed(() => defaultEmojis[props.type]);
</script>
