import { describe, expect, it } from 'vitest'
import { identityActionMark, listIdentityActions } from './identity-actions'

describe('listIdentityActions', () => {
  it('always lists Fenrir SSO plus FriskyDev ID', () => {
    const actions = listIdentityActions({
      supabaseConfigured: false,
      friskydevIdConfigured: false,
    })

    expect(actions.map((action) => [action.id, action.label, action.ready])).toEqual([
      ['google', 'Google', false],
      ['apple', 'Apple', false],
      ['microsoft', 'Microsoft', false],
      ['friskydev-id', 'FriskyDev ID', false],
    ])
  })

  it('enables Apple/Google/Microsoft independently of FriskyDev ID', () => {
    const actions = listIdentityActions({
      supabaseConfigured: true,
      friskydevIdConfigured: true,
    })

    expect(actions.filter((action) => action.ready).map((action) => action.id)).toEqual([
      'google',
      'apple',
      'microsoft',
      'friskydev-id',
    ])
    expect(identityActionMark('google')).toBe('G')
    expect(identityActionMark('friskydev-id')).toBe('✦')
  })
})
