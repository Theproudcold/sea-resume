<template>
  <div id="app">
    <router-view v-slot="{ Component }">
      <component :is="Component" />
    </router-view>
  </div>
</template>

<style>
.async-feature-status {
  padding: var(--space-md);
  color: var(--color-ink-2);
  background: var(--color-paper-3);
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: var(--radius-card);
}
.async-feature-status button { color: var(--color-accent); text-decoration: underline; }
</style>
