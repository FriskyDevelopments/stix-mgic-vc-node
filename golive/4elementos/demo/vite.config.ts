import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: resolve(here, '../onboarding'),
  plugins: [react()],
  build: {
    outDir: resolve(here, 'public'),
    emptyOutDir: true,
    sourcemap: false,
  },
})
