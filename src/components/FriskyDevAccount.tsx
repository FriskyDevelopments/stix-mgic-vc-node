import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  UserCircle,
  SignIn,
  SignOut,
  LinkSimple,
  CheckCircle,
  WarningCircle,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  fetchFriskyDevMe,
  loginFriskyDevAccount,
  logoutFriskyDevAccount,
  registerFriskyDevAccount,
  unlinkPlatformFromFriskyDev,
  type FriskyDevAccount,
  type LinkedPlatformIdentity,
} from '@/lib/friskydev'

type FriskyDevAccountPanelProps = {
  onAccountChange?: (account: FriskyDevAccount | null, linked: LinkedPlatformIdentity[]) => void
}

export function FriskyDevAccountPanel({ onAccountChange }: FriskyDevAccountPanelProps) {
  const [account, setAccount] = useState<FriskyDevAccount | null>(null)
  const [linked, setLinked] = useState<LinkedPlatformIdentity[]>([])
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(true)
  const onAccountChangeRef = useRef(onAccountChange)
  onAccountChangeRef.current = onAccountChange

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const me = await fetchFriskyDevMe()
      if (cancelled) return
      if (me) {
        setAccount(me.account)
        setLinked(me.linked)
        onAccountChangeRef.current?.(me.account, me.linked)
      }
      setBootstrapping(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const applySession = (nextAccount: FriskyDevAccount, nextLinked: LinkedPlatformIdentity[]) => {
    setAccount(nextAccount)
    setLinked(nextLinked)
    onAccountChange?.(nextAccount, nextLinked)
  }

  const handleSubmit = async () => {
    setBusy(true)
    try {
      const result =
        mode === 'login'
          ? await loginFriskyDevAccount({ email, password })
          : await registerFriskyDevAccount({ email, password, displayName })
      applySession(result.account, result.linked)
      toast.success(mode === 'login' ? 'FriskyDev signed in' : 'FriskyDev account created')
      setPassword('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'FriskyDev auth failed')
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = () => {
    logoutFriskyDevAccount()
    setAccount(null)
    setLinked([])
    onAccountChange?.(null, [])
    toast('FriskyDev signed out')
  }

  const handleUnlink = async (platform: 'telegram' | 'discord') => {
    try {
      await unlinkPlatformFromFriskyDev(platform)
      const next = linked.filter((i) => i.platform !== platform)
      setLinked(next)
      onAccountChange?.(account, next)
      toast.success(`Unlinked ${platform}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unlink failed')
    }
  }

  if (bootstrapping) {
    return (
      <div className="glass-panel rounded-xl p-6">
        <p className="text-xs text-muted-foreground font-mono">Loading FriskyDev account…</p>
      </div>
    )
  }

  return (
    <div className="glass-panel rounded-xl p-6 space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <UserCircle size={20} className="text-accent" />
          <h2 className="text-lg font-semibold">FriskyDev Account</h2>
          <Badge variant="outline" className="text-[10px] font-mono border-accent text-accent">
            PRIMARY
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Layer 1 — sign in with your FriskyDev account, then link real Telegram and Discord identities as layer 2.
        </p>
      </div>

      {account ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-success/30 bg-success/5 p-4 space-y-2">
            <div className="flex items-center gap-2 text-success text-sm">
              <CheckCircle size={14} weight="fill" />
              <span className="font-medium">{account.displayName}</span>
            </div>
            <p className="text-xs text-muted-foreground font-mono">{account.email}</p>
            <p className="text-[10px] text-muted-foreground font-mono">ID: {account.id}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <LinkSimple size={12} />
              Linked platform identities
            </div>
            {linked.length === 0 ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <WarningCircle size={12} />
                No platforms linked yet — use Platform Access below while signed in.
              </p>
            ) : (
              <div className="space-y-2">
                {linked.map((identity) => (
                  <div
                    key={`${identity.platform}:${identity.externalSubject}`}
                    className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-medium capitalize">{identity.platform}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {identity.displayName} · {identity.externalSubject}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs"
                      onClick={() => handleUnlink(identity.platform)}
                    >
                      Unlink
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button onClick={handleLogout} variant="outline" size="sm" className="w-full gap-2">
            <SignOut size={14} />
            Sign out of FriskyDev
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mode === 'login' ? 'default' : 'outline'}
              onClick={() => setMode('login')}
            >
              Sign in
            </Button>
            <Button
              size="sm"
              variant={mode === 'register' ? 'default' : 'outline'}
              onClick={() => setMode('register')}
            >
              Create account
            </Button>
          </div>

          {mode === 'register' && (
            <Input
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          )}
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <Input
            type="password"
            placeholder="Password (min 8 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          <Button onClick={handleSubmit} disabled={busy} className="w-full gap-2">
            <SignIn size={16} />
            {busy ? 'Working…' : mode === 'login' ? 'Sign in to FriskyDev' : 'Create FriskyDev account'}
          </Button>
        </div>
      )}
    </div>
  )
}
