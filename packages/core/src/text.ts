export function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

export function hasControlChars(value: string, allowNewlines = false): boolean {
  for (let index = 0; index < value.length; ) {
    const code = value.codePointAt(index) ?? 0
    index += code > 0xffff ? 2 : 1
    if (code === 127 || code < 32) {
      if (allowNewlines && (code === 9 || code === 10)) continue
      return true
    }
    if (code === 0xad || code === 0x200b || code === 0x200c || code === 0x200d || code === 0x2060 || code === 0xfeff) return true
    if (code === 0x2028 || code === 0x2029) return true
    if (code >= 0x202a && code <= 0x202e) return true
    if (code >= 0x2066 && code <= 0x2069) return true
    if (code >= 0xe0000 && code <= 0xe007f) return true
  }
  return false
}
