/** Drop ASCII control characters without a control-character regex. */
export function stripControls(value: string): string {
  let out = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code >= 32 && code !== 127) out += char
  }
  return out
}
