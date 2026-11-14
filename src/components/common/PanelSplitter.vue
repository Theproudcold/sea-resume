<template>
  <div
    class="panel-splitter no-print"
    :class="[`panel-splitter--${align}`, { 'is-collapsed': collapsed, 'can-resize': canDrag }]"
  >
    <div
      class="panel-splitter__handle"
      role="separator"
      aria-orientation="vertical"
      :tabindex="canDrag ? 0 : -1"
      :aria-label="label"
      :aria-valuenow="Math.round(value)"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-disabled="canDrag ? undefined : 'true'"
      @pointerdown="startDrag"
      @pointermove="moveDrag"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @lostpointercapture="endDrag"
      @keydown="onKeydown"
      @dblclick="onReset"
    ></div>
    <button
      type="button"
      class="panel-splitter__toggle"
      :class="{ 'is-off': collapsed }"
      :title="collapsed ? expandTitle : collapseTitle"
      :aria-label="collapsed ? expandTitle : collapseTitle"
      :aria-expanded="collapsed ? 'false' : 'true'"
      :disabled="!toggleable"
      @click="emit('toggle')"
    >
      <el-icon aria-hidden="true"><component :is="collapsed ? ArrowRight : ArrowLeft" /></el-icon>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue';
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue';

const props = withDefaults(defineProps<{
  /** 可访问名称，例如「调整模块导航宽度」。 */
  label: string;
  /** 左侧栏目是否已折叠：折叠后只能通过按钮展开。 */
  collapsed?: boolean;
  /** 是否允许拖拽改变宽度。 */
  resizable?: boolean;
  /** 是否允许折叠 / 展开左侧栏目。 */
  toggleable?: boolean;
  collapseTitle?: string;
  expandTitle?: string;
  /** 折叠按钮的落位：栏缝在容器边缘时改为靠内，避免被容器裁掉。 */
  align?: 'center' | 'start' | 'end';
  value?: number;
  min?: number;
  max?: number;
}>(), {
  collapsed: false,
  resizable: true,
  toggleable: true,
  collapseTitle: '折叠此栏',
  expandTitle: '展开此栏',
  align: 'center',
  value: 0,
  min: 0,
  max: 0,
});

const emit = defineEmits<{
  resize: [delta: number];
  toggle: [];
  reset: [];
}>();

const STEP = 16;
const canDrag = computed(() => props.resizable && !props.collapsed);

let dragging = false;
let lastX = 0;
let previousCursor = '';
let previousUserSelect = '';

const setDragCursor = (active: boolean) => {
  if (typeof document === 'undefined') return;
  if (active) {
    previousCursor = document.body.style.cursor;
    previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  } else {
    document.body.style.cursor = previousCursor;
    document.body.style.userSelect = previousUserSelect;
  }
};

const startDrag = (event: PointerEvent) => {
  if (!canDrag.value || event.button !== 0 || !Number.isFinite(event.clientX)) return;
  event.preventDefault();
  dragging = true;
  lastX = event.clientX;
  setDragCursor(true);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  const handle = event.currentTarget as HTMLElement | null;
  if (typeof handle?.setPointerCapture === 'function' && Number.isFinite(event.pointerId)) {
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // 指针已被释放时忽略。
    }
  }
};

const moveDrag = (event: PointerEvent) => {
  if (!dragging || !Number.isFinite(event.clientX)) return;
  const delta = event.clientX - lastX;
  if (!delta) return;
  lastX = event.clientX;
  emit('resize', delta);
};

const endDrag = () => {
  if (!dragging) return;
  dragging = false;
  setDragCursor(false);
  window.removeEventListener('pointerup', endDrag);
  window.removeEventListener('pointercancel', endDrag);
};

const onReset = () => emit('reset');

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' || event.key === ' ') {
    if (!props.toggleable) return;
    event.preventDefault();
    emit('toggle');
    return;
  }
  if (!canDrag.value) return;
  const step = event.shiftKey ? STEP * 4 : STEP;
  if (event.key === 'ArrowRight') emit('resize', step);
  else if (event.key === 'ArrowLeft') emit('resize', -step);
  else if (event.key === 'Home') emit('resize', props.min - props.value);
  else if (event.key === 'End') emit('resize', props.max - props.value);
  else return;
  event.preventDefault();
};

onBeforeUnmount(() => {
  if (dragging) setDragCursor(false);
});
</script>

<style scoped>
/* 栏间分隔条：静止时只是一条缝，拖拽时给出钴蓝提示。 */
.panel-splitter {
  position: relative;
  z-index: 5;
  flex: 0 0 8px;
  width: 8px;
  align-self: stretch;
  background: transparent;
  transition: background-color var(--dur-micro) var(--ease-out);
}

.panel-splitter.can-resize {
  cursor: col-resize;
}

.panel-splitter.can-resize:hover,
.panel-splitter.can-resize:active {
  background: var(--color-paper-2);
}

.panel-splitter__handle {
  position: absolute;
  inset: 0;
  outline: none;
}

.panel-splitter__handle:focus-visible {
  background: var(--color-accent-wash);
  box-shadow: inset 0 0 0 1px var(--color-accent);
}

.panel-splitter__toggle {
  position: absolute;
  top: 50%;
  display: inline-flex;
  width: 18px;
  height: 36px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: var(--rule-hair) solid var(--color-rule-2);
  border-radius: var(--radius-s);
  background: var(--color-paper-3);
  color: var(--color-ink-2);
  box-shadow: var(--shadow-key);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%);
  cursor: pointer;
  transition: opacity var(--dur-micro) var(--ease-out), color var(--dur-micro) var(--ease-out);
}

.panel-splitter--center .panel-splitter__toggle {
  left: 50%;
  transform: translate(-50%, -50%);
}

.panel-splitter--start .panel-splitter__toggle {
  left: 0;
}

.panel-splitter--end .panel-splitter__toggle {
  right: 0;
}

.panel-splitter__toggle .el-icon {
  font-size: 13px;
}

.panel-splitter:hover .panel-splitter__toggle,
.panel-splitter:focus-within .panel-splitter__toggle,
.panel-splitter.is-collapsed .panel-splitter__toggle {
  opacity: 1;
  pointer-events: auto;
}

.panel-splitter__toggle:hover:not(:disabled) {
  color: var(--color-accent);
}

/* 折叠状态下的展开按钮用主题色，提示这里可以恢复栏目。 */
.panel-splitter__toggle.is-off {
  color: var(--color-accent);
}

.panel-splitter__toggle:active:not(:disabled) {
  box-shadow: var(--shadow-key-press);
}

.panel-splitter__toggle:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 1px;
}

/* 折叠后仍保留按钮，方便随时展开；缝上给一点提示底色。 */
.panel-splitter.is-collapsed {
  background: var(--color-paper-2);
}

.panel-splitter.is-collapsed .panel-splitter__handle {
  cursor: default;
}

@media (max-width: 1024px) {
  .panel-splitter {
    display: none;
  }
}

@media print {
  .panel-splitter {
    display: none !important;
  }
}
</style>
