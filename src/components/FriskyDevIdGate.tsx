import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/GlassCard'

type Identity = { id: string; name: string }

export function FriskyDevIdGate({ onChange }: { onChange: (authenticated: boolean) => void }) {
  const [user, setUser] = useState<Identity | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/v1/auth/oidc/me', { credentials: 'same-origin' })
      const data = response.ok ? ((await response.json()) as { user: Identity }) : null
      setUser(data?.user || null)
      onChange(Boolean(data?.user))
    } finally {
      setLoading(false)
    }
  }, [onChange])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function logout() {
    await fetch('/v1/auth/oidc/logout', { method: 'POST', credentials: 'same-origin' })
    setUser(null)
    onChange(false)
  }

  return (
    <GlassCard className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-cyan-300">FriskyDev ID</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? 'Checking secure session…' : user ? `Signed in as ${user.name}` : 'Sign in once for web, Telegram links and VC rooms.'}
          </p>
        </div>
        {!loading && (user ? (
          <Button variant="outline" onClick={() => void logout()}>Sign out</Button>
        ) : (
          <Button onClick={() => {
            const returnTo = `${window.location.pathname}${window.location.search}`
            window.location.href = `/v1/auth/oidc/start?returnTo=${encodeURIComponent(returnTo)}`
          }}>Continue with FriskyDev ID</Button>
        ))}
      </div>
    </GlassCard>
  )
}
