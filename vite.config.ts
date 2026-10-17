import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { relayAssets } from './build/relayAssets'

// https://vite.dev/config/
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/').pop()
const defaultBase =
  process.env.GITHUB_ACTIONS === 'true' &&
  repositoryName &&
  !repositoryName.endsWith('.github.io')
    ? `/${repositoryName}/`
    : '/'

export default defineConfig({
  base: process.env.VITE_BASE_PATH || defaultBase,
  plugins: [vue(), relayAssets()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.{spec,test}.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**', '.worktrees/**', '.pnpm-store/**'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
})
