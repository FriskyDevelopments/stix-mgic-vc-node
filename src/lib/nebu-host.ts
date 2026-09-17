/** NEBU studio lives at /studio locally and on any nebu.quest host. */

export function isNebuHostname(hostname: string): boolean {
  return hostname === 'nebu.quest' || hostname.endsWith('.nebu.quest')
}

export function isNebuStudioPath(pathname: string): boolean {
  return pathname === '/studio' || pathname.startsWith('/studio/')
}

/**
 * Consumer call UI, as opposed to the operator console at /ops.
 * Overlay/auth callbacks stay on their own routes.
 */
export function isNebuStudioRoute(pathname: string, hostname: string): boolean {
  if (pathname === '/ops') return false
  if (pathname.startsWith('/overlay') || pathname.startsWith('/auth') || pathname === '/spotify-callback') {
    return false
  }
  if (isNebuStudioPath(pathname)) return true
  return isNebuHostname(hostname)
}

/** Invite links must open the studio, not the operator dashboard. */
export function roomInvitePath(pathname: string, hostname: string): string {
  if (isNebuStudioPath(pathname) || isNebuHostname(hostname)) return isNebuHostname(hostname) ? '/' : '/studio'
  return '/'
}
