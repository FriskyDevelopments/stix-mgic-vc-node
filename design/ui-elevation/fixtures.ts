import type { SpotifyDevice, SpotifyPlaybackState, SpotifyTrack } from '@/lib/spotify'

export const SAMPLE_TOKEN = 'preview-only-no-account'

function artwork(background: string, accent: string, title: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><rect width="640" height="640" fill="${background}"/><circle cx="455" cy="235" r="236" fill="${accent}" opacity=".65"/><circle cx="255" cy="320" r="208" fill="none" stroke="#efe7d6" stroke-width="1.5" opacity=".65"/><circle cx="255" cy="320" r="158" fill="none" stroke="#efe7d6" stroke-width="1.5" opacity=".4"/><path d="M0 465L640 135V640H0Z" fill="#121e22" opacity=".4"/><text x="44" y="61" fill="#f5f2ec" font-family="sans-serif" font-size="14" letter-spacing="4">FRISKY STUDIO / SAMPLE</text><text x="42" y="544" fill="#f5f2ec" font-family="Georgia,serif" font-size="49">${title}</text><text x="45" y="585" fill="#f5f2ec" font-family="sans-serif" font-size="12" letter-spacing="3">DESIGN FIXTURE · NO AUDIO</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const tracks: SpotifyTrack[] = [
  ['0000000000000000000001', 'Afterglow Studies', '#3c554c', '#c7a981', 218000],
  ['0000000000000000000002', 'Slow Motion', '#554841', '#ddac85', 193000],
  ['0000000000000000000003', 'Blue Hour', '#284955', '#8ba5ad', 246000],
].map(([id, name, background, accent, duration]) => ({
  id: String(id), uri: `spotify:track:${id}`, name: String(name),
  artists: [{ name: 'Frisky Studio · sample' }],
  album: { name: 'Scenes for a Sunday', images: [{ url: artwork(String(background), String(accent), String(name)) }] },
  duration_ms: Number(duration), preview_url: null,
}))

const playlists = [
  { id: '0000000000000000000011', uri: 'spotify:playlist:0000000000000000000011', name: 'Sunday, unhurried', description: 'Sample music for the design preview', images: [], items: { total: 3 }, indexes: [0, 1, 2] },
  { id: '0000000000000000000012', uri: 'spotify:playlist:0000000000000000000012', name: 'After hours', description: 'Sample music for the design preview', images: [], items: { total: 2 }, indexes: [2, 0] },
]
let devices: SpotifyDevice[]
let trackIndex: number
let playing: boolean
let progress: number
let sampledAt: number
let contextUri: string | null
let queue: number[]
let installed = false

export function resetSamplePlayback() {
  devices = [
    { id: 'preview-studio-speakers', name: 'Studio speakers · sample', is_active: true, is_restricted: false, type: 'Computer', volume_percent: 42, supports_volume: true },
    { id: 'preview-headphones', name: 'Headphones · sample', is_active: false, is_restricted: false, type: 'Computer', volume_percent: 35, supports_volume: true },
  ]
  trackIndex = 0
  playing = true
  progress = 42000
  sampledAt = Date.now()
  contextUri = playlists[0].uri
  queue = [0, 1, 2]
}
resetSamplePlayback()

function sampleProgress() {
  progress = Math.min(tracks[trackIndex].duration_ms, progress + (playing ? Date.now() - sampledAt : 0))
  sampledAt = Date.now()
}

export function samplePlaybackSnapshot(): SpotifyPlaybackState {
  sampleProgress()
  return {
    item: tracks[trackIndex], is_playing: playing, progress_ms: progress,
    device: devices.find((device) => device.is_active),
    context: contextUri ? { uri: contextUri } : null, actions: { disallows: {} },
  }
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}
function accepted() { return new Response(null, { status: 204 }) }
function blocked() { return json({ error: { message: 'This request is disabled in the isolated design preview.' } }, 403) }

function announce(message: string) {
  window.dispatchEvent(new CustomEvent('vc-preview-notice', { detail: message }))
}

export function installPreviewFixtures() {
  if (installed) return
  installed = true

  // There is intentionally no reference to the original fetch and no forwarding path.
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const request = input instanceof Request ? input : null
    const url = new URL(request?.url ?? String(input), window.location.origin)
    const method = (init.method ?? request?.method ?? 'GET').toUpperCase()
    if (init.signal?.aborted || request?.signal.aborted) throw new DOMException('Aborted', 'AbortError')
    if (url.origin === window.location.origin && url.pathname === '/v1/config/public' && method === 'GET') {
      return json({
        discordClientId: null, telegramBotUsername: null, spotifyClientId: null,
        authRequired: true, mediaPlaneEnabled: false, friskydevEnabled: false,
        friskydevIdConfigured: false, supabaseIdentityConfigured: false,
        identityProvider: 'design-preview', identityReady: false,
      })
    }
    if (url.origin !== 'https://api.spotify.com' || !url.pathname.startsWith('/v1/')) return blocked()
    const headers = new Headers(init.headers ?? request?.headers)
    if (headers.get('Authorization') !== `Bearer ${SAMPLE_TOKEN}`) return blocked()
    const path = url.pathname.slice(3)
    let body: Record<string, unknown> = {}
    try {
      const raw = typeof init.body === 'string' ? init.body : request ? await request.clone().text() : ''
      if (raw) body = JSON.parse(raw)
    } catch { return json({ error: { message: 'Invalid preview fixture request.' } }, 400) }

    if (path === '/me/player' && method === 'GET') return json(samplePlaybackSnapshot())
    if (path === '/me/player/devices' && method === 'GET') return json({ devices })
    if (path === '/me/player/queue' && method === 'GET') return json({ currently_playing: tracks[trackIndex], queue: [] })
    if (path === '/me/playlists' && method === 'GET') return json({ items: playlists })
    if (path === '/search' && method === 'GET') {
      const query = (url.searchParams.get('q') ?? '').toLowerCase()
      return json({ tracks: { items: tracks.filter((track) => `${track.name} ${track.artists[0].name}`.toLowerCase().includes(query)) } })
    }
    const playlistMatch = path.match(/^\/playlists\/([A-Za-z0-9]{22})\/items$/)
    if (playlistMatch && method === 'GET') {
      const playlist = playlists.find((item) => item.id === playlistMatch[1])
      return playlist ? json({ items: playlist.indexes.map((index) => ({ item: tracks[index] })) }) : json({ error: { message: 'Unknown sample playlist.' } }, 404)
    }
    if (path === '/me/player' && method === 'PUT') {
      const deviceId = Array.isArray(body.device_ids) ? body.device_ids[0] : null
      if (!devices.some((device) => device.id === deviceId)) return blocked()
      sampleProgress()
      devices = devices.map((device) => ({ ...device, is_active: device.id === deviceId }))
      // A device choice preserves this fixture's prior playback state.
      if (body.play === true) playing = true
      return accepted()
    }

    const requestedDevice = url.searchParams.get('device_id')
    if (requestedDevice && !devices.some((device) => device.id === requestedDevice && device.is_active)) {
      return json({ error: { reason: 'NO_ACTIVE_DEVICE', message: 'Sample device is not active.' } }, 404)
    }
    if (path === '/me/player/play' && method === 'PUT') {
      sampleProgress()
      const uris = Array.isArray(body.uris) ? body.uris : []
      if (uris.length) {
        const indexes = uris.map((uri) => tracks.findIndex((track) => track.uri === uri))
        if (indexes.some((index) => index < 0)) return blocked()
        trackIndex = indexes[0]
        queue = indexes.length > 1 ? indexes : [0, 1, 2]
        contextUri = null
        progress = 0
      } else if (typeof body.context_uri === 'string') {
        const playlist = playlists.find((item) => item.uri === body.context_uri)
        if (!playlist) return blocked()
        queue = playlist.indexes
        trackIndex = queue[0]
        contextUri = playlist.uri
        progress = 0
      }
      playing = true
      return accepted()
    }
    if (path === '/me/player/pause' && method === 'PUT') { sampleProgress(); playing = false; return accepted() }
    if ((path === '/me/player/next' || path === '/me/player/previous') && method === 'POST') {
      const next = queue.indexOf(trackIndex) + (path.endsWith('/next') ? 1 : -1)
      trackIndex = queue[(next + queue.length) % queue.length]
      progress = 0
      sampledAt = Date.now()
      return accepted()
    }
    if (path === '/me/player/volume' && method === 'PUT') {
      const volume = Number(url.searchParams.get('volume_percent'))
      if (!Number.isFinite(volume)) return blocked()
      devices = devices.map((device) => device.is_active ? { ...device, volume_percent: Math.max(0, Math.min(100, Math.round(volume))) } : device)
      return accepted()
    }
    return blocked()
  }

  window.open = () => { announce('Account connections and external apps stay disabled in this design preview.'); return null }
  document.addEventListener('click', (event) => {
    const anchor = event.target instanceof Element ? event.target.closest('a') : null
    if (!anchor) return
    const url = new URL(anchor.href, window.location.href)
    if (url.href === 'https://vc.friskydev.com/') return
    if (url.origin !== window.location.origin || url.pathname !== '/') {
      event.preventDefault()
      announce('This link stays inside the design preview. No external app or account was opened.')
    }
  }, true)
}
