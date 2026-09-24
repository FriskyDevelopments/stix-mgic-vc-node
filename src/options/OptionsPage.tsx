import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { aurasContent } from './modes/auras'
import { orbitContent, type NowPlaying } from './modes/orbit'
import { showcaseContent } from './modes/showcase'
import { persistMode, resolveMode, type OptionsMode } from './mode'
import { CaptchaGate } from './CaptchaGate'
import { DiscFormation } from './DiscFormation'
import { ModeSwitch } from './ModeSwitch'
import { MovingBackground } from './MovingBackground'
import { useSpotifySession } from '@/hooks/use-spotify-session'
import { getSpotifyPlayback } from '@/lib/spotify'
import type { ModeContent } from './discs'
import './options.css'

function contentFor(mode: OptionsMode, nowPlaying: NowPlaying | null): ModeContent {
  if (mode === 'auras') return aurasContent()
  if (mode === 'showcase') return showcaseContent()
  return orbitContent(nowPlaying)
}

export function OptionsPage(): React.ReactElement {
  const [mode, setMode] = useState<OptionsMode>(() =>
    typeof window === 'undefined' ? 'orbit' : resolveMode(window.location.search, window.localStorage),
  )
  const [verified, setVerified] = useState(false)
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null)
  const { accessToken } = useSpotifySession()

  useEffect(() => {
    if (!accessToken) {
      setNowPlaying(null)
      return
    }
    let cancelled = false
    getSpotifyPlayback(accessToken).then((playback) => {
      if (cancelled) return
      const track = playback?.item
      const imageUrl = track?.album?.images?.[0]?.url
      if (track && imageUrl) {
        setNowPlaying({
          title: track.name,
          subtitle: track.artists.map((a) => a.name).join(', '),
          imageUrl,
        })
      } else {
        setNowPlaying(null)
      }
    }).catch(() => {
      if (!cancelled) setNowPlaying(null)
    })
    return () => { cancelled = true }
  }, [accessToken])

  const content = useMemo(() => contentFor(mode, nowPlaying), [mode, nowPlaying])

  const changeMode = (next: OptionsMode) => {
    if (next === mode) return
    setMode(next)
    setVerified(false)
    try {
      persistMode(window.localStorage, next)
      const url = new URL(window.location.href)
      url.searchParams.set('mode', next)
      window.history.replaceState(null, '', url)
    } catch {
      // URL/storage unavailable: the mode change itself still applies.
    }
    toast.success(`Mode: ${next === 'orbit' ? 'Orbit Room' : next === 'auras' ? 'Aura Discs' : 'Showcase'}`)
  }

  return (
    <div data-testid="options-page" className="options-page">
      <MovingBackground palette={content.palette} />
      <div className="options-page__inner">
        <header className="options-header">
          <div>
            <h1 className="options-header__title">{content.headline}</h1>
            <p className="options-header__sub">{content.subcopy}</p>
          </div>
          <ModeSwitch mode={mode} onChange={changeMode} />
        </header>
        <section aria-label="Picture discs" className="options-stage">
          <DiscFormation discs={content.discs} locked={!verified} />
        </section>
        {!verified && (
          <section aria-label="Verification gate" className="options-gatewrap">
            <CaptchaGate key={mode} onVerified={() => setVerified(true)} />
          </section>
        )}
      </div>
    </div>
  )
}
