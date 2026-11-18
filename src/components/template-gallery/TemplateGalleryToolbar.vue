<template>
  <section class="toolbar">
    <div ref="categoryRow" class="toolbar__row toolbar__row--categories" role="group" aria-label="模板分类">
      <span
        class="toolbar__thumb"
        :class="{ 'is-ready': thumb.ready, 'is-sliding': thumb.slide }"
        aria-hidden="true"
        :style="thumbStyle"
      />
      <button
        v-for="category in categories"
        :key="category.value"
        :ref="(element) => setTagRef(category.value, element)"
        type="button"
        class="toolbar__tag"
        :class="{ 'is-active': category.value === activeCategory }"
        :aria-pressed="category.value === activeCategory"
        @click="$emit('update:category', category.value)"
      >
        {{ category.label }}
      </button>
    </div>
    <div class="toolbar__row toolbar__row--controls">
      <el-input
        :model-value="search"
        placeholder="搜索模板"
        aria-label="搜索模板"
        clearable
        @update:model-value="(value: string) => $emit('update:search', value)"
      />
      <el-select
        class="toolbar__sort"
        aria-label="模板排序"
        :model-value="sortBy"
        @update:model-value="(value: TemplateSortKey) => $emit('update:sort', value)"
      >
        <el-option label="推荐优先" value="recommended" />
        <el-option label="名称排序" value="name" />
        <el-option label="最近使用" value="recent" />
      </el-select>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import type { TemplateSortKey } from '@/utils/template-gallery';
import type { TemplateMetadata } from '@/types/resume';

type CategoryValue = TemplateMetadata['category'] | 'all';

const props = defineProps<{
  categories: Array<{
    value: CategoryValue;
    label: string;
  }>;
  activeCategory: CategoryValue;
  search: string;
  sortBy: TemplateSortKey;
}>();

defineEmits<{
  'update:category': [value: CategoryValue];
  'update:search': [value: string];
  'update:sort': [value: TemplateSortKey];
}>();

const categoryRow = ref<HTMLElement | null>(null);
const tagElements = new Map<CategoryValue, HTMLButtonElement>();
const thumb = reactive({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  ready: false,
  slide: false,
});

const thumbStyle = computed(() => ({
  width: `${thumb.width}px`,
  height: `${thumb.height}px`,
  transform: `translate(${thumb.x}px, ${thumb.y}px)`,
}));

const setTagRef = (value: CategoryValue, element: unknown) => {
  if (element instanceof HTMLButtonElement) {
    tagElements.set(value, element);
    return;
  }
  tagElements.delete(value);
};

let resizeObserver: ResizeObserver | null = null;
let enableFrame = 0;
let slideTimer = 0;
let sliding = false;

const slideDuration = () => {
  const token = categoryRow.value
    ? getComputedStyle(categoryRow.value).getPropertyValue('--dur-short').trim()
    : '';
  const value = Number.parseFloat(token);
  const duration = !token || !Number.isFinite(value) ? 220 : token.endsWith('ms') ? value : value * 1000;
  return duration + 40;
};

let resizePending = false;

const enableSlide = () => {
  cancelAnimationFrame(enableFrame);
  enableFrame = requestAnimationFrame(() => {
    thumb.slide = true;
  });
};

const placeThumb = (animate: boolean) => {
  const row = categoryRow.value;
  const tag = tagElements.get(props.activeCategory);
  if (!row || !tag) return;

  const nextX = tag.offsetLeft;
  const nextY = tag.offsetTop;
  const nextWidth = tag.offsetWidth;
  const nextHeight = tag.offsetHeight;
  const changed = !thumb.ready
    || thumb.x !== nextX
    || thumb.y !== nextY
    || thumb.width !== nextWidth
    || thumb.height !== nextHeight;

  if (!animate || !thumb.ready || !changed) {
    if (!changed && thumb.ready) return;
    sliding = false;
    window.clearTimeout(slideTimer);
    thumb.slide = false;
    thumb.x = nextX;
    thumb.y = nextY;
    thumb.width = nextWidth;
    thumb.height = nextHeight;
    thumb.ready = true;
    enableSlide();
    return;
  }

  thumb.slide = true;
  thumb.x = nextX;
  thumb.y = nextY;
  thumb.width = nextWidth;
  thumb.height = nextHeight;
  sliding = true;
  window.clearTimeout(slideTimer);
  slideTimer = window.setTimeout(() => {
    sliding = false;
    if (!resizePending) return;
    resizePending = false;
    placeThumb(false);
  }, slideDuration());
};

onMounted(() => {
  placeThumb(false);
  if (categoryRow.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (sliding) {
        resizePending = true;
        return;
      }
      placeThumb(false);
    });
    resizeObserver.observe(categoryRow.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  cancelAnimationFrame(enableFrame);
  window.clearTimeout(slideTimer);
});

watch(() => props.activeCategory, () => {
  placeThumb(true);
}, { flush: 'post' });

watch(() => props.categories.map((category) => `${category.value}:${category.label}`).join('|'), () => {
  placeThumb(false);
}, { flush: 'post' });
</script>

<style scoped>
.toolbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-sm) var(--space-lg);
  padding-bottom: var(--space-md);
  border-bottom: var(--rule-hair) solid var(--color-rule);
}

.toolbar__row {
  display: flex;
  min-width: 0;
}

/* Category choice: keys on a sunken tray; one raised key slides between them. */
.toolbar__row--categories {
  position: relative;
  flex-wrap: wrap;
  gap: var(--space-3xs);
  justify-self: start;
  padding: var(--space-3xs);
  border-radius: var(--radius-input);
  background: var(--color-sunken);
}

.toolbar__thumb {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
  border-radius: var(--radius-s);
  background: var(--color-paper-3);
  box-shadow: var(--shadow-card);
  pointer-events: none;
  opacity: 0;
}

.toolbar__thumb.is-ready {
  opacity: 1;
}

.toolbar__thumb.is-sliding {
  transition:
    transform var(--dur-short) var(--ease-out),
    width var(--dur-short) var(--ease-out),
    height var(--dur-short) var(--ease-out);
}

.toolbar__tag {
  position: relative;
  z-index: 1;
  min-width: 0;
  min-height: var(--control-height-s);
  padding: 0 var(--space-sm);
  border: 0;
  border-radius: var(--radius-s);
  background: transparent;
  color: var(--color-ink-2);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: color var(--dur-short) var(--ease-out), background-color var(--dur-micro) var(--ease-out);
}

@media (hover: hover) {
  .toolbar__tag:not(.is-active):hover {
    color: var(--color-ink);
    background: color-mix(in oklab, var(--color-paper-3) 55%, transparent);
  }
}

.toolbar__tag:active {
  box-shadow: var(--shadow-key-press);
}

.toolbar__tag.is-active {
  background: transparent;
  color: var(--color-ink);
  font-weight: 600;
  box-shadow: none;
}

.toolbar__tag:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 1px;
}

.toolbar__row--controls {
  align-items: center;
  gap: var(--space-xs);
}

.toolbar__row--controls :deep(.el-input) {
  flex: 1 1 auto;
  min-width: 0;
}

.toolbar__sort {
  width: 11rem;
  flex-shrink: 0;
}

@media (max-width: 1024px) {
  .toolbar {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 768px) {
  .toolbar__row--categories {
    flex-wrap: nowrap;
    max-width: 100%;
    overflow-x: auto;
  }

  .toolbar__row--controls {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar__row--controls :deep(.el-input),
  .toolbar__sort {
    width: 100%;
  }
}
</style>
