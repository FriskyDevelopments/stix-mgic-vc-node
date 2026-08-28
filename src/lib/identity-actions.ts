export type IdentityActionId = 'google' | 'apple' | 'microsoft' | 'friskydev-id'

export type IdentityAction = {
  id: IdentityActionId
  label: string
  ready: boolean
  method: 'supabase' | 'oidc'
  start?: string
}

export function listIdentityActions(config: {
  supabaseConfigured: boolean
  friskydevIdConfigured: boolean
}): IdentityAction[] {
  return [
    { id: 'google', label: 'Google', ready: config.supabaseConfigured, method: 'supabase' },
    { id: 'apple', label: 'Apple', ready: config.supabaseConfigured, method: 'supabase' },
    { id: 'microsoft', label: 'Microsoft', ready: config.supabaseConfigured, method: 'supabase' },
    { id: 'friskydev-id', label: 'FriskyDev ID', ready: config.friskydevIdConfigured, method: 'oidc' },
  ]
}

export function identityActionMark(id: IdentityActionId): string {
  switch (id) {
    case 'google':
      return 'G'
    case 'apple':
      return '●'
    case 'microsoft':
      return '⊞'
    case 'friskydev-id':
      return '✦'
    default: {
      const _never: never = id
      return _never
    }
  }
}

export function supabaseProviderFor(
  id: Extract<IdentityActionId, 'google' | 'apple' | 'microsoft'>
): 'google' | 'apple' | 'azure' {
  switch (id) {
    case 'google':
      return 'google'
    case 'apple':
      return 'apple'
    case 'microsoft':
      return 'azure'
    default: {
      const _never: never = id
      return _never
    }
  }
}
