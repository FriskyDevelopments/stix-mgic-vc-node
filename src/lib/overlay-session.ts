import { exportOverlayPack, importOverlayPack, validateOverlayPack, type OverlayPack } from './overlays'

export const OVERLAY_DRAFT_KEY = 'vc-node:overlay-draft:v1'
export const OVERLAY_OUTPUT_KEY = 'vc-node:overlay-output:v1'
const OUTPUT_EVENT = 'vc-node:overlay-output-change'
export type OverlayOutput = { pack: OverlayPack; screenId: string }

export function readOverlayDraft(): OverlayPack | null {
  const raw = window.localStorage.getItem(OVERLAY_DRAFT_KEY)
  if (!raw) return null
  const result = importOverlayPack(raw)
  if (!result.ok) throw new Error('The saved draft could not be read. Export your current work before replacing it.')
  return result.pack
}

export function saveOverlayDraft(pack: OverlayPack): void {
  window.localStorage.setItem(OVERLAY_DRAFT_KEY, exportOverlayPack(pack))
}

export function readOverlayOutput(): OverlayOutput | null {
  try {
    const raw = window.localStorage.getItem(OVERLAY_OUTPUT_KEY)
    if (!raw || raw.length > 2_000_000) return null
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object' || !('pack' in data) || !('screenId' in data)) return null
    const result = validateOverlayPack(data.pack)
    if (!result.ok || typeof data.screenId !== 'string' || !result.pack.screens.some(s => s.id === data.screenId)) return null
    return { pack: result.pack, screenId: data.screenId }
  } catch { return null }
}

/** A snapshot: editing a draft never changes output until the operator sends it. */
export function sendOverlayOutput(pack: OverlayPack, screenId: string): void {
  const result = validateOverlayPack(pack)
  if (!result.ok) throw new Error('This pack is invalid. Fix it before sending it to output.')
  if (!result.pack.screens.some(s => s.id === screenId)) throw new Error('Choose a scene in this pack.')
  const serialized = JSON.stringify({ pack: result.pack, screenId })
  if (serialized.length > 2_000_000) throw new Error('This output exceeds 2 MB. Reduce the pack size before sending it.')
  window.localStorage.setItem(OVERLAY_OUTPUT_KEY, serialized)
  window.dispatchEvent(new Event(OUTPUT_EVENT))
}

export function clearOverlayOutput(): void {
  window.localStorage.removeItem(OVERLAY_OUTPUT_KEY)
  window.dispatchEvent(new Event(OUTPUT_EVENT))
}

export function subscribeOverlayOutput(listener: () => void): () => void {
  const changed = (event: StorageEvent) => {
    if (event.key === OVERLAY_OUTPUT_KEY || event.key === null) listener()
  }
  window.addEventListener('storage', changed)
  window.addEventListener(OUTPUT_EVENT, listener)
  return () => {
    window.removeEventListener('storage', changed)
    window.removeEventListener(OUTPUT_EVENT, listener)
  }
}
