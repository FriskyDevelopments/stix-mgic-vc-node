import { DurableObject } from 'cloudflare:workers'
import { createApp } from '../server/app'
import { authenticateSignal, createSignalingHub, SIGNALING_PATH, type SignalingHub, type WebSocket as HubSocket } from '../server/signaling-core'
import { setSignalingReady } from '../server/sessions'
import { sweepEmptyRooms } from '../server/rooms'
import { configureNebuDatabase, resolveNebuSession } from '../server/betterAuth'
import { gateNebuSession } from '../server/nebu-gate'

/**
 * Worker + static assets + ONE Durable Object ("hub") — no Containers.
 * Static SPA (dist) is served by the assets binding. API (/v1/*, /healthz, /api/*, /l/*) and
 * the signalling WebSocket are routed to a single DO so rooms (in-memory) are shared by all
 * participants. Features that need a real OS (Telethon/ffmpeg/RTMP, fs persistence) are NOT available here.
 * Better Auth runs on the D1 binding `DB` (schema: migrations/0001_better_auth.sql).
 */
type HubEnv = { ASSETS: Fetcher; DB?: unknown } & Record<string, unknown>

/** Adapt a Workers WebSocket to the minimal surface signaling-core expects. */
function adapt(ws: WebSocket): HubSocket {
  const pongHandlers: Array<() => void> = []
  return {
    OPEN: 1,
    get readyState() { return ws.readyState },
    send: (d: string) => ws.send(d),
    close: (code?: number, reason?: string) => { try { ws.close(code, reason) } catch { /* already closed */ } },
    // Workers has no ws-level ping; the runtime reaps dead sockets. Treat as always alive.
    ping: () => { queueMicrotask(() => pongHandlers.forEach((h) => h())) },
    terminate: () => { try { ws.close(1011, 'terminated') } catch { /* noop */ } },
    on(event: string, handler: (arg?: never) => void) {
      if (event === 'pong') pongHandlers.push(handler as () => void)
      else if (event === 'message') ws.addEventListener('message', (e) => (handler as (r: { toString(): string }) => void)({ toString: () => (typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data as ArrayBuffer)) }))
      else if (event === 'close') ws.addEventListener('close', () => (handler as () => void)())
      else if (event === 'error') ws.addEventListener('error', () => (handler as () => void)())
    },
  } as HubSocket
}

export class NebuHub extends DurableObject {
  private app = createApp()
  private hub: SignalingHub = createSignalingHub()
  private lastSweep = 0

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never)
    setSignalingReady(true)
    // Better Auth runs on the D1 binding (MySQL/mysql2 cannot run on Workers).
    configureNebuDatabase((env as HubEnv).DB)
  }

  override async fetch(request: Request): Promise<Response> {
    const now = Date.now()
    if (now - this.lastSweep > 60_000) { this.lastSweep = now; sweepEmptyRooms() }
    const url = new URL(request.url)
    // AUTH_REQUIRED=true: POST /v1/rooms and the /v1/signal WebSocket need a Better Auth session (401 otherwise).
    const gate = await gateNebuSession(request)
    if (gate.denied) return gate.denied
    if (url.pathname === SIGNALING_PATH && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      let identity = authenticateSignal(url, request.headers.get('cookie') ?? undefined)
      if (gate.session) identity = { operatorId: `nebu:${gate.session.userId}`, operatorName: gate.session.name }
      else if (!url.searchParams.get('token')) {
        const nebu = await resolveNebuSession(request.headers)
        if (nebu) identity = { operatorId: `nebu:${nebu.userId}`, operatorName: nebu.name }
      }
      if (!identity) return new Response('Unauthorized', { status: 401 })
      const pair = new WebSocketPair()
      const [client, server] = [pair[0], pair[1]]
      server.accept()
      this.hub.accept(adapt(server), identity)
      return new Response(null, { status: 101, webSocket: client })
    }
    return this.app.fetch(request)
  }
}

export default {
  async fetch(request: Request, env: { HUB: DurableObjectNamespace; ASSETS: Fetcher }): Promise<Response> {
    const url = new URL(request.url)
    const p = url.pathname
    if (p === '/cf/ready') return Response.json({ ok: true, runtime: 'workers-do', worker: 'nebu-app' })
    if (p.startsWith('/v1/') || p === '/v1' || p === '/healthz' || p.startsWith('/api/') || p.startsWith('/l/')) {
      return env.HUB.get(env.HUB.idFromName('nebu')).fetch(request)
    }
    return env.ASSETS.fetch(request)
  },
}
