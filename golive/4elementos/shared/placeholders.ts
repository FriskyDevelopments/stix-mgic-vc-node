/** Values that must never be treated as real credentials. */
export function isUnset(value: string | undefined | null): boolean {
  if (value == null) return true
  const trimmed = value.trim()
  if (!trimmed) return true
  return /replace[_-]?me|changeme|placeholder|example\.invalid|xxxxx+/i.test(trimmed)
}

export function timingSafeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left)
  const b = new TextEncoder().encode(right)
  const length = Math.max(a.length, b.length)
  let diff = a.length === b.length ? 0 : 1
  for (let i = 0; i < length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return diff === 0
}
