import { defineAsyncComponent, defineComponent, h, shallowRef, ref, watch, type Component } from 'vue';

type FeatureLoader = () => Promise<{ default: Component }>;

/** Lazy-mount once, preserving feature state and allowing retries without a page reload. */
export function lazyFeature(loader: FeatureLoader) {
  return defineComponent({
    inheritAttrs: false,
    props: { active: { type: Boolean, default: true } },
    setup(props, { attrs, slots }) {
      const opened = ref(props.active);
      watch(() => props.active, (active) => { if (active) opened.value = true; });
      const createFeature = (): Component => defineAsyncComponent({
        loader: () => loader().then((module) => module.default),
        delay: 120,
        loadingComponent: defineComponent(() => () => h('div', {
          role: 'status', class: 'async-feature-status',
        }, '正在加载功能…')),
        errorComponent: defineComponent(() => () => h('div', {
          role: 'alert', class: 'async-feature-status',
        }, [
          h('p', '功能加载失败，请检查网络后重试'),
          h('button', { type: 'button', onClick: () => { feature.value = createFeature(); } }, '重新加载'),
        ])),
        onError(_, retry, fail, attempts) {
          if (attempts < 2) retry();
          else fail();
        },
      });
      const feature = shallowRef(createFeature());
      return () => opened.value ? h(feature.value, attrs, slots) : null;
    },
  });
}
