<template>
  <Transition :css="false" @enter="enter" @leave="leave" @enter-cancelled="cancel" @leave-cancelled="cancel">
    <slot />
  </Transition>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from 'vue';

// A renderless v-show transition: only the toggled body is measured. Existing
// body classes, DOM, editor instances and focus/selection survive collapsing.
const properties = ['height', 'overflow', 'transition', 'box-sizing', 'padding-top', 'padding-bottom'] as const;
type Frame = { height: number; top: string; bottom: string };
type AnimationState = {
  original: [string, string][];
  stop: () => void;
  interrupted?: Frame;
};
const active = new Map<HTMLElement, AnimationState>();

const restore = (element: HTMLElement, state: AnimationState) => {
  properties.forEach((property, index) => {
    const [value, priority] = state.original[index]!;
    if (value) element.style.setProperty(property, value, priority);
    else element.style.removeProperty(property);
  });
};
const measure = (element: HTMLElement): Frame => {
  const style = getComputedStyle(element);
  return { height: element.getBoundingClientRect().height, top: style.paddingTop, bottom: style.paddingBottom };
};
const apply = (element: HTMLElement, frame: Frame) => {
  element.style.height = `${frame.height}px`;
  element.style.paddingTop = frame.top;
  element.style.paddingBottom = frame.bottom;
};
const zero: Frame = { height: 0, top: '0px', bottom: '0px' };

const animate = (node: Element, done: () => void, expanding: boolean) => {
  const element = node as HTMLElement;
  const previous = active.get(element);
  const start = previous?.interrupted ?? (expanding ? zero : measure(element));
  previous?.stop();
  const state: AnimationState = previous ?? {
    original: properties.map(property => [element.style.getPropertyValue(property), element.style.getPropertyPriority(property)]),
    stop: () => {},
  };
  restore(element, state);
  state.interrupted = undefined;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const print = window.matchMedia?.('print');
  if (reduced?.matches || print?.matches) {
    active.delete(element);
    done();
    return;
  }

  const style = getComputedStyle(element);
  const token = style.getPropertyValue('--ui-duration-collapse').trim();
  const duration = token ? parseFloat(token) * (token.endsWith('ms') ? 1 : 1000) : 200;
  const easing = style.getPropertyValue('--ui-easing-standard').trim() || 'cubic-bezier(0.2, 0, 0, 1)';
  const target = expanding ? measure(element) : zero;
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    state.stop();
    restore(element, state);
    active.delete(element);
    done();
  };
  const onEnd = (event: TransitionEvent) => {
    if (event.target === element && event.propertyName === 'height') finish();
  };
  const onMotionChange = () => {
    if (reduced?.matches || print?.matches) finish();
  };
  state.stop = () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    element.removeEventListener('transitionend', onEnd);
    reduced?.removeEventListener?.('change', onMotionChange);
    print?.removeEventListener?.('change', onMotionChange);
  };
  active.set(element, state);
  element.style.boxSizing = 'border-box';
  element.style.overflow = 'hidden';
  element.style.transition = 'none';
  apply(element, start);
  // Flush only this body's start height before scheduling its target.
  void element.offsetHeight;
  element.addEventListener('transitionend', onEnd);
  reduced?.addEventListener?.('change', onMotionChange);
  print?.addEventListener?.('change', onMotionChange);
  frame = requestAnimationFrame(() => {
    element.style.transition = ['height', 'padding-top', 'padding-bottom'].map(property => `${property} ${duration}ms ${easing}`).join(', ');
    apply(element, target);
    timer = setTimeout(finish, duration + 50);
  });
};

const enter = (element: Element, done: () => void) => animate(element, done, true);
const leave = (element: Element, done: () => void) => animate(element, done, false);
const cancel = (node: Element) => {
  const element = node as HTMLElement;
  const state = active.get(element);
  if (!state) return;
  const current = measure(element);
  state.stop();
  state.interrupted = current;
  element.style.transition = 'none';
  apply(element, current);
};

onBeforeUnmount(() => {
  for (const [element, state] of active) {
    state.stop();
    restore(element, state);
  }
  active.clear();
});
</script>
