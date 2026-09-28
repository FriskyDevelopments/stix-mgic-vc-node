import { roomInvitePath } from '@/lib/nebu-host'

/** Keep invitations on this node and carry them through the sign-in round trip. */
export function roomInviteUrl(roomId: string): string {
  const invite = new URL(roomInvitePath(window.location.pathname, window.location.hostname), window.location.origin)
  invite.searchParams.set('room', roomId)
  return invite.toString()
}

export function roomIdFromInput(input: string): string {
  const value = input.trim()
  if (!value) return ''
  if (!value.includes('/') && !value.includes('?')) return value
  let invite: URL
  try { invite = new URL(value, window.location.origin) } catch {
    throw new Error('Paste a room ID or a VC Node invite link')
  }
  if (invite.origin !== window.location.origin) throw new Error('This invite belongs to a different site')
  const id = invite.searchParams.get('room')?.trim()
  if (!id) throw new Error('This link does not contain a room invitation')
  return id
}

export function signInReturnUrl(): string {
  const current = new URL(window.location.href)
  const target = new URL(roomInvitePath(current.pathname, current.hostname), current.origin)
  const room = current.searchParams.get('room')
  if (room) target.searchParams.set('room', room)
  if (!room && current.searchParams.get('action') === 'new-room') target.searchParams.set('action', 'new-room')
  return target.toString()
}
