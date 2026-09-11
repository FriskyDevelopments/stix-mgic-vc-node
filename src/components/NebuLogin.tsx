import { FormEvent, useMemo, useState } from 'react'
import { WarningCircle, ArrowRight, Check, Eye, EyeSlash, Sparkle } from '@phosphor-icons/react'
import { nebuAuthClient, type NebuSocialProvider } from '@/lib/nebu-auth-client'
import '@/styles/nebu-motion.css'

type Mode = 'signin' | 'signup'

const SOCIAL_PROVIDERS: Array<{ id: NebuSocialProvider; label: string; mark: string }> = [
  { id: 'google', label: 'Continue with Google', mark: 'G' },
  { id: 'microsoft', label: 'Continue with Microsoft', mark: 'M' },
  { id: 'apple', label: 'Continue with Apple', mark: 'A' },
]

const NEBU_BG = '#0d081a'
const NEBU_YELLOW = '#F5E000'
const NEBU_PURPLE = '#9026ff'
const NEBU_CYAN = '#6bd9ff'

type NebuLoginProps = {
  authConfigured?: boolean
  socialProviders?: NebuSocialProvider[]
}

/** Renders the NEBU email and social-provider login experience. */
export function NebuLogin({
  authConfigured = true,
  socialProviders,
}: NebuLoginProps) {
  const providers = useMemo(() => {
    const allowed = socialProviders?.length
      ? SOCIAL_PROVIDERS.filter((p) => socialProviders.includes(p.id))
      : SOCIAL_PROVIDERS
    return allowed
  }, [socialProviders])

  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingProvider, setPendingProvider] = useState<NebuSocialProvider | null>(null)

  const busy = isSubmitting || pendingProvider !== null

  const notReady = () => {
    setError(
      'NEBU Better Auth is not configured on this host yet. Set BETTER_AUTH_SECRET, BETTER_AUTH_URL, DATABASE_URL, and OAuth client env vars.'
    )
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)
    if (!authConfigured) {
      notReady()
      return
    }

    setIsSubmitting(true)
    try {
      const result =
        mode === 'signin'
          ? await nebuAuthClient.signIn.email({ email, password, callbackURL: '/' })
          : await nebuAuthClient.signUp.email({ name, email, password, callbackURL: '/' })

      if (result.error) {
        setError(result.error.message ?? 'Could not complete sign-in.')
        return
      }

      if (mode === 'signup') {
        setMode('signin')
        setPassword('')
        setNotice('Account created. You can sign in now.')
        return
      }

      window.location.replace('/')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not complete sign-in.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const signInWithProvider = async (provider: NebuSocialProvider) => {
    setError(null)
    setNotice(null)
    if (!authConfigured) {
      notReady()
      return
    }
    setPendingProvider(provider)
    try {
      const result = await nebuAuthClient.signIn.social({
        provider,
        callbackURL: '/',
      })
      if (!result.error) return

      setPendingProvider(null)
      setError(result.error.message ?? 'Could not start social sign-in.')
    } catch (cause) {
      setPendingProvider(null)
      setError(cause instanceof Error ? cause.message : 'Could not start social sign-in.')
    }
  }

  return (
    <main
      className="min-h-screen text-white"
      style={{ backgroundColor: NEBU_BG, fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div
          className="nebu-blob absolute -left-24 top-20 h-80 w-80 rounded-full blur-3xl opacity-40"
          style={{ backgroundColor: NEBU_PURPLE }}
        />
        <div
          className="nebu-blob nebu-blob-delay absolute bottom-0 right-0 h-72 w-72 translate-x-1/4 translate-y-1/4 rounded-full blur-3xl opacity-30"
          style={{ backgroundColor: NEBU_CYAN }}
        />
        <div
          className="nebu-blob absolute right-1/4 top-1/3 h-40 w-40 rounded-full blur-3xl opacity-20"
          style={{ backgroundColor: NEBU_YELLOW }}
        />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-12 sm:px-8">
        <header className="nebu-rise nebu-rise-1 mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkle size={22} weight="fill" className="nebu-spark" style={{ color: NEBU_YELLOW }} />
            <span className="text-2xl font-black tracking-tight uppercase">NEBU</span>
          </div>
          <span
            className="rounded-full px-3 py-1 text-[10px] font-bold tracking-[0.16em] uppercase"
            style={{ backgroundColor: NEBU_YELLOW, color: '#0c021a' }}
          >
            nebu.quest
          </span>
        </header>

        <section
          className="nebu-login-panel rounded-3xl border border-white/10 p-6 shadow-2xl sm:p-8"
          style={{ backgroundColor: 'rgba(255,255,255,0.96)', color: '#0c021a' }}
        >
          <p
            className="mb-2 text-[11px] font-bold tracking-[0.18em] uppercase"
            style={{ color: NEBU_PURPLE }}
          >
            Sign in
          </p>
          <h1 className="text-4xl font-black leading-none tracking-tight sm:text-5xl">
            {mode === 'signin' ? 'Welcome back.' : 'Join NEBU.'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-black/60">
            NEBU product login — Google, Apple, Microsoft, or email. Set the scene and pick up
            where you left off.
          </p>

          <div className="mt-7 grid gap-3" role="group" aria-label="Social sign-in providers">
            {providers.map((provider) => (
              <button
                key={provider.id}
                type="button"
                disabled={busy}
                onClick={() => void signInWithProvider(provider.id)}
                className="group flex min-h-12 w-full items-center justify-between rounded-2xl border border-black/10 bg-white px-4 text-sm font-bold transition hover:border-black/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex items-center gap-3">
                  <span
                    className="grid h-8 w-8 place-items-center rounded-full text-[12px] font-black text-white"
                    style={{ backgroundColor: NEBU_BG }}
                  >
                    {provider.mark}
                  </span>
                  {pendingProvider === provider.id ? 'Redirecting…' : provider.label}
                </span>
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </button>
            ))}
          </div>

          <div className="my-6 flex items-center gap-3 text-[11px] font-bold tracking-[0.16em] text-black/40">
            <span className="h-px flex-1 bg-black/15" aria-hidden="true" />
            <span>OR EMAIL</span>
            <span className="h-px flex-1 bg-black/15" aria-hidden="true" />
          </div>

          <div
            className="mb-6 grid grid-cols-2 rounded-2xl border border-black/10 p-1"
            role="radiogroup"
            aria-label="Sign-in mode"
          >
            <label
              className={`grid min-h-11 cursor-pointer place-items-center rounded-xl px-3 text-sm font-bold transition focus-within:ring-2 focus-within:ring-[#9026ff]/40 ${
                mode === 'signin' ? 'text-[#0c021a]' : 'text-black/50'
              }`}
              style={mode === 'signin' ? { backgroundColor: NEBU_YELLOW } : undefined}
            >
              <input
                className="sr-only"
                type="radio"
                name="nebu-login-mode"
                value="signin"
                checked={mode === 'signin'}
                onChange={() => {
                  setMode('signin')
                  setError(null)
                }}
              />
              Sign in
            </label>
            <label
              className={`grid min-h-11 cursor-pointer place-items-center rounded-xl px-3 text-sm font-bold transition focus-within:ring-2 focus-within:ring-[#9026ff]/40 ${
                mode === 'signup' ? 'text-[#0c021a]' : 'text-black/50'
              }`}
              style={mode === 'signup' ? { backgroundColor: NEBU_YELLOW } : undefined}
            >
              <input
                className="sr-only"
                type="radio"
                name="nebu-login-mode"
                value="signup"
                checked={mode === 'signup'}
                onChange={() => {
                  setMode('signup')
                  setError(null)
                }}
              />
              Create account
            </label>
          </div>

          <form className="space-y-4" onSubmit={(e) => void submit(e)}>
            {mode === 'signup' && (
              <label className="block text-sm font-bold">
                Name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  className="mt-2 min-h-12 w-full rounded-2xl border border-black/15 bg-white px-4 text-base outline-none focus:border-[#9026ff] focus:ring-2 focus:ring-[#9026ff]/25"
                  placeholder="Your name"
                />
              </label>
            )}
            <label className="block text-sm font-bold">
              Email
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="mt-2 min-h-12 w-full rounded-2xl border border-black/15 bg-white px-4 text-base outline-none focus:border-[#9026ff] focus:ring-2 focus:ring-[#9026ff]/25"
                placeholder="you@example.com"
              />
            </label>
            <label className="block text-sm font-bold">
              Password
              <span className="relative mt-2 block">
                <input
                  required
                  minLength={8}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  className="min-h-12 w-full rounded-2xl border border-black/15 bg-white px-4 pr-12 text-base outline-none focus:border-[#9026ff] focus:ring-2 focus:ring-[#9026ff]/25"
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-0 top-0 grid min-h-12 min-w-12 place-items-center text-black/50"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>

            {error && (
              <div
                role="alert"
                className="flex gap-2 rounded-2xl border border-red-700/30 bg-red-50 p-3 text-sm text-red-900"
              >
                <WarningCircle size={18} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}
            {notice && (
              <div
                role="status"
                className="flex gap-2 rounded-2xl border border-[#9026ff]/30 bg-[#9026ff]/10 p-3 text-sm"
              >
                <Check size={18} className="mt-0.5 shrink-0" style={{ color: NEBU_PURPLE }} />
                {notice}
              </div>
            )}

            <button
              disabled={busy}
              type="submit"
              className="nebu-cta group flex min-h-12 w-full items-center justify-between rounded-2xl px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: NEBU_YELLOW, color: '#0c021a' }}
            >
              <span>
                {isSubmitting
                  ? 'Working…'
                  : mode === 'signin'
                    ? 'Sign in to NEBU'
                    : 'Create NEBU account'}
              </span>
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </button>
          </form>
        </section>

        <p className="mt-6 text-center text-xs leading-5 text-white/50">
          Session cookies are httpOnly and server-managed. This is NEBU on nebu.quest.
        </p>
      </div>
    </main>
  )
}

export default NebuLogin
