import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const previewRoot = fileURLToPath(new URL('.', import.meta.url))
const projectRoot = resolve(previewRoot, '../..')
const sourceRoot = resolve(process.env.VC_UI_SOURCE_ROOT || projectRoot)
const sourceDirectory = resolve(sourceRoot, 'src')
const hasRundown = readFileSync(resolve(sourceDirectory, 'components/StudioMonitor.tsx'), 'utf8').includes("'rundown'")
const headers = {
  'Permissions-Policy': 'camera=(), microphone=(), display-capture=()',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:5186; media-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'",
}

export default defineConfig({
  root: previewRoot,
  envDir: false,
  // Do not import ambient VITE_* values from the parent shell or production .env.
  envPrefix: 'VC_UI_PREVIEW_UNUSED_',
  define: {
    'import.meta.env.UI_PREVIEW_RUNDOWN': JSON.stringify(hasRundown),
    ...Object.fromEntries([
      'VITE_API_BASE_URL', 'VITE_SPOTIFY_CLIENT_ID', 'VITE_DISCORD_CLIENT_ID',
      'VITE_TELEGRAM_BOT_USERNAME', 'VITE_POSTHOG_PROJECT_TOKEN', 'VITE_POSTHOG_HOST',
      'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY',
    ].map((key) => [`import.meta.env.${key}`, JSON.stringify('')])),
    'import.meta.env.VITE_DEMO_MODE': 'undefined',
    'import.meta.env.VITE_AUTH_REQUIRED': 'undefined',
    'import.meta.env.VITE_OPERATOR_TIER': 'undefined',
    'import.meta.env': JSON.stringify({
      MODE: 'design-preview', DEV: true, PROD: false, SSR: false, BASE_URL: '/',
      UI_PREVIEW_RUNDOWN: hasRundown,
      VITE_API_BASE_URL: '', VITE_SPOTIFY_CLIENT_ID: '', VITE_DISCORD_CLIENT_ID: '',
      VITE_TELEGRAM_BOT_USERNAME: '', VITE_POSTHOG_PROJECT_TOKEN: '', VITE_POSTHOG_HOST: '',
      VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '',
    }),
  },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': sourceDirectory }, dedupe: ['react', 'react-dom', 'framer-motion'] },
  server: {
    host: '127.0.0.1', port: 5186, strictPort: true, headers,
    fs: { allow: [previewRoot, sourceDirectory, resolve(projectRoot, 'node_modules'), resolve(sourceRoot, 'node_modules')] },
  },
  preview: { host: '127.0.0.1', port: 5186, strictPort: true, headers },
  build: { outDir: resolve(previewRoot, 'dist'), emptyOutDir: true },
})
