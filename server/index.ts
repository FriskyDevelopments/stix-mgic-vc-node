import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp } from './app'
import { getServerEnv } from './env'

const env = getServerEnv()
const app = createApp()
const port = Number(process.env.PORT || env.PORT)

if (env.NODE_ENV === 'production') {
  const distDir = resolve(process.cwd(), env.VITE_DIST_DIR)
  if (!existsSync(distDir)) {
    throw new Error(`Vite dist not found at ${distDir}. Run npm run build first.`)
  }

  const indexHtml = readFileSync(resolve(distDir, 'index.html'), 'utf8')

  app.use('/assets/*', serveStatic({ root: distDir }))
  app.get('*', (c) => {
    const path = c.req.path
    if (path.startsWith('/v1') || path === '/healthz') {
      return c.json({ error: 'Not found' }, 404)
    }
    return c.html(indexHtml)
  })
}

serve(
  {
    fetch: app.fetch,
    hostname: env.HOST,
    port,
  },
  (info) => {
    console.info(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        scope: 'server',
        message: 'STIX VC NODE control plane listening',
        data: {
          host: info.address,
          port: info.port,
          mode: env.NODE_ENV,
          authRequired: env.AUTH_REQUIRED,
          discordConfigured: env.discordConfigured,
          telegramConfigured: env.telegramConfigured,
          mediaPlaneEnabled: env.MEDIA_PLANE_ENABLED,
        },
      })
    )
  }
)
