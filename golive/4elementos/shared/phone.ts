/** E.164 after a light Mexico-friendly cleanup. Display only; not a carrier lookup. */
export function normalizePhone(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10) return `+52${digits}`
  return `+${digits}`
}

export function isE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value)
}

/** WAHA chat id for a direct chat. Groups are never constructed here. */
export function wahaDirectChatId(phoneE164: string): string | null {
  if (!isE164(phoneE164)) return null
  return `${phoneE164.slice(1)}@c.us`
}
