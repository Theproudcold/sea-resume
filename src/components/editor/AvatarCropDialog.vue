<template>
  <el-dialog
    :model-value="modelValue"
    title="调整照片取景"
    width="min(320px, calc(100vw - 32px))"
    align-center
    append-to-body
    :close-on-click-modal="false"
    @update:model-value="(value: boolean) => emit('update:modelValue', value)"
    @open="initialize()"
    @opened="initialize()"
    @closed="emit('closed')"
  >
    <div
      ref="stageRef"
      class="crop-stage"
      :class="`is-${shapeKind}`"
      tabindex="0"
      role="application"
      :aria-label="stageLabel"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerUp"
      @wheel.prevent="handleWheel"
      @keydown="handleKeydown"
    >
      <img v-if="source" class="crop-image" :src="source.objectUrl" :style="imageStyle" alt="" draggable="false" />
      <div class="crop-mask" aria-hidden="true"></div>
    </div>

    <div class="crop-controls">
      <el-slider
        class="crop-zoom"
        :model-value="zoomPercent"
        :min="100"
        :max="MAX_CROP_ZOOM * 100"
        :step="5"
        :show-tooltip="false"
        aria-label="缩放"
        @update:model-value="setZoomPercent"
      />
      <el-button link size="small" @click="initialize(true)">重置</el-button>
    </div>
    <p class="crop-hint">拖动照片调整位置，滚轮或滑块缩放。圆形按内切圆取景，方形取满整块。</p>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="confirm">应用</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { AvatarShape } from '@/types/resume';
import type { LoadedAvatar } from '@/utils/avatarImage';
import { renderAvatarCrop } from '@/utils/avatarImage';
import { MAX_CROP_ZOOM, createCropView, cropZoomPercent, minCropScale, panCropView, viewToCrop, zoomCropView, type AvatarCropView } from '@/utils/avatarCropGeometry';
import { normalizeAvatarShape } from '@/utils/avatarShape';

const props = defineProps<{
  modelValue: boolean;
  source: LoadedAvatar | null;
  shape: AvatarShape | undefined;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [dataUrl: string];
  closed: [];
}>();

/** 布局不可用时的兜底边长：jsdom 没有排版，真实浏览器里用测量值。 */
const STAGE_FALLBACK = 260;
const KEY_PAN_STEP = 8;
const WHEEL_ZOOM_STEP = 1.12;

const stageRef = ref<HTMLElement>();
const view = ref<AvatarCropView | null>(null);
/** 已按哪张源图初始化过，避免 el-dialog 的 open/opened 两次触发把用户的拖动重置掉。 */
const initializedFor = ref('');
let dragging: { pointerId: number; x: number; y: number } | null = null;

const shapeKind = computed(() => normalizeAvatarShape(props.shape));
const stageLabel = computed(() => `照片取景。拖动调整位置，方向键微调，滚轮或滑块缩放。当前为${shapeKind.value === 'circle' ? '圆形' : '方形'}头像`);

const imageStyle = computed(() => {
  const current = view.value;
  if (!current) return { visibility: 'hidden' as const };
  return {
    width: `${current.width * current.scale}px`,
    height: `${current.height * current.scale}px`,
    transform: `translate3d(${current.offsetX}px, ${current.offsetY}px, 0)`,
  };
});

const zoomPercent = computed(() => (view.value ? cropZoomPercent(view.value) : 100));

function initialize(force = false) {
  const loaded = props.source;
  if (!loaded) return;
  const measured = Math.round(stageRef.value?.getBoundingClientRect().width ?? 0);
  const viewport = measured > 0 ? measured : STAGE_FALLBACK;
  const key = `${loaded.objectUrl}:${loaded.width}x${loaded.height}`;
  if (!force && initializedFor.value === key && view.value?.viewport === viewport) return;
  initializedFor.value = key;
  view.value = createCropView(viewport, loaded.width, loaded.height);
}

function handleResize() {
  const loaded = props.source;
  const current = view.value;
  if (!loaded || !current) return;
  const measured = Math.round(stageRef.value?.getBoundingClientRect().width ?? 0);
  if (measured <= 0 || measured === current.viewport) return;
  // 视口变了：按新尺寸重建初始取景，而不是把旧的像素偏移硬套上去。
  initializedFor.value = '';
  view.value = createCropView(measured, loaded.width, loaded.height);
}

function handlePointerDown(event: PointerEvent) {
  const stage = stageRef.value;
  if (!stage || !view.value) return;
  stage.focus();
  try {
    stage.setPointerCapture(event.pointerId);
  } catch {
    // 环境不支持指针捕获时仍可拖动，只是移出元素后不再跟随。
  }
  dragging = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
}

function handlePointerMove(event: PointerEvent) {
  if (!dragging || !view.value) return;
  if (event.pointerId !== dragging.pointerId) return;
  const dx = event.clientX - dragging.x;
  const dy = event.clientY - dragging.y;
  dragging.x = event.clientX;
  dragging.y = event.clientY;
  view.value = panCropView(view.value, dx, dy);
}

function handlePointerUp(event: PointerEvent) {
  if (dragging && dragging.pointerId === event.pointerId) dragging = null;
  try {
    stageRef.value?.releasePointerCapture(event.pointerId);
  } catch {
    // 与捕获同理：释放失败不影响后续操作。
  }
}

function handleWheel(event: WheelEvent) {
  const current = view.value;
  if (!current) return;
  const rect = stageRef.value?.getBoundingClientRect();
  const anchorX = rect ? event.clientX - rect.left : current.viewport / 2;
  const anchorY = rect ? event.clientY - rect.top : current.viewport / 2;
  const factor = event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
  view.value = zoomCropView(current, current.scale * factor, anchorX, anchorY);
}

function zoomAtCenter(factor: number) {
  const current = view.value;
  if (!current) return;
  view.value = zoomCropView(current, current.scale * factor, current.viewport / 2, current.viewport / 2);
}

function setZoomPercent(percent: number | number[]) {
  const current = view.value;
  if (!current || Array.isArray(percent)) return;
  const target = minCropScale(current.viewport, current.width, current.height) * (percent / 100);
  view.value = zoomCropView(current, target, current.viewport / 2, current.viewport / 2);
}

function handleKeydown(event: KeyboardEvent) {
  const current = view.value;
  if (!current) return;
  switch (event.key) {
    case 'ArrowLeft': view.value = panCropView(current, -KEY_PAN_STEP, 0); break;
    case 'ArrowRight': view.value = panCropView(current, KEY_PAN_STEP, 0); break;
    case 'ArrowUp': view.value = panCropView(current, 0, -KEY_PAN_STEP); break;
    case 'ArrowDown': view.value = panCropView(current, 0, KEY_PAN_STEP); break;
    case '+':
    case '=': zoomAtCenter(WHEEL_ZOOM_STEP); break;
    case '-':
    case '_': zoomAtCenter(1 / WHEEL_ZOOM_STEP); break;
    default: return;
  }
  event.preventDefault();
}

function confirm() {
  const current = view.value;
  const loaded = props.source;
  if (!current || !loaded) return;
  emit('confirm', renderAvatarCrop(loaded.image, viewToCrop(current)));
}

onBeforeUnmount(() => {
  dragging = null;
});
</script>

<style scoped>
.crop-stage {
  position: relative;
  /* 宽度必须跟着对话框内容盒走：写死宽度会溢出 24px 内边距的可视区，
     而对话框主体只有一个轴向显式设了 overflow，另一轴会一并变成 auto，
     于是冒出一条横向滚动条。260px 只作为上限。 */
  width: min(100%, 260px);
  aspect-ratio: 1 / 1;
  margin: 0 auto;
  overflow: hidden;
  background: var(--color-sunken);
  cursor: grab;
  /* 触摸拖动不要被页面滚动抢走。 */
  touch-action: none;
}

.crop-stage:active {
  cursor: grabbing;
}

.crop-stage:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.crop-image {
  position: absolute;
  top: 0;
  left: 0;
  max-width: none;
  user-select: none;
  will-change: transform;
}

.crop-mask {
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: 0 0 0 2px var(--color-accent);
}

/* 圆形：内切圆之外压暗，让用户看到实际会被裁掉的部分。 */
.crop-stage.is-circle .crop-mask {
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--color-accent), 0 0 0 9999px var(--color-overlay);
}

.crop-stage.is-square .crop-mask {
  border-radius: 2px;
}

.crop-controls {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-top: var(--space-xs);
}

.crop-zoom {
  flex: 1;
  min-width: 0;
}

.crop-hint {
  margin: var(--space-2xs) 0 0;
  color: var(--color-muted);
  font-size: var(--text-xs);
  line-height: 1.45;
}
</style>
