export function hasControlChars(value: string, allowNewlines = false): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code === 127 || code < 32) {
      if (allowNewlines && (code === 9 || code === 10)) continue
      return true
    }
  }
  return false
}
