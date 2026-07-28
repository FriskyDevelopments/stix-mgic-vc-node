import { serve } from '@hono/node-server'
import type { Server as HttpServer } from 'node:http'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp } from './app'
import { getServerEnv } from './env'
import { attachSignaling, SIGNALING_PATH } from './signaling'
import { setSignalingReady } from './sessions'
import { sweepEmptyRooms } from './rooms'

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

const server = serve(
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
          signalingPath: SIGNALING_PATH,
        },
      })
    )
  }
)

// The signaling plane rides the same listener as the API: browsers upgrade to WebSocket on
// SIGNALING_PATH, everything else stays HTTP. One port, one TLS terminator, one tunnel.
const signaling = attachSignaling(server as unknown as HttpServer)
setSignalingReady(signaling.ready)

// An abandoned room otherwise holds its id and its seats forever.
const sweeper = setInterval(() => {
  sweepEmptyRooms()
}, 60_000)
sweeper.unref?.()

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      scope: 'server',
      message: 'shutting down',
      data: { signal, connections: signaling.connectionCount() },
    })
  )
  clearInterval(sweeper)
  // Close signalling first so participants are told, rather than discovering it by timeout.
  await signaling.close()
  server.close(() => process.exit(0))
}

process.once('SIGTERM', (signal) => void shutdown(signal))
process.once('SIGINT', (signal) => void shutdown(signal))
