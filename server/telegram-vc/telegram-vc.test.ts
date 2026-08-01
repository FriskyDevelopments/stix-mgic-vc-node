/**
 * Tests for the Telegram VC adapter.
 *
 * These test the adapter's logic WITHOUT requiring a real Telegram connection:
 *   - Env parsing and validation
 *   - Media source creation and state management
 *   - Route responses when the adapter is not configured
 *   - Route responses with mocked call state
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getTelegramVcEnv, resetTelegramVcEnvCache } from './env'
import { createFileSource } from './sources/file-source'
import { createRtmpSource } from './sources/rtmp-source'
import { createWebRtcRelaySource } from './sources/webrtc-relay-source'
import { getCallInfo, resetGroupCall } from './group-call'

describe('Telegram VC env', () => {
  beforeEach(() => {
    resetTelegramVcEnvCache()
  })

  afterEach(() => {
    // Restore env
    delete process.env.TELEGRAM_VC_API_ID
    delete process.env.TELEGRAM_VC_API_HASH
    delete process.env.TELEGRAM_VC_SESSION_STRING
    delete process.env.TELEGRAM_VC_DEFAULT_CHAT_ID
    delete process.env.TELEGRAM_VC_FFMPEG_TIMEOUT_SECONDS
    resetTelegramVcEnvCache()
  })

  it('returns null when no env vars are set (adapter disabled)', () => {
    const env = getTelegramVcEnv()
    expect(env).toBeNull()
  })

  it('returns config when all required vars are set', () => {
    process.env.TELEGRAM_VC_API_ID = '12345'
    process.env.TELEGRAM_VC_API_HASH = 'abc123'
    process.env.TELEGRAM_VC_SESSION_STRING = 'session-data-here'
    resetTelegramVcEnvCache()

    const env = getTelegramVcEnv()
    expect(env).not.toBeNull()
    expect(env!.apiId).toBe(12345)
    expect(env!.apiHash).toBe('abc123')
    expect(env!.sessionString).toBe('session-data-here')
    expect(env!.defaultChatId).toBeNull()
    expect(env!.ffmpegTimeoutSeconds).toBe(300)
  })

  it('throws when vars are partially set', () => {
    process.env.TELEGRAM_VC_API_ID = '12345'
    // Missing API_HASH and SESSION_STRING
    resetTelegramVcEnvCache()

    expect(() => getTelegramVcEnv()).toThrow('must ALL be set or ALL be absent')
  })

  it('throws when API_ID is not a valid number', () => {
    process.env.TELEGRAM_VC_API_ID = 'not-a-number'
    process.env.TELEGRAM_VC_API_HASH = 'abc123'
    process.env.TELEGRAM_VC_SESSION_STRING = 'session-data-here'
    resetTelegramVcEnvCache()

    expect(() => getTelegramVcEnv()).toThrow('must be a positive integer')
  })

  it('parses optional DEFAULT_CHAT_ID as bigint', () => {
    process.env.TELEGRAM_VC_API_ID = '12345'
    process.env.TELEGRAM_VC_API_HASH = 'abc123'
    process.env.TELEGRAM_VC_SESSION_STRING = 'session-data-here'
    process.env.TELEGRAM_VC_DEFAULT_CHAT_ID = '9876543210'
    resetTelegramVcEnvCache()

    const env = getTelegramVcEnv()
    expect(env!.defaultChatId).toBe(BigInt('9876543210'))
  })

  it('parses custom ffmpeg timeout', () => {
    process.env.TELEGRAM_VC_API_ID = '12345'
    process.env.TELEGRAM_VC_API_HASH = 'abc123'
    process.env.TELEGRAM_VC_SESSION_STRING = 'session-data-here'
    process.env.TELEGRAM_VC_FFMPEG_TIMEOUT_SECONDS = '600'
    resetTelegramVcEnvCache()

    const env = getTelegramVcEnv()
    expect(env!.ffmpegTimeoutSeconds).toBe(600)
  })
})

describe('Group call state', () => {
  beforeEach(async () => {
    await resetGroupCall()
  })

  it('starts in idle state', () => {
    const info = getCallInfo()
    expect(info.state).toBe('idle')
    expect(info.chatId).toBeNull()
    expect(info.callId).toBeNull()
    expect(info.ssrc).toBeNull()
    expect(info.activeSource).toBeNull()
    expect(info.error).toBeNull()
  })
})

describe('File source', () => {
  it('errors on missing file', async () => {
    const source = createFileSource('/nonexistent/file.mp3')
    await expect(source.start()).rejects.toThrow('File not found')
    expect(source.state).toBe('error')
    expect(source.error).toContain('/nonexistent/file.mp3')
  })

  it('reports stats correctly when idle', () => {
    const source = createFileSource('/some/file.mp3')
    const stats = source.stats()
    expect(stats.type).toBe('file')
    expect(stats.state).toBe('idle')
    expect(stats.durationSeconds).toBe(0)
    expect(stats.ffmpegAlive).toBe(false)
  })

  it('can be stopped without starting', async () => {
    const source = createFileSource('/some/file.mp3')
    await source.stop()
    expect(source.state).toBe('stopped')
  })
})

describe('RTMP source', () => {
  it('rejects invalid URL scheme', async () => {
    const source = createRtmpSource('http://example.com/stream')
    await expect(source.start()).rejects.toThrow('Invalid scheme')
    expect(source.state).toBe('error')
  })

  it('rejects non-URL input', async () => {
    const source = createRtmpSource('not a url')
    await expect(source.start()).rejects.toThrow('Invalid RTMP URL')
    expect(source.state).toBe('error')
  })

  it('accepts rtmp:// scheme', () => {
    // We can't actually connect, but validation should pass
    const source = createRtmpSource('rtmp://relay.example.com:1935/live/key')
    expect(source.state).toBe('idle')
    expect(source.type).toBe('rtmp')
  })

  it('accepts rtmps:// scheme', () => {
    const source = createRtmpSource('rtmps://relay.example.com:1935/live/key')
    expect(source.state).toBe('idle')
    expect(source.type).toBe('rtmp')
  })

  it('rejects localhost in production', async () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const source = createRtmpSource('rtmp://localhost:1935/live/key')
      await expect(source.start()).rejects.toThrow('cannot target localhost')
    } finally {
      process.env.NODE_ENV = originalEnv
    }
  })

  it('allows localhost in development', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    try {
      const source = createRtmpSource('rtmp://localhost:1935/live/key')
      // Validation passes (start would fail on connect, but that's network-level)
      expect(source.state).toBe('idle')
    } finally {
      process.env.NODE_ENV = originalEnv
    }
  })
})

describe('WebRTC relay source', () => {
  it('errors on empty room ID', async () => {
    const source = createWebRtcRelaySource('')
    await expect(source.start()).rejects.toThrow('Room ID is required')
    expect(source.state).toBe('error')
  })

  it('reports correct type', () => {
    const source = createWebRtcRelaySource('room-123')
    expect(source.type).toBe('webrtc-relay')
    expect(source.state).toBe('idle')
  })

  it('pushAudio returns false when not active', () => {
    const source = createWebRtcRelaySource('room-123')
    expect(source.pushAudio(Buffer.from('data'))).toBe(false)
  })
})

describe('Telegram VC API routes (adapter disabled)', () => {
  let app: any

  beforeEach(async () => {
    // Ensure no env vars are set
    delete process.env.TELEGRAM_VC_API_ID
    delete process.env.TELEGRAM_VC_API_HASH
    delete process.env.TELEGRAM_VC_SESSION_STRING
    resetTelegramVcEnvCache()

    // Import and create the routes fresh
    const { createTelegramVcRoutes } = await import('./routes')
    app = createTelegramVcRoutes()
  })

  afterEach(() => {
    resetTelegramVcEnvCache()
  })

  it('GET /status returns 503 when not configured', async () => {
    const res = await app.request('/status')
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toContain('not configured')
  })

  it('POST /join returns 503 when not configured', async () => {
    const res = await app.request('/join', {
      method: 'POST',
      body: JSON.stringify({ chatId: '12345' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(503)
  })

  it('POST /leave returns 503 when not configured', async () => {
    const res = await app.request('/leave', { method: 'POST' })
    expect(res.status).toBe(503)
  })

  it('POST /source returns 503 when not configured', async () => {
    const res = await app.request('/source', {
      method: 'POST',
      body: JSON.stringify({ type: 'file', config: { path: '/test.mp3' } }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(503)
  })

  it('POST /audio returns 503 when not configured', async () => {
    const res = await app.request('/audio', {
      method: 'POST',
      body: new ArrayBuffer(100),
      headers: { 'Content-Type': 'application/octet-stream' },
    })
    expect(res.status).toBe(503)
  })
})

describe('Telegram VC API routes (adapter configured, no call)', () => {
  let app: any

  beforeEach(async () => {
    process.env.TELEGRAM_VC_API_ID = '12345'
    process.env.TELEGRAM_VC_API_HASH = 'abc123'
    process.env.TELEGRAM_VC_SESSION_STRING = 'session-data-here'
    resetTelegramVcEnvCache()
    await resetGroupCall()

    const { createTelegramVcRoutes } = await import('./routes')
    app = createTelegramVcRoutes()
  })

  afterEach(() => {
    delete process.env.TELEGRAM_VC_API_ID
    delete process.env.TELEGRAM_VC_API_HASH
    delete process.env.TELEGRAM_VC_SESSION_STRING
    resetTelegramVcEnvCache()
  })

  it('GET /status returns adapter info with idle call state', async () => {
    const res = await app.request('/status')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.adapter).toBe('telegram-vc')
    expect(body.call.state).toBe('idle')
  })

  it('POST /join returns 400 without chatId', async () => {
    const res = await app.request('/join', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(400)
  })

  it('POST /source returns error when not in a call', async () => {
    const res = await app.request('/source', {
      method: 'POST',
      body: JSON.stringify({ type: 'file', config: { path: '/test.mp3' } }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.call.error).toContain('not in a call')
  })

  it('POST /audio returns 409 when no active call', async () => {
    const res = await app.request('/audio', {
      method: 'POST',
      body: new ArrayBuffer(100),
      headers: { 'Content-Type': 'application/octet-stream' },
    })
    expect(res.status).toBe(409)
  })
})
