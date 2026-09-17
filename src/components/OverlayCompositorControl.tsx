import { useEffect, useState } from 'react'
import { readOverlayOutput, subscribeOverlayOutput, type OverlayOutput } from '@/lib/overlay-session'

/** Pack changes affect the compositor only after the operator opts in. */
export function OverlayCompositorControl({ onSelect }: { onSelect: (output: OverlayOutput | null) => void }) {
  const [enabled, setEnabled] = useState(false)
  const [output, setOutput] = useState(readOverlayOutput)
  useEffect(() => subscribeOverlayOutput(() => setOutput(readOverlayOutput())), [])
  useEffect(() => { if (enabled) onSelect(output) }, [enabled, onSelect, output])
  const screen = output?.pack.screens.find(item => item.id === output.screenId)

  return <div className="mb-4 rounded-md border border-border p-3 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><strong>Overlay Studio</strong><p className="mt-1 text-muted-foreground">{screen ? `${output!.pack.title} · ${screen.title}` : 'Prepare a scene in the overlay editor.'}</p></div>
      <a className="underline underline-offset-4" href="/overlay-studio" target="_blank" rel="noreferrer">Edit broadcast scenes ↗</a>
    </div>
    <label className="mt-3 flex items-center gap-2"><input type="checkbox" checked={enabled} disabled={!output && !enabled} onChange={event => { setEnabled(event.target.checked); if (!event.target.checked) onSelect(null) }} />Use sent scene in the video compositor</label>
    {enabled && <p className="mt-2 text-muted-foreground">{screen ? 'Graphics follow the scene you send from Overlay Studio. Default mark controls apply when this is off.' : 'Output cleared. The default mark is active until another scene is sent.'}</p>}
  </div>
}
