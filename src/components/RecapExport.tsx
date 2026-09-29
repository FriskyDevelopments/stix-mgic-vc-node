import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GlassCard } from '@/components/GlassCard'
import { MediaDisclosure } from '@/components/MediaDisclosure'
import { apiHeaders, apiUrl } from '@/lib/api-client'

export type RecapProviderId = 'google-drive' | 'onedrive' | 'dropbox'

const PROVIDERS: Array<{ id: RecapProviderId; label: string; hint: string }> = [
  { id: 'google-drive', label: 'Google Drive', hint: 'App-created files only' },
  { id: 'onedrive', label: 'OneDrive', hint: 'Your drive root' },
  { id: 'dropbox', label: 'Dropbox', hint: 'Overwrite + autorename' },
]

type Props = {
  roomId: string | null
  /** The recap payload the session assembled (room, participants, queue, links). */
  buildRecap: () => Record<string, unknown> | null
}

/**
 * RecapExport — send the session recap to the operator's own cloud.
 *
 * The operator pastes a SHORT-LIVED OAuth access token from their provider's
 * consent flow; the node uploads with it and forgets it. No client secrets, no
 * refresh tokens, nothing stored. iCloud has no upload API — Apple devices save
 * the recap file to the synced folder instead (see docs/RECAP-EXPORT.md).
 */
export function RecapExport({ roomId, buildRecap }: Props) {
  const [provider, setProvider] = useState<RecapProviderId>('google-drive')
  const [accessToken, setAccessToken] = useState('')
  const [filename, setFilename] = useState('')
  const [sending, setSending] = useState(false)
  const [savedName, setSavedName] = useState<string | null>(null)

  async function downloadLocal() {
    const recap = buildRecap()
    if (!recap) { toast.error('Nothing to save yet', { description: 'Open a room first.' }); return }
    const blob = new Blob([JSON.stringify(recap, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename.trim() ? `${filename.trim()}.json` : 'nebu-recap.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    // Clear nothing: the file is now the operator's, on their device / iCloud folder.
  }

  async function exportRecap() {
    const recap = buildRecap()
    if (!recap) { toast.error('Nothing to export yet', { description: 'Open a room first.' }); return }
    if (!accessToken.trim()) { toast.error('Paste a short-lived access token first'); return }
    setSending(true)
    try {
      const response = await fetch(apiUrl('/v1/recap/export'), {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ provider, accessToken: accessToken.trim(), recap, filename: filename.trim() || undefined }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string; filename?: string; fileId?: string | null }
      if (!response.ok) throw new Error(body.error || `Export failed (${response.status})`)
      setSavedName(body.filename || 'recap')
      // The token did its one job — drop it from the form immediately.
      setAccessToken('')
      toast.success(`Recap saved to ${PROVIDERS.find(p => p.id === provider)?.label}`, { description: body.filename || undefined })
    } catch (error) {
      toast.error('Recap export failed', { description: error instanceof Error ? error.message : '' })
    } finally {
      setSending(false)
    }
  }

  return (
    <MediaDisclosure id="recap-export" title="Recap export" status={savedName ? 'Saved' : undefined}>
      <GlassCard className="p-5">
        <h2 className="font-mono text-sm text-cyan-300">RECAP EXPORT</h2>
        <p className="mt-2 text-xs text-white/50">Send the session recap to your own cloud with your own short-lived token. The node uploads and forgets — nothing stored.</p>
        <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Cloud provider">
          {PROVIDERS.map(p => (
            <Button
              key={p.id}
              size="sm"
              variant={provider === p.id ? 'default' : 'outline'}
              onClick={() => setProvider(p.id)}
              title={p.hint}
            >{p.label}</Button>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          <Input
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            type="password"
            placeholder="Short-lived access token (never stored)"
            aria-label="Provider access token"
            autoComplete="off"
          />
          <Input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="Filename (optional, defaults to nebu-recap)"
            aria-label="Recap filename"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" disabled={sending || !roomId} onClick={() => void exportRecap()}>{sending ? 'Uploading…' : 'Export recap'}</Button>
          <Button size="sm" variant="outline" onClick={() => void downloadLocal()}>Download file</Button>
        </div>
        {savedName && <p role="status" className="mt-3 text-xs text-white/50">Saved as {savedName}. The token was cleared.</p>}
        <p className="mt-3 text-[10px] text-white/35">iCloud has no upload API — on Apple devices use Download file and move it into a synced folder. OAuth client setup is owner-held; see docs/RECAP-EXPORT.md.</p>
      </GlassCard>
    </MediaDisclosure>
  )
}
