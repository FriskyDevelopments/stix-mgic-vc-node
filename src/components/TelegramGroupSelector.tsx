import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { getTelegramGroups } from '@/lib/telegram-vc-api'

type Group = { id: string; title: string; kind: string }

export function TelegramGroupSelector({
  accessGranted, connected, value, onChange, disabled = false,
}: {
  accessGranted: boolean
  connected: boolean
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const id = useId()
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const current = useRef({ value, onChange })
  current.current = { value, onChange }

  const refresh = useCallback(async () => {
    if (!accessGranted || !connected) return
    const request = ++generation.current
    setLoading(true)
    setError('')
    try {
      const result = await getTelegramGroups()
      if (request !== generation.current) return
      const next = result.groups
      setGroups(next)
      setLoaded(true)
      if (current.current.value && !next.some(group => group.id === current.current.value)) {
        current.current.onChange('')
      }
    } catch {
      if (request !== generation.current) return
      setGroups([])
      setError('Could not load your Telegram groups. Check the connection and try again.')
    } finally {
      if (request === generation.current) setLoading(false)
    }
  }, [accessGranted, connected])

  useEffect(() => {
    setGroups([])
    setLoaded(false)
    setError('')
    setLoading(false)
    void refresh()
    // Invalidate the latest request, including a manual refresh started after this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { generation.current++ }
  }, [refresh])

  return <div className="w-full space-y-2" aria-busy={loading}>
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm font-medium">Telegram group</label>
      <button type="button" className="text-xs text-cyan-300 underline underline-offset-4 disabled:opacity-40" disabled={disabled || loading || !accessGranted || !connected} onClick={() => void refresh()}>Refresh groups</button>
    </div>
    <select id={id} className="min-h-11 w-full rounded-lg border border-cyan-200/20 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-60" value={value} disabled={disabled || loading || !accessGranted || !connected || groups.length === 0} onChange={event => onChange(event.target.value)}>
      <option value="">{loading ? 'Loading your groups…' : 'Choose a Telegram group'}</option>
      {groups.map(group => <option key={group.id} value={group.id}>{group.title}</option>)}
    </select>
    <p role={error ? 'alert' : 'status'} className={`text-xs ${error ? 'text-rose-300' : 'text-slate-400'}`}>
      {!accessGranted ? 'Sign in to see your Telegram groups.' : !connected ? 'Connect the Telegram operator to load groups.' : error || (loading ? 'Checking the connected Telegram account…' : loaded && groups.length === 0 ? 'No groups returned. Add the connected Telegram account to your group, then refresh.' : loaded ? `${groups.length} groups available. Choosing a group does not start a call.` : '')}
    </p>
  </div>
}
