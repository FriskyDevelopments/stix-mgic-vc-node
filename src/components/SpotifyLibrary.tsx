import { useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, Check, ListMusic, LoaderCircle, Music2, Play, Search } from 'lucide-react'
import { formatDuration, SpotifyPlayerError, type SpotifyTrack } from '@/lib/spotify'
import {
  getSpotifyPlaylists, getSpotifyPlaylistTracks, searchSpotifyTracks,
  type SpotifyLibraryPlaylist, type SpotifySelection,
} from '@/lib/spotify-library'

type Props = {
  token: string
  deviceName?: string
  canPlay: boolean
  busy: boolean
  onPlay: (selection: SpotifySelection) => Promise<boolean>
  onReconnect: () => void
  onSessionError?: (error: SpotifyPlayerError) => void
}

/** Choose first, then execute on the named device; browsing never starts playback. */
export function SpotifyLibrary({ token, deviceName, canPlay, busy, onPlay, onReconnect, onSessionError }: Props) {
  const id = useId()
  const [tab, setTab] = useState<'search' | 'playlists'>('search')
  const [query, setQuery] = useState('')
  const [tracks, setTracks] = useState<SpotifyTrack[]>([])
  const [playlists, setPlaylists] = useState<SpotifyLibraryPlaylist[]>([])
  const [playlist, setPlaylist] = useState<SpotifyLibraryPlaylist | null>(null)
  const [selection, setSelection] = useState<SpotifySelection | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [cooldown, setCooldown] = useState(false)
  const [result, setResult] = useState('')
  const version = useRef(0)
  const actionPending = useRef(false)

  useEffect(() => () => { version.current++ }, [token])
  useEffect(() => {
    if (!(error instanceof SpotifyPlayerError) || error.kind !== 'rate-limit') { setCooldown(false); return }
    setCooldown(true)
    const timer = window.setTimeout(() => setCooldown(false), Math.max(error.retryAfterMs, 1000))
    return () => window.clearTimeout(timer)
  }, [error])

  async function load(run: () => Promise<SpotifyTrack[] | SpotifyLibraryPlaylist[]>, kind: 'tracks' | 'playlists') {
    const request = ++version.current
    setLoading(true)
    setLoaded(false)
    setError(null)
    setTracks([])
    setPlaylists([])
    setSelection(null)
    setResult('')
    try {
      const items = await run()
      if (request !== version.current) return
      if (kind === 'tracks') setTracks(items as SpotifyTrack[])
      else setPlaylists(items as SpotifyLibraryPlaylist[])
      setLoaded(true)
    } catch (failure) {
      if (request === version.current) {
        setError(failure instanceof Error ? failure : new Error('Could not load your music. Try again.'))
        if (failure instanceof SpotifyPlayerError && (failure.kind === 'expired' || failure.kind === 'rate-limit')) onSessionError?.(failure)
      }
    } finally { if (request === version.current) setLoading(false) }
  }

  function changeTab(next: 'search' | 'playlists') {
    version.current++
    setTab(next)
    setPlaylist(null)
    setSelection(null)
    setTracks([])
    setPlaylists([])
    setLoaded(false)
    setLoading(false)
    setResult('')
    if (next === 'playlists') void load(() => getSpotifyPlaylists(token), 'playlists')
  }

  function choose(next: SpotifySelection) { setSelection(next); setResult('') }

  async function play() {
    if (!selection || !canPlay || blocked || actionPending.current) return
    const request = version.current
    actionPending.current = true
    setResult('')
    try {
      const accepted = await onPlay(selection)
      if (request === version.current && accepted) setResult(`Playback requested for ${selection.name} on ${deviceName}.`)
    } finally { actionPending.current = false }
  }

  const expired = error instanceof SpotifyPlayerError && error.kind === 'expired'
  const blocked = busy || cooldown || expired
  return <div className="spotify-library" aria-labelledby={`${id}-heading`}>
    <div className="spotify-library__heading"><h3 id={`${id}-heading`}>Choose your music</h3><span>Browse · select · play</span></div>
    <div className="spotify-library__tabs" aria-label="Music library">
      <button type="button" aria-pressed={tab === 'search'} disabled={blocked} onClick={() => changeTab('search')}><Search size={14} />Search songs</button>
      <button type="button" aria-pressed={tab === 'playlists'} disabled={blocked} onClick={() => changeTab('playlists')}><ListMusic size={15} />Your playlists</button>
    </div>
    {tab === 'search' && <form className="spotify-library__search" onSubmit={event => {
      event.preventDefault()
      if (query.trim() && !blocked) void load(() => searchSpotifyTracks(token, query.trim()), 'tracks')
    }}>
      <label className="sr-only" htmlFor={`${id}-query`}>Song or artist</label>
      <input id={`${id}-query`} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Song or artist" autoComplete="off" disabled={blocked} />
      <button type="submit" aria-label="Search Spotify" disabled={!query.trim() || blocked}><Search size={16} /></button>
    </form>}
    {playlist && <div className="spotify-library__playlist">
      <button type="button" className="spotify-player__text-button" disabled={blocked} onClick={() => changeTab('playlists')}><ArrowLeft size={14} />All playlists</button>
      <h4>{playlist.name}</h4>
      <button type="button" className="spotify-library__playlist-choice" aria-pressed={selection?.uri === playlist.uri} disabled={blocked} onClick={() => choose({ kind: 'playlist', uri: playlist.uri, name: playlist.name })}><ListMusic size={15} />Choose this playlist</button>
    </div>}
    {loading && <p className="spotify-library__message" aria-live="polite"><LoaderCircle size={15} className="spotify-player__spinner" />Loading music…</p>}
    {error && <div className="spotify-player__notice" role="alert"><p>{error.message}</p>{expired && !onSessionError && <button type="button" className="spotify-player__text-button" disabled={busy} onClick={onReconnect}>Reconnect Spotify</button>}</div>}
    {!loading && !error && loaded && tracks.length === 0 && playlists.length === 0 && <p className="spotify-library__message">{tab === 'search' ? 'No songs found. Try another song or artist.' : playlist ? 'No playable songs are available in this playlist.' : 'No playlists available for this account.'}</p>}
    {tracks.length > 0 && <ul className="spotify-library__results" aria-label="Songs">{tracks.map((track, index) => <li key={`${track.uri}-${index}`}>
      <button type="button" className="spotify-library__item" aria-pressed={selection?.uri === track.uri} disabled={busy} onClick={() => choose({ kind: 'track', uri: track.uri, name: track.name })}>
        <span className="spotify-library__art">{track.album.images?.[0]?.url ? <img src={track.album.images[0].url} alt="" loading="lazy" /> : <Music2 size={19} />}</span>
        <span className="spotify-library__title"><strong>{track.name}</strong><span>{track.artists.map(artist => artist.name).join(', ')}</span></span>
        <span className="spotify-library__duration">{selection?.uri === track.uri ? <Check size={16} aria-label="Selected" /> : formatDuration(track.duration_ms)}</span>
      </button>
    </li>)}</ul>}
    {playlists.length > 0 && <ul className="spotify-library__results" aria-label="Playlists">{playlists.map(item => <li key={item.id}>
      <button type="button" className="spotify-library__item" disabled={busy} onClick={() => {
        setPlaylist(item)
        void load(() => getSpotifyPlaylistTracks(token, item.id), 'tracks')
      }}><span className="spotify-library__art">{item.images?.[0]?.url ? <img src={item.images[0].url} alt="" loading="lazy" /> : <ListMusic size={19} />}</span><span className="spotify-library__title"><strong>{item.name}</strong><span>Choose playlist or browse songs</span></span></button>
    </li>)}</ul>}
    {selection && <div className="spotify-library__selection">
      <div><span>Selected {selection.kind === 'track' ? 'song' : 'playlist'}</span><strong>{selection.name}</strong></div>
      <button type="button" className="spotify-player__connect" disabled={!canPlay || blocked} onClick={() => void play()}>{busy ? <LoaderCircle size={16} className="spotify-player__spinner" /> : <Play size={16} />}Play {selection.kind === 'track' ? 'song' : 'playlist'}{deviceName ? ` on ${deviceName}` : ''}</button>
      {!canPlay && !busy && <p className="spotify-player__hint">Choose an available listening device below to play your selection.</p>}
    </div>}
    {result && <p className="spotify-library__message" role="status">{result}</p>}
  </div>
}
