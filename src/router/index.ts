import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'workbench',
      component: () => import('@/views/Workbench.vue'),
    },
    {
      path: '/editor/:id',
      name: 'editor',
      component: () => import('@/views/Editor.vue'),
    },
    {
      path: '/templates',
      name: 'templates',
      component: () => import('@/views/TemplateGallery.vue'),
    },
  ],
});

export default router;
