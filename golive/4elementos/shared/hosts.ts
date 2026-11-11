const BLOCKED_SUFFIXES = ['nebu.quest', 'casabarravieja.com', 'friskydev.com', '4elementos.com']

export function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.+$/, '')
}

/** Production and other-tenant hosts, including their subdomains. */
export function isBlockedHost(hostname: string): boolean {
  const host = normalizeHost(hostname)
  return BLOCKED_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
}

/** Loopback only. A workers.dev host must be set as PUBLIC_BASE_URL by the owner. */
export function isLoopbackOrDemoHost(hostname: string): boolean {
  const host = normalizeHost(hostname)
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}
