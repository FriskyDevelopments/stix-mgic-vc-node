import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'workers/**/*.test.ts', 'golive/**/*.test.ts', 'golive/**/*.test.tsx'],
    environmentMatchGlobs: [
      ['server/**', 'node'],
      ['workers/**', 'node'],
    ],
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
