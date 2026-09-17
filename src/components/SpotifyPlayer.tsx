import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, ExternalLink, Headphones, LoaderCircle, MonitorSpeaker, Music2, Pause, Play, RefreshCw, SkipBack, SkipForward, Volume2 } from 'lucide-react'
import { usePublicConfig } from '@/lib/public-config'
import { SpotifyLibrary } from '@/components/SpotifyLibrary'
import { playSpotifySelection } from '@/lib/spotify-library'
import {
  formatDuration, getSpotifyDevices, getSpotifyPlayback, initiateSpotifyAuth,
  isSpotifyConfigured, SpotifyPlayerError, spotifyNext, spotifyPause, spotifyPlay,
  spotifyPrevious, spotifySetVolume, spotifyTransferPlayback,
  type SpotifyDevice, type SpotifyPlaybackState,
} from '@/lib/spotify'
import '@/styles/spotify-player.css'

// Adapted from csozidev's MIT Spotify music card on Uiverse.
// https://uiverse.io/csozidev/rare-quail-42 — full notice in licenses/uiverse-spotify-player.txt.
type Props = {
  accessToken: string | null
  onDisconnect: () => void
  onPlaybackChange?: (state: SpotifyPlaybackState | null) => void
}

type PlaybackCheck = (state: SpotifyPlaybackState | null) => boolean
type TransferTarget = { id: string; name: string; waiting: boolean }
const READBACK_DELAYS = [300, 500, 800]
const TRANSFER_CONFIRM_TIMEOUT = 5_000

export function SpotifyPlayer({ accessToken: token, onDisconnect, onPlaybackChange }: Props) {
  const publicConfig = usePublicConfig()
  const id = useId()
  const [playback, setPlayback] = useState<SpotifyPlaybackState | null>(null)
  const [devices, setDevices] = useState<SpotifyDevice[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [transferTarget, setTransferTarget] = useState<TransferTarget | null>(null)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [issue, setIssue] = useState<SpotifyPlayerError | null>(null)
  const [volume, setVolume] = useState(50)
  const [position, setPosition] = useState(0)
  const tokenRef = useRef(token)
  const playbackCallbackRef = useRef(onPlaybackChange)
  const busyRef = useRef(false)
  const refreshing = useRef(false)
  const refreshVersion = useRef(0)
  const readbackVersion = useRef(0)
  const readbackTimer = useRef<number | null>(null)
  const transferDeadline = useRef<number | null>(null)
  const transferTargetRef = useRef<TransferTarget | null>(null)
  const nextPollAt = useRef(0)
  const volumeDraft = useRef(false)
  const lastVolumeSent = useRef<number | null>(null)
  const progressSample = useRef({ position: 0, receivedAt: 0 })
  tokenRef.current = token
  playbackCallbackRef.current = onPlaybackChange

  useEffect(() => { playbackCallbackRef.current?.(playback) }, [playback])

  const updateTransfer = useCallback((next: TransferTarget | null) => {
    transferTargetRef.current = next
    setTransferTarget(next)
    if (!next?.waiting && transferDeadline.current !== null) {
      window.clearTimeout(transferDeadline.current)
      transferDeadline.current = null
    }
  }, [])

  useEffect(() => {
    setSelectedId((current) => devices.some((device) => device.id === current)
      ? current : devices.find((device) => device.id && device.is_active && !device.is_restricted)?.id
        || devices.find((device) => device.id && !device.is_restricted)?.id || '')
  }, [devices])

  const invalidateRefresh = useCallback(() => {
    refreshVersion.current++
    readbackVersion.current++
    if (readbackTimer.current !== null) window.clearTimeout(readbackTimer.current)
    if (transferDeadline.current !== null) window.clearTimeout(transferDeadline.current)
    readbackTimer.current = null
    transferDeadline.current = null
    refreshing.current = false
    setChecking(false)
  }, [])

  const reportIssue = useCallback((error: unknown) => {
    // A read started before an action/session failure must not clear its backoff.
    invalidateRefresh()
    if (transferTargetRef.current) updateTransfer({ ...transferTargetRef.current, waiting: false })
    const next = error instanceof SpotifyPlayerError ? error : new SpotifyPlayerError('unavailable', 'Could not reach Spotify. Check your connection and try again.')
    setIssue(next)
    nextPollAt.current = next.kind === 'expired' ? Infinity : Date.now() + Math.max(next.retryAfterMs, 15_000)
    if (next.kind === 'no-device') {
      setPlayback(null)
      setDevices((current) => current.map((device) => ({ ...device, is_active: false })))
    }
  }, [invalidateRefresh, updateTransfer])

  const refresh = useCallback(async (currentToken: string, manual = false, playbackOnly = false): Promise<SpotifyPlaybackState | null | undefined> => {
    if (tokenRef.current !== currentToken || (!manual && (refreshing.current || busyRef.current || Date.now() < nextPollAt.current))) return
    // A post-command read supersedes any poll already in flight.
    const request = ++refreshVersion.current
    refreshing.current = true
    setChecking(true)
    try {
      const [state, available] = await Promise.all([getSpotifyPlayback(currentToken), playbackOnly ? null : getSpotifyDevices(currentToken)])
      if (tokenRef.current !== currentToken || request !== refreshVersion.current) return
      setPlayback(state)
      const active = state?.device
      // Playback is the confirmed source for active flags and device metadata;
      // discovery can lag behind it, including after a transfer in Spotify itself.
      setDevices((current) => {
        const reconciled = (available ?? current).map((device) => device.id && device.id === active?.id
          ? { ...device, ...active } : { ...device, is_active: false })
        if (active?.id && !reconciled.some((device) => device.id === active.id)) reconciled.push(active)
        return reconciled
      })
      if (active?.is_active && active.id === transferTargetRef.current?.id) updateTransfer(null)
      if (!volumeDraft.current) setVolume(active?.volume_percent ?? 50)
      progressSample.current = { position: state?.progress_ms ?? 0, receivedAt: Date.now() }
      setPosition(state?.progress_ms ?? 0)
      setIssue(null)
      // Backoff applies only to failures. A success deadline combined with an
      // interval skipped every other poll whenever a response took nonzero time.
      nextPollAt.current = 0
      return state
    } catch (error) {
      if (tokenRef.current === currentToken && request === refreshVersion.current) reportIssue(error)
    } finally {
      if (request === refreshVersion.current) {
        refreshing.current = false
        setChecking(false)
      }
    }
  }, [reportIssue, updateTransfer])

  useEffect(() => {
    // The parent owns the session. Replacing or clearing its token invalidates
    // all device state and resets any backoff from the previous connection.
    invalidateRefresh()
    setPlayback(null)
    setDevices([])
    setSelectedId('')
    updateTransfer(null)
    setIssue(null)
    setPosition(0)
    volumeDraft.current = false
    lastVolumeSent.current = null
    nextPollAt.current = 0
    if (!token) return
    void refresh(token)
    const poll = () => { if (document.visibilityState !== 'hidden' && readbackTimer.current === null) void refresh(token, false, true) }
    const timer = window.setInterval(poll, 2_000)
    window.addEventListener('focus', poll)
    return () => {
      refreshVersion.current++
      readbackVersion.current++
      if (readbackTimer.current !== null) window.clearTimeout(readbackTimer.current)
      if (transferDeadline.current !== null) window.clearTimeout(transferDeadline.current)
      readbackTimer.current = null
      transferDeadline.current = null
      refreshing.current = false
      window.clearInterval(timer)
      window.removeEventListener('focus', poll)
    }
  }, [token, refresh, invalidateRefresh, updateTransfer])

  useEffect(() => {
    if (!playback?.is_playing || !playback.item) return
    const duration = playback.item.duration_ms
    const timer = window.setInterval(() => setPosition(Math.min(duration, progressSample.current.position + Date.now() - progressSample.current.receivedAt)), 1_000)
    return () => window.clearInterval(timer)
  }, [playback])

  const activeDevice = playback?.device?.is_active ? playback.device : devices.find((device) => device.is_active)
  const selectedDevice = devices.find((device) => device.id === selectedId)
  const controllable = Boolean(token && activeDevice?.id && !activeDevice.is_restricted && !issue && !transferTarget)
  const canControl = controllable && !busy
  const canTransfer = Boolean(token && selectedDevice?.id && !selectedDevice.is_restricted && (selectedDevice.id !== activeDevice?.id || transferTarget) && !transferTarget?.waiting && !busy && !checking && issue?.kind !== 'expired' && issue?.kind !== 'premium' && issue?.kind !== 'rate-limit')
  const track = playback?.item
  const image = track?.album?.images?.[0]?.url
  const disallows = playback?.actions?.disallows
  const isPlaying = Boolean(playback?.is_playing)
  const volumeSupported = activeDevice?.supports_volume !== false && activeDevice?.volume_percent != null

  async function connect() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try { await initiateSpotifyAuth() } catch (error) {
      setIssue(new SpotifyPlayerError('unavailable', error instanceof Error ? error.message : 'Could not connect to Spotify. Try again.'))
    } finally { busyRef.current = false; setBusy(false) }
  }

  function scheduleReadback(currentToken: string, confirmed: PlaybackCheck) {
    const version = readbackVersion.current
    let attempt = 0
    const check = async () => {
      readbackTimer.current = null
      if (tokenRef.current !== currentToken || version !== readbackVersion.current) return
      const state = await refresh(currentToken, true, true)
      if (version !== readbackVersion.current || state === undefined || confirmed(state)) return
      attempt++
      if (attempt < READBACK_DELAYS.length) readbackTimer.current = window.setTimeout(() => void check(), READBACK_DELAYS[attempt])
      else if (transferTargetRef.current) updateTransfer({ ...transferTargetRef.current, waiting: false })
    }
    readbackTimer.current = window.setTimeout(() => void check(), READBACK_DELAYS[0])
  }

  async function action(run: (accessToken: string) => Promise<void>, transfer = false, confirmed?: PlaybackCheck): Promise<boolean> {
    if (!token || busyRef.current || (!transfer && (!controllable || transferTargetRef.current))) return false
    const currentToken = token
    invalidateRefresh()
    const version = readbackVersion.current
    busyRef.current = true
    setBusy(true)
    try {
      await run(currentToken)
      if (tokenRef.current !== currentToken || version !== readbackVersion.current) return false
      setIssue(null)
      nextPollAt.current = 0
      const readBack = async () => {
        const state = await refresh(currentToken, true, Boolean(confirmed))
        if (confirmed && state !== undefined && version === readbackVersion.current && !confirmed(state)) scheduleReadback(currentToken, confirmed)
      }
      if (transfer) {
        // Release the command lock while confirmation runs. The transfer target
        // still blocks playback, and its deadline keeps a stalled read recoverable.
        transferDeadline.current = window.setTimeout(() => {
          if (tokenRef.current !== currentToken || version !== readbackVersion.current) return
          invalidateRefresh()
          if (transferTargetRef.current) updateTransfer({ ...transferTargetRef.current, waiting: false })
        }, TRANSFER_CONFIRM_TIMEOUT)
        void readBack()
      } else await readBack()
      return true
    } catch (error) {
      if (tokenRef.current === currentToken && version === readbackVersion.current) reportIssue(error)
      return false
    } finally { busyRef.current = false; setBusy(false) }
  }

  function commitVolume(value: number) {
    volumeDraft.current = false
    if (!canControl || !volumeSupported || lastVolumeSent.current === value) return
    lastVolumeSent.current = value
    void action(async (accessToken) => {
      try { await spotifySetVolume(accessToken, value, activeDevice!.id!) }
      finally { lastVolumeSent.current = null }
    })
  }

  function disconnect() {
    tokenRef.current = null
    onDisconnect()
  }

  return (
    <section className="spotify-player" aria-labelledby={`${id}-heading`}>
      <div className="spotify-player__header">
        <div className="spotify-player__brand"><Music2 size={19} aria-hidden="true" /><h2 id={`${id}-heading`}>Spotify</h2></div>
        <span className={`spotify-player__badge ${token ? 'is-connected' : ''}`}><span />{token ? 'Connected' : 'Personal player'}</span>
      </div>

      <div className="spotify-player__top">
        <div className="spotify-player__art">
          {image ? <img src={image} alt={`${track.name} album artwork`} /> : <Headphones size={34} strokeWidth={1.4} aria-hidden="true" />}
          {isPlaying && <div className="spotify-player__playing" aria-hidden="true">{[1, 2, 3, 4, 5].map((line) => <i key={line} />)}</div>}
        </div>
        <div className="spotify-player__track">
          <p className="spotify-player__eyebrow">{isPlaying ? 'Now playing' : token ? 'Your listening space' : 'Set the mood'}</p>
          <h3>{track?.name || (token ? 'Choose where to listen' : 'Your music, within reach.')}</h3>
          <p className="spotify-player__artist">{track?.artists?.map((artist) => artist.name).join(', ') || (token ? 'Open Spotify to make a device available.' : 'Connect Spotify and control your devices here.')}</p>
          {activeDevice && <p className="spotify-player__active-device"><MonitorSpeaker size={12} aria-hidden="true" />{activeDevice.name}</p>}
        </div>
      </div>

      {token ? <>
        <div className="spotify-player__timeline">
          <progress aria-label="Track progress" max={track?.duration_ms || 1} value={track ? position : 0} />
          <div><span>{track ? formatDuration(position) : '—:—'}</span><span>{track ? formatDuration(track.duration_ms) : '—:—'}</span></div>
        </div>
        <div className="spotify-player__controls">
          <button type="button" className="spotify-player__icon" aria-label="Previous track" disabled={!canControl || !track || disallows?.skipping_prev} onClick={() => void action((accessToken) => spotifyPrevious(accessToken, activeDevice!.id!), false, (state) => Boolean(state?.item && (state.item.uri !== track?.uri || (state.progress_ms !== null && state.progress_ms < position - 1_000))))}><SkipBack size={20} fill="currentColor" /></button>
          <button type="button" className="spotify-player__play" aria-label={isPlaying ? 'Pause Spotify' : 'Play Spotify'} disabled={!canControl || (isPlaying ? disallows?.pausing : disallows?.resuming)} onClick={() => void action((accessToken) => (isPlaying ? spotifyPause : spotifyPlay)(accessToken, activeDevice!.id!), false, (state) => Boolean(state && state.is_playing === !isPlaying))}>
            {busy ? <LoaderCircle size={24} className="spotify-player__spinner" /> : isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
          </button>
          <button type="button" className="spotify-player__icon" aria-label="Next track" disabled={!canControl || !track || disallows?.skipping_next} onClick={() => void action((accessToken) => spotifyNext(accessToken, activeDevice!.id!), false, (state) => Boolean(state?.item && (state.item.uri !== track?.uri || (state.progress_ms !== null && state.progress_ms < position - 1_000))))}><SkipForward size={20} fill="currentColor" /></button>
        </div>
        <div className="spotify-player__volume">
          <Volume2 size={16} aria-hidden="true" />
          <label className="sr-only" htmlFor={`${id}-volume`}>Spotify volume</label>
          <input id={`${id}-volume`} type="range" min={0} max={100} value={volume} disabled={!canControl || !volumeSupported} aria-valuetext={`${volume}%`} onChange={(event) => { volumeDraft.current = true; setVolume(Number(event.target.value)) }} onPointerUp={(event) => commitVolume(Number(event.currentTarget.value))} onKeyUp={(event) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) commitVolume(Number(event.currentTarget.value)) }} onBlur={(event) => { if (volumeDraft.current) commitVolume(Number(event.currentTarget.value)) }} />
          <span>{volumeSupported ? `${volume}%` : '—'}</span>
        </div>
        {activeDevice && !volumeSupported && <p className="spotify-player__hint">Adjust volume on {activeDevice.name}.</p>}

        <SpotifyLibrary key={token} token={token} deviceName={activeDevice?.name} canPlay={canControl} busy={busy}
          onPlay={(selection) => action((accessToken) => playSpotifySelection(accessToken, selection, activeDevice!.id!), false, (state) => Boolean(state?.is_playing && (selection.kind === 'track' ? state.item?.uri === selection.uri : state.context?.uri === selection.uri)))}
          onReconnect={() => void connect()} onSessionError={reportIssue} />

        <div className="spotify-player__device-panel">
          <div className="spotify-player__device-heading"><label htmlFor={`${id}-device`}><MonitorSpeaker size={15} aria-hidden="true" />Listening device</label><button type="button" className="spotify-player__text-button" onClick={() => { if (token) void refresh(token, true) }} disabled={checking || busy || transferTarget?.waiting || issue?.kind === 'rate-limit' || issue?.kind === 'expired'}><RefreshCw size={13} className={checking ? 'spotify-player__spinner' : ''} />Refresh</button></div>
          <div className="spotify-player__device-row">
            <div className="spotify-player__select"><select id={`${id}-device`} value={selectedId} disabled={busy || transferTarget?.waiting || devices.length === 0} onChange={(event) => setSelectedId(event.target.value)}><option value="" disabled>{checking ? 'Finding your devices…' : 'No devices available'}</option>{devices.map((device, index) => <option key={device.id || `unavailable-${index}`} value={device.id || `unavailable-${index}`} disabled={!device.id || device.is_restricted}>{device.name}{device.is_restricted ? ' · unavailable' : device.is_active ? ' · active' : ''}</option>)}</select><ChevronDown size={15} aria-hidden="true" /></div>
            <button type="button" className="spotify-player__device-button" disabled={!canTransfer || disallows?.transferring_playback} onClick={() => {
              if (!selectedDevice?.id || !canTransfer) return
              const deviceId = selectedDevice.id
              updateTransfer({ id: deviceId, name: selectedDevice.name, waiting: true })
              void action((accessToken) => spotifyTransferPlayback(accessToken, selectedDevice), true, (state) => Boolean(state?.device?.is_active && state.device.id === deviceId))
            }}>{transferTarget?.waiting ? 'Switching…' : !transferTarget && selectedId && selectedId === activeDevice?.id ? <><Check size={14} />Active</> : 'Use device'}</button>
          </div>
          {transferTarget && !issue && <p className="spotify-player__hint" role="status">{transferTarget.waiting ? `Waiting for Spotify to confirm ${transferTarget.name}…` : `Spotify has not confirmed ${transferTarget.name}. Refresh or use the device again.`}</p>}
          {!activeDevice && !issue && <p className="spotify-player__hint">Open Spotify on your phone or computer, then refresh and choose a device.</p>}
          {activeDevice?.is_restricted && !issue && <p className="spotify-player__hint">This device cannot be controlled here. Choose another device.</p>}
        </div>
      </> : <button type="button" className="spotify-player__connect" disabled={busy || (Boolean(publicConfig) && !isSpotifyConfigured())} onClick={() => void connect()}>{busy ? <LoaderCircle size={18} className="spotify-player__spinner" /> : <Music2 size={18} />}{busy ? 'Connecting…' : 'Connect Spotify'}</button>}

      {issue && <div className="spotify-player__notice" role="status"><p>{issue.message}</p>{issue.kind === 'expired' && <button type="button" className="spotify-player__text-button" disabled={busy} onClick={() => void connect()}>Reconnect Spotify</button>}</div>}
      {!token && publicConfig && !isSpotifyConfigured() && <p className="spotify-player__hint">Spotify connection is not enabled on this node yet.</p>}
      <div className="spotify-player__footer"><a href="https://open.spotify.com" target="_blank" rel="noopener noreferrer">Open Spotify <ExternalLink size={12} aria-hidden="true" /></a>{token ? <button type="button" onClick={disconnect}>Disconnect</button> : <span>Playback controls require Premium</span>}</div>
    </section>
  )
}
