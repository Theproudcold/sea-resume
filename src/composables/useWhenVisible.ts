import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

/** Stay false until the element is near the viewport, then stay mounted. */
export function useWhenVisible(target: Ref<HTMLElement | null>, rootMargin = '240px'): Ref<boolean> {
  const visible = ref(typeof IntersectionObserver === 'undefined' || typeof document === 'undefined' || !document.body);
  let observer: IntersectionObserver | null = null;

  onMounted(() => {
    const element = target.value;
    if (!element || visible.value) return;
    observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      visible.value = true;
      observer?.disconnect();
      observer = null;
    }, { rootMargin });
    observer.observe(element);
  });

  onBeforeUnmount(() => observer?.disconnect());
  return visible;
}
