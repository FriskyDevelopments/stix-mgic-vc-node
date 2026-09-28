import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AccountFlowDialog } from '@/components/AccountFlowDialog'
import { StudioMasthead } from '@/components/StudioMasthead'
import { StudioMonitor, type StudioSource, type StudioSourceId } from '@/components/StudioMonitor'
import { MediaDisclosure, openMediaDisclosure } from '@/components/MediaDisclosure'
import { SpotifyPlayer } from '@/components/SpotifyPlayer'
import { resetSamplePlayback, SAMPLE_TOKEN } from './fixtures'
import './preview.css'

const sources = [
  { id: 'camera', label: 'Camera', stream: null },
  { id: 'screen', label: 'Screen', stream: null },
  { id: 'studio', label: 'Video & mix', stream: null },
  ...(import.meta.env.UI_PREVIEW_RUNDOWN ? [{ id: 'rundown', label: 'Video rundown', stream: null }] : []),
] as StudioSource[]

function DesignPreview() {
  const [accountOpen, setAccountOpen] = useState(false)
  const [previewId, setPreviewId] = useState<StudioSourceId>('camera')
  const [sampleConnected, setSampleConnected] = useState(true)
  const [playerRevision, setPlayerRevision] = useState(0)
  const [note, setNote] = useState('Try Music, choose a sample track, or compare the preview sources.')
  useEffect(() => {
    const receiveNotice = (event: Event) => setNote(String((event as CustomEvent).detail))
    window.addEventListener('vc-preview-notice', receiveNotice)
    return () => window.removeEventListener('vc-preview-notice', receiveNotice)
  }, [])

  const setupNote = (name: string) => setNote(`${name} is a layout example here. No camera, microphone, screen, or room is opened.`)
  const setupHandlers = {
    onOpenCameraSetup: () => setupNote('Camera setup'),
    onOpenScreenControls: () => setupNote('Screen controls'),
    onOpenStudioControls: () => setupNote('Video & mix controls'),
    onOpenRundownControls: () => setupNote('Video rundown controls'),
  }
  const mastheadHandlers = { onOpenOverlays: () => setupNote('Overlay controls') }

  return <div className="vc-studio-page">
    <div className="preview-banner"><strong>Design preview · sample music · no broadcast</strong><span>Isolated on this device</span></div>
    <main className="studio-shell">
      <StudioMasthead signedIn={false} {...mastheadHandlers}
        onOpenAccount={() => setAccountOpen(true)}
        onOpenMusic={() => openMediaDisclosure('spotify-controls')}
        onOpenBroadcast={() => openMediaDisclosure('telegram-controls')} />

      <div className="preview-toolbar" aria-label="Preview examples">
        <p role="status" aria-live="polite">{note}</p>
        <div><button type="button" onClick={() => {
          resetSamplePlayback(); setPlayerRevision((revision) => revision + 1); setSampleConnected(true)
          setNote('Sample music restored. The player changes local fixture state; it produces no audio.')
          openMediaDisclosure('spotify-controls')
        }}>Restore sample music</button><button type="button" onClick={() => {
          setSampleConnected(false); openMediaDisclosure('spotify-controls')
          setNote('Disconnected example. Connect Spotify is disabled because this preview has no client ID.')
        }}>View disconnected</button></div>
      </div>

      <AccountFlowDialog open={accountOpen} onOpenChange={setAccountOpen} signedIn={false} telegramConnected={false}
        identity={      <section className="preview-account" aria-label="Real account access">
        <div><span className="preview-account__eyebrow">YOUR ACCOUNT / THE REAL STUDIO</span><h2>Sign in. Connect Telegram.</h2><p>This is the design preview. Your real account and Telegram connection are in VC Node.</p></div>
        <ol><li><strong>01 · Sign in</strong><span>Google, Apple, Microsoft or FriskyDev ID</span></li><li><strong>02 · Connect Telegram</strong><span>Use the official Telegram login after signing in.</span></li><li><strong>03 · Choose your group</strong><span>Open the broadcast controls when you’re ready.</span></li></ol>
        <a className="preview-account__link" href="https://vc.friskydev.com/" target="_blank" rel="noopener noreferrer">Open real VC Node ↗</a>
      </section>}
        platforms={<div className="preview-copy"><h3>Connect Telegram</h3><p>The official Telegram login appears here after signing in to the real VC Node.</p></div>}
      />

      <section id="room-studio" className="glass-panel studio-room">
        <div className="studio-room__heading"><div><h2>Room studio</h2><div className="preview-room-tag">Local design preview</div></div><span className="preview-room-status">Not in a room</span></div>
        <div className="studio-room__setup"><p>Choose a source to explore the studio layout. Camera and microphone access remain off in this preview.</p><button type="button" onClick={() => setupNote('Device setup')}>Set up camera &amp; microphone</button></div>
        <StudioMonitor sources={sources} previewId={previewId} onPreviewChange={setPreviewId}
          programId={null} programStream={null} roomId={null} pending={false}
          onShare={() => setupNote('Output preparation')} onClear={() => setupNote('Clear output')}
          {...setupHandlers} />
        <div className="media-workspace preview-disclosures">
          <MediaDisclosure id="spotify-controls" title="Spotify" status={sampleConnected ? 'Sample library · silent controls' : 'Disconnected example'}>
            <SpotifyPlayer key={playerRevision} accessToken={sampleConnected ? SAMPLE_TOKEN : null} onDisconnect={() => {
              setSampleConnected(false)
              setNote('Sample player disconnected. Restore sample music to keep exploring the controls.')
            }} />
          </MediaDisclosure>
          <MediaDisclosure id="telegram-controls" title="Telegram broadcast" status="No group or call connected">
            <div className="preview-copy"><h3>Bring people in when you are ready.</h3><p>This preview does not connect to Telegram. Sending messages, muting participants, and broadcasting are disabled.</p><button type="button" disabled>Broadcast unavailable in preview</button></div>
          </MediaDisclosure>
        </div>
      </section>
      <footer className="preview-footer"><span>Frisky Developments · VC Node</span><span>Design fixture. No media is playing or being transmitted.</span></footer>
    </main>
  </div>
}

export function renderPreview() {
  createRoot(document.getElementById('root')!).render(<DesignPreview />)
}
