<template>
  <div id="app">
    <router-view v-slot="{ Component }">
      <Transition name="page-enter">
        <component :is="Component" />
      </Transition>
    </router-view>
  </div>
</template>

<style>
.page-enter-enter-active {
  transition: opacity var(--ui-duration-normal, 180ms) var(--ui-ease-out, ease-out);
}
.page-enter-enter-from { opacity: 0; }
/* Route loading never waits for an outgoing animation. */
.page-enter-leave-active { display: none; }
.async-feature-status {
  padding: 20px;
  color: var(--ui-text-secondary);
  background: var(--ui-bg-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
}
.async-feature-status button { color: var(--ui-primary); text-decoration: underline; }
@media print {
  .page-enter-enter-active { transition: none !important; opacity: 1 !important; }
}
</style>
