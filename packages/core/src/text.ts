export function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

export function hasControlChars(value: string, allowNewlines = false): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code === 127 || code < 32) {
      if (allowNewlines && (code === 9 || code === 10)) continue
      return true
    }
    if (code === 0x200b || code === 0x200c || code === 0x200d || code === 0xfeff) return true
    if (code >= 0x202a && code <= 0x202e) return true
    if (code >= 0x2066 && code <= 0x2069) return true
  }
  return false
}
