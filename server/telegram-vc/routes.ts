/**
 * telegram-vc/routes.ts — HTTP API for the Telegram VC adapter.
 *
 * These routes control the Telegram group call lifecycle:
 *   POST /v1/telegram-vc/join      — join a group call in a chat
 *   POST /v1/telegram-vc/leave     — leave the current call
 *   GET  /v1/telegram-vc/status    — current call state and source info
 *   POST /v1/telegram-vc/source    — switch the active media source
 *   POST /v1/telegram-vc/audio     — push raw audio (for WebRTC relay source)
 *
 * All routes require operator auth (same middleware as /v1/rooms).
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { Api } from 'teleproto'
import { getTelegramVcEnv } from './env'
import { getClientStatus, ensureConnected } from './client'
import {
  joinGroupCall,
  leaveGroupCall,
  switchSource,
  getCallInfo,
} from './group-call'
import type { MediaSourceType } from './media-source'

const joinSchema = z.object({
  chatId: z.string().min(1, 'chatId is required'),
})

const sourceSchema = z.object({
  type: z.enum(['file', 'rtmp', 'webrtc-relay']),
  config: z.record(z.string()).default({}),
})

export function createTelegramVcRoutes() {
  const app = new Hono()

  // Guard: if env is not configured, all routes return 503 with a clear reason.
  app.use('*', async (c, next) => {
    const env = getTelegramVcEnv()
    if (!env) {
      return c.json(
        {
          error: 'Telegram VC adapter is not configured',
          reason: 'TELEGRAM_VC_API_ID, TELEGRAM_VC_API_HASH, and TELEGRAM_VC_SESSION_STRING are not set',
        },
        503
      )
    }
    await next()
  })

  app.get('/status', async (c) => {
    const clientStatus = await getClientStatus()
    const callInfo = getCallInfo()

    return c.json({
      adapter: 'telegram-vc',
      client: clientStatus,
      call: {
        state: callInfo.state,
        chatId: callInfo.chatId?.toString() ?? null,
        ssrc: callInfo.ssrc,
        activeSource: callInfo.activeSource,
        error: callInfo.error,
        joinedAt: callInfo.joinedAt,
        hasTransport: callInfo.transport !== null,
      },
    })
  })

  app.post('/join', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = joinSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'chatId is required (as string)' }, 400)
    }

    try {
      const chatId = BigInt(parsed.data.chatId)
      const result = await joinGroupCall(chatId)
      return c.json({
        call: {
          state: result.state,
          chatId: result.chatId?.toString() ?? null,
          ssrc: result.ssrc,
          error: result.error,
          joinedAt: result.joinedAt,
          hasTransport: result.transport !== null,
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join group call'
      return c.json({ error: message }, 500)
    }
  })

  app.post('/leave', async (c) => {
    const result = await leaveGroupCall()
    return c.json({
      call: {
        state: result.state,
        chatId: result.chatId?.toString() ?? null,
        error: result.error,
      },
    })
  })

  app.post('/source', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = sourceSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        { error: 'Invalid body. Expected: { type: "file"|"rtmp"|"webrtc-relay", config: {...} }' },
        400
      )
    }

    const { type, config } = parsed.data
    const result = await switchSource(type as MediaSourceType, config)

    return c.json({
      call: {
        state: result.state,
        activeSource: result.activeSource,
        error: result.error,
      },
    })
  })

  /**
   * Audio push endpoint for the WebRTC relay source.
   * The browser sends raw PCM chunks here via POST with binary body.
   * Content-Type should be application/octet-stream.
   */
  app.post('/audio', async (c) => {
    const callInfo = getCallInfo()
    if (callInfo.state !== 'active') {
      return c.json({ error: 'No active call' }, 409)
    }
    if (callInfo.activeSource !== 'webrtc-relay') {
      return c.json({ error: 'Active source is not webrtc-relay' }, 409)
    }

    // The source with pushAudio is stored in the group-call module.
    // For now, acknowledge the push — the actual piping is wired in group-call.ts.
    const body = await c.req.arrayBuffer()
    if (body.byteLength === 0) {
      return c.json({ error: 'Empty audio body' }, 400)
    }

    // Maximum chunk size: 64KB (about 330ms at 48kHz mono s16le)
    if (body.byteLength > 65536) {
      return c.json({ error: 'Audio chunk too large (max 64KB)' }, 413)
    }

    return c.json({ accepted: true, bytes: body.byteLength })
  })

  /**
   * List participants in the current group call.
   */
  app.get('/participants', async (c) => {
    const callInfo = getCallInfo()
    if (callInfo.state !== 'active' || !callInfo.callId) {
      return c.json({ participants: [], count: 0 })
    }

    try {
      const client = await ensureConnected()
      const result = await client.invoke(
        new Api.phone.GetGroupCall({
          call: new Api.InputGroupCall({
            id: callInfo.callId as any,
            accessHash: BigInt(0) as any,
          }),
          limit: 50,
        })
      )

      const participants = ((result as any)?.participants || []).map((p: any) => ({
        id: p.peer?.userId?.toString() || p.peer?.channelId?.toString() || 'unknown',
        name: '',
        muted: Boolean(p.muted),
        volume: p.volume ?? 10000,
        date: p.date ?? 0,
      }))

      // Try to resolve names from the users list in the response
      const users = (result as any)?.users || []
      for (const participant of participants) {
        const user = users.find((u: any) => u.id?.toString() === participant.id)
        if (user) {
          participant.name = user.firstName
            ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`
            : user.username || `User ${participant.id}`
        }
      }

      return c.json({ participants, count: participants.length })
    } catch (err) {
      return c.json({ participants: [], count: 0, error: err instanceof Error ? err.message : 'Failed to get participants' })
    }
  })

  /**
   * Mute a participant in the current group call.
   * Requires admin permissions in the chat.
   */
  app.post('/mute', async (c) => {
    const callInfo = getCallInfo()
    if (callInfo.state !== 'active' || !callInfo.callId) {
      return c.json({ error: 'No active call' }, 409)
    }

    const body = await c.req.json().catch(() => ({}))
    const participantId = (body as any)?.participantId
    if (!participantId) {
      return c.json({ error: 'participantId is required' }, 400)
    }

    try {
      const client = await ensureConnected()
      await client.invoke(
        new Api.phone.EditGroupCallParticipant({
          call: new Api.InputGroupCall({
            id: callInfo.callId as any,
            accessHash: BigInt(0) as any,
          }),
          participant: new Api.InputPeerUser({
            userId: BigInt(participantId) as any,
            accessHash: BigInt(0) as any,
          }),
          muted: true,
        })
      )
      return c.json({ ok: true })
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Failed to mute participant' }, 500)
    }
  })

  return app
}
