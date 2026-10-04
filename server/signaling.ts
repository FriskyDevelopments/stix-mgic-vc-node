/**
 * signaling.ts — Node `ws` adapter for the signaling hub (see signaling-core.ts).
 * The Cloudflare Worker build uses the same core via workers/nebu-app.ts.
 */
import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket as NodeWebSocket } from 'ws'
import {
  authenticateSignal,
  createSignalingHub,
  SIGNALING_PATH,
  type SignalingHub,
  type WebSocket as HubSocket,
} from './signaling-core'

export {
  CLOSE_FLOOD,
  CLOSE_ROOM_GONE,
  CLOSE_UNAUTHORIZED,
  SIGNALING_PATH,
  type ClientMessage,
  type SignalingHub,
} from './signaling-core'

const MAX_MESSAGE_BYTES = 64 * 1024

export function attachSignaling(server: Server): SignalingHub {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES })
  const hub = createSignalingHub()

  function onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== SIGNALING_PATH) return

    const identity = authenticateSignal(url, req.headers.cookie)
    if (!identity) {
      // Refuse before the handshake completes; an unauthenticated socket never exists.
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws: NodeWebSocket) => {
      hub.accept(ws as unknown as HubSocket, identity)
    })
  }

  server.on('upgrade', onUpgrade)

  return {
    ...hub,
    close: async () => {
      server.off('upgrade', onUpgrade)
      await hub.close()
      await new Promise<void>((resolve) => wss.close(() => resolve()))
    },
  }
}
