import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: [
      'src/**/*.test.ts',
      'server/**/*.test.ts',
      'workers/**/*.test.ts',
      'packages/**/*.test.ts',
      'modules/**/*.test.ts',
      'tenants/**/*.test.ts',
    ],
    environmentMatchGlobs: [
      ['server/**', 'node'],
      ['workers/**', 'node'],
      ['packages/**', 'node'],
      ['modules/**', 'node'],
      ['tenants/**', 'node'],
    ],
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
