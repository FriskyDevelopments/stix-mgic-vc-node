/**
 * VC Node has one identity surface: FriskyDev/Supabase social SSO. Keeping this tiny
 * wrapper means callers do not need to know its implementation, while removing any
 * legacy-IdP fallback from the active interface.
 */
import { FriskyDevIdentityGate } from '@/components/FriskyDevIdentityGate'

type Identity = { id: string; name: string }

export function IdentityGate({ onChange }: { onChange: (authenticated: boolean) => void }) {
  return <FriskyDevIdentityGate onChange={(identity: Identity | null) => onChange(Boolean(identity))} />
}
