import { describe, expect, it } from 'vitest'
import { isNebuHostname, isNebuStudioRoute, roomInvitePath } from './nebu-host'

describe('NEBU studio routing', () => {
  it('treats the apex and studio subdomain as NEBU hosts', () => {
    expect(isNebuHostname('nebu.quest')).toBe(true)
    expect(isNebuHostname('studio.nebu.quest')).toBe(true)
    expect(isNebuHostname('vc.friskydev.com')).toBe(false)
    expect(isNebuHostname('localhost')).toBe(false)
  })

  it('opens the studio at /studio on localhost and on nebu.quest hosts', () => {
    expect(isNebuStudioRoute('/studio', 'localhost')).toBe(true)
    expect(isNebuStudioRoute('/', 'studio.nebu.quest')).toBe(true)
    expect(isNebuStudioRoute('/', 'localhost')).toBe(false)
    expect(isNebuStudioRoute('/ops', 'studio.nebu.quest')).toBe(false)
    expect(isNebuStudioRoute('/overlay-studio', 'nebu.quest')).toBe(false)
  })

  it('keeps invite links on the studio path', () => {
    expect(roomInvitePath('/studio', 'localhost')).toBe('/studio')
    expect(roomInvitePath('/', 'studio.nebu.quest')).toBe('/')
    expect(roomInvitePath('/', 'localhost')).toBe('/')
    expect(roomInvitePath('/ops', 'localhost')).toBe('/')
  })
})
