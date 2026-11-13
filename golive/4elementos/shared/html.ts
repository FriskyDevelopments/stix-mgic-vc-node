export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function safeToken(value: string | null | undefined, max = 128): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return null
  if (!/^[A-Za-z0-9_.:-]+$/.test(trimmed)) return null
  return trimmed
}
