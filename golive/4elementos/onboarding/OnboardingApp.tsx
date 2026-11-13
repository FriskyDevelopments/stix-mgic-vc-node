import { useEffect, useId, useRef, useState } from 'react'
import { DEMO_SERVICES } from '../payments/catalog.ts'
import { isCheckoutUrl } from '../payments/stripe.ts'
import { copy, activationBeats, dayCopy, elementCopy } from './copy.ts'
import {
  ELEMENTS,
  FORM_STEPS,
  STORAGE_KEY,
  WEEKDAYS,
  completeActivation,
  emptyDraft,
  formProgress,
  goBack,
  goNext,
  goTo,
  reachable,
  resume,
  summary,
  type Issue,
  type OnboardingDraft,
} from './flow.ts'
import './onboarding.css'

type Memory = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface OnboardingAppProps {
  reducedMotion?: boolean
  storage?: Memory | null
  now?: () => string
  checkoutFetcher?: (serviceId: string) => Promise<{ url?: string; error?: string }>
  marinaFetcher?: (text: string) => Promise<{ reply?: string; error?: string; escalated?: boolean }>
}

function browserStorage(): Memory | null {
  if (typeof window === 'undefined') return null
  try {
    window.sessionStorage.setItem('__el_probe', '1')
    window.sessionStorage.removeItem('__el_probe')
    return window.sessionStorage
  } catch {
    return null
  }
}

function writeStorage(storage: Memory | null, draft: OnboardingDraft) {
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(draft))
  } catch {
    // Private mode can reject the write. The screen still works for this visit.
  }
}

export function OnboardingApp({
  reducedMotion,
  storage: storageProp,
  now = () => new Date().toISOString(),
  checkoutFetcher,
  marinaFetcher,
}: OnboardingAppProps) {
  const storage = storageProp === undefined ? browserStorage() : storageProp
  const [draft, setDraft] = useState<OnboardingDraft>(() => resume(storage?.getItem(STORAGE_KEY) ?? null))
  const [issues, setIssues] = useState<Issue[]>([])
  const [confirmReset, setConfirmReset] = useState(false)
  const [beat, setBeat] = useState(0)
  const [payNote, setPayNote] = useState('')
  const [marinaNote, setMarinaNote] = useState('')
  const [busy, setBusy] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion(reducedMotion)
  const liveId = useId()
  const nowRef = useRef(now)
  nowRef.current = now
  const firstFocus = useRef(true)
  const keyboard = useRef(false)

  useEffect(() => {
    const id = 'elementos-fonts'
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600&family=Jost:wght@400;500;600&family=Outfit:wght@400;500;600&display=swap'
    document.head.appendChild(link)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab' || event.key === 'Enter' || event.key === ' ') keyboard.current = true
    }
    const onPointer = () => {
      keyboard.current = false
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [])

  useEffect(() => {
    document.title = `${copy.steps[draft.step].title} · 4 Elementos`
    if (firstFocus.current) {
      firstFocus.current = false
      return
    }
    if (issues.length) alertRef.current?.focus()
    else if (keyboard.current) headingRef.current?.focus()
  }, [draft.step, issues])

  useEffect(() => {
    if (draft.step !== 'activating') return
    if (reduced) {
      setBeat(activationBeats.length)
      return
    }
    setBeat(1)
    const id = window.setInterval(() => {
      setBeat((value) => (value >= activationBeats.length ? value : value + 1))
    }, 650)
    return () => window.clearInterval(id)
  }, [draft.step, reduced])

  useEffect(() => {
    if (draft.step !== 'activating' || reduced || beat < activationBeats.length) return
    const id = window.setTimeout(() => {
      setDraft((current) => {
        const next = completeActivation(current, nowRef.current())
        writeStorage(storage, next)
        return next
      })
    }, 800)
    return () => window.clearTimeout(id)
  }, [draft.step, reduced, beat, storage])

  function commit(next: OnboardingDraft, nextIssues: Issue[] = []) {
    setDraft(next)
    setIssues((current) => (sameIssues(current, nextIssues) ? current : nextIssues))
    setConfirmReset(false)
    writeStorage(storage, next)
  }

  function patch(partial: Partial<OnboardingDraft>) {
    commit({ ...draft, ...partial })
  }

  function finish() {
    commit(completeActivation(draft, now()))
  }

  function reset() {
    if (!confirmReset) {
      setConfirmReset(true)
      return
    }
    const fresh = emptyDraft()
    storage?.removeItem(STORAGE_KEY)
    commit(fresh)
    setPayNote('')
    setMarinaNote('')
  }

  const progress = formProgress(draft.step)
  const allowed = reachable(draft)
  const stepCopy = copy.steps[draft.step]

  return (
    <div className={reduced ? 'elementos elementos--still' : 'elementos'} lang="es" data-step={draft.step} data-typeface={draft.typeface}>
      <a className="elementos-skip" href="#elementos-main">Saltar al contenido</a>
      <div className="elementos-orbs" aria-hidden="true">
        <span className="elementos-orb elementos-orb--tierra" />
        <span className="elementos-orb elementos-orb--agua" />
        <span className="elementos-orb elementos-orb--fuego" />
        <span className="elementos-orb elementos-orb--aire" />
      </div>
      <div className="elementos-shell">
        <p className="elementos-banner" role="note">{copy.banner}</p>
        {progress ? (
          <ol className="elementos-progress" aria-label="Pasos del estudio">
            {FORM_STEPS.map((step, index) => {
              const open = allowed.includes(step)
              return (
                <li key={step}>
                  <button
                    type="button"
                    aria-current={step === draft.step ? 'step' : undefined}
                    disabled={!open || step === draft.step}
                    onClick={() => commit(goTo(draft, step))}
                  >
                    {index + 1}. {copy.steps[step].title}
                  </button>
                </li>
              )
            })}
          </ol>
        ) : null}
        <main id="elementos-main">
          <p className="elementos-kicker">{progress ? `Paso ${progress.index} de ${progress.total}` : '4 Elementos'}</p>
          <h1 ref={headingRef} tabIndex={-1}>{stepCopy.title}</h1>
          <p className="elementos-lede">{stepCopy.lede}</p>
          <p className="elementos-sr" id={liveId} aria-live="polite">{stepCopy.title}</p>
          {issues.length > 0 ? (
            <div className="elementos-alert" role="alert" tabIndex={-1} ref={alertRef}>
              <p>Falta algo para seguir.</p>
              <ul>
                {issues.map((issue) => <li key={issue}>{copy.issues[issue]}</li>)}
              </ul>
            </div>
          ) : null}
          {draft.step === 'welcome' ? <Welcome /> : null}
          {draft.step === 'studio' ? <Studio draft={draft} issues={issues} onChange={patch} /> : null}
          {draft.step === 'element' ? <ElementPick draft={draft} onChange={patch} /> : null}
          {draft.step === 'services' ? <Services draft={draft} onChange={patch} /> : null}
          {draft.step === 'hours' ? <Hours draft={draft} onChange={patch} /> : null}
          {draft.step === 'channels' ? <Channels draft={draft} onChange={patch} /> : null}
          {draft.step === 'payments' ? <Payments draft={draft} onChange={patch} /> : null}
          {draft.step === 'review' ? <Review draft={draft} /> : null}
          {draft.step === 'activating' ? <Activating beat={beat} /> : null}
          {draft.step === 'activated' ? (
            <Activated
              draft={draft}
              payNote={payNote}
              marinaNote={marinaNote}
              busy={busy}
              onPay={(serviceId) => void pay(serviceId, checkoutFetcher, setPayNote, setBusy)}
              onMarina={() => void ask(marinaFetcher, setMarinaNote, setBusy)}
            />
          ) : null}
          <div className="elementos-actions">
            {draft.step !== 'landing' && draft.step !== 'activated' ? (
              <button type="button" className="elementos-quiet" onClick={() => commit(goBack(draft))}>{copy.back}</button>
            ) : null}
            {draft.step === 'activating' ? (
              <button type="button" className="elementos-button" onClick={finish}>
                {reduced ? stepCopy.primary : copy.skip}
              </button>
            ) : null}
            {draft.step !== 'activating' && draft.step !== 'activated' ? (
              <button
                type="button"
                className="elementos-button"
                onClick={() => {
                  const result = goNext(draft)
                  commit(result.draft, result.issues)
                }}
              >
                {stepCopy.primary}
              </button>
            ) : null}
            {draft.step === 'activated' ? (
              <button type="button" className="elementos-quiet" onClick={reset}>
                {confirmReset ? copy.resetConfirm : copy.reset}
              </button>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  )
}

function useReducedMotion(forced: boolean | undefined): boolean {
  const [matches, setMatches] = useState(forced ?? false)
  useEffect(() => {
    if (forced !== undefined) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    setMatches(media.matches)
    const onChange = () => setMatches(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [forced])
  return forced ?? matches
}

function Welcome() {
  return (
    <ol className="elementos-list">
      <li>El nombre del estudio y quién lo abre.</li>
      <li>Los servicios de muestra y los días.</li>
      <li>WhatsApp por WAHA y llamadas por Twilio, ambos con Marina, y el cobro de prueba.</li>
    </ol>
  )
}

function Studio({
  draft,
  issues,
  onChange,
}: {
  draft: OnboardingDraft
  issues: Issue[]
  onChange: (partial: Partial<OnboardingDraft>) => void
}) {
  return (
    <>
      <label className="elementos-field">
        <span>Nombre del estudio</span>
        <input
          value={draft.studioName}
          aria-invalid={issues.includes('studio_name') || undefined}
          onChange={(event) => onChange({ studioName: event.target.value })}
          autoComplete="organization"
          maxLength={60}
        />
      </label>
      <label className="elementos-field">
        <span>Tu nombre</span>
        <input
          value={draft.ownerName}
          aria-invalid={issues.includes('owner_name') || undefined}
          onChange={(event) => onChange({ ownerName: event.target.value })}
          autoComplete="name"
          maxLength={60}
        />
      </label>
      <fieldset className="elementos-checks">
        <legend>Letra de la casa</legend>
        <label className="elementos-check">
          <input type="radio" name="typeface" checked={draft.typeface === 'jost'} onChange={() => onChange({ typeface: 'jost' })} />
          <span>A. Jost, suave y moderna <small>La opción todavía no está confirmada.</small></span>
        </label>
        <label className="elementos-check">
          <input type="radio" name="typeface" checked={draft.typeface === 'cinzel'} onChange={() => onChange({ typeface: 'cinzel' })} />
          <span>B. Cinzel para los títulos <small>Es la letra de esta muestra.</small></span>
        </label>
      </fieldset>
    </>
  )
}

function ElementPick({ draft, onChange }: { draft: OnboardingDraft; onChange: (partial: Partial<OnboardingDraft>) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Elemento que abre la casa"
      className="elementos-choices"
      onKeyDown={(event) => {
        if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) return
        event.preventDefault()
        const index = Math.max(0, ELEMENTS.indexOf(draft.element ?? ELEMENTS[0]))
        const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
        const next = ELEMENTS[(index + delta + ELEMENTS.length) % ELEMENTS.length]
        onChange({ element: next })
      }}
    >
      {ELEMENTS.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={draft.element === id}
          className="elementos-choice"
          onClick={() => onChange({ element: id })}
        >
          <strong>{elementCopy[id].name}</strong>
          <small>{elementCopy[id].line}</small>
        </button>
      ))}
    </div>
  )
}

function Services({ draft, onChange }: { draft: OnboardingDraft; onChange: (partial: Partial<OnboardingDraft>) => void }) {
  return (
    <fieldset className="elementos-checks">
      <legend>Servicios de muestra</legend>
      {DEMO_SERVICES.map((service) => {
        const checked = draft.serviceIds.includes(service.id)
        return (
          <label key={service.id} className="elementos-check">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => {
                const serviceIds = checked
                  ? draft.serviceIds.filter((id) => id !== service.id)
                  : [...draft.serviceIds, service.id]
                onChange({ serviceIds })
              }}
            />
            <span>
              {service.name} <small>{service.durationMin} min · ${service.priceMxn} MXN de muestra. {service.summary}</small>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

function Hours({ draft, onChange }: { draft: OnboardingDraft; onChange: (partial: Partial<OnboardingDraft>) => void }) {
  return (
    <fieldset className="elementos-checks">
      <legend>Días abiertos</legend>
      {WEEKDAYS.map((day) => {
        const checked = draft.days.includes(day)
        return (
          <label key={day} className="elementos-check">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => {
                const days = checked ? draft.days.filter((item) => item !== day) : [...draft.days, day]
                onChange({ days })
              }}
            />
            <span>{dayCopy[day]}</span>
          </label>
        )
      })}
    </fieldset>
  )
}

function Channels({ draft, onChange }: { draft: OnboardingDraft; onChange: (partial: Partial<OnboardingDraft>) => void }) {
  return (
    <>
      <label className="elementos-check">
        <input type="checkbox" checked={draft.whatsappEnabled} onChange={(event) => onChange({ whatsappEnabled: event.target.checked })} />
        <span>WhatsApp por WAHA, a través de Marina <small>Puedes seguir sin escribir el número.</small></span>
      </label>
      <label className="elementos-field">
        <span>Número de WhatsApp para mostrar</span>
        <input value={draft.whatsappDisplay} onChange={(event) => onChange({ whatsappDisplay: event.target.value })} inputMode="tel" autoComplete="tel" placeholder="+52…" />
      </label>
      <label className="elementos-check">
        <input type="checkbox" checked={draft.voiceEnabled} onChange={(event) => onChange({ voiceEnabled: event.target.checked })} />
        <span>Llamadas por Twilio, a través de Marina <small>Opcional. No marca a nadie en este paso.</small></span>
      </label>
      <label className="elementos-field">
        <span>Teléfono del estudio para mostrar</span>
        <input value={draft.voiceDisplay} onChange={(event) => onChange({ voiceDisplay: event.target.value })} inputMode="tel" autoComplete="tel" placeholder="+52…" />
      </label>
    </>
  )
}

function Payments({ draft, onChange }: { draft: OnboardingDraft; onChange: (partial: Partial<OnboardingDraft>) => void }) {
  return (
    <>
      <ul className="elementos-list">
        <li>El botón de cobro abre Stripe en modo prueba, si hay una llave sk_test_.</li>
        <li>Volver de Stripe no significa que el pago esté hecho. Solo el aviso firmado lo marca.</li>
        <li>Cancelar deja el pedido sin cargo. Si ya estaba pagado en prueba, no se deshace.</li>
      </ul>
      <label className="elementos-check">
        <input type="checkbox" checked={draft.paymentsAcknowledged} onChange={(event) => onChange({ paymentsAcknowledged: event.target.checked })} />
        <span>Entiendo que esto no cobra de verdad.</span>
      </label>
    </>
  )
}

function Review({ draft }: { draft: OnboardingDraft }) {
  return (
    <table className="elementos-summary">
      <tbody>
        {summary(draft).map((line) => (
          <tr key={line.label}>
            <th scope="row">{line.label}</th>
            <td>{line.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Activating({ beat }: { beat: number }) {
  return (
    <ol className="elementos-beats" aria-label="Preparación">
      {activationBeats.map((beatLabel, index) => (
        <li key={beatLabel} data-ready={beat > index ? 'true' : 'false'}>
          {beat > index ? 'Listo. ' : 'Pendiente. '}{beatLabel}
        </li>
      ))}
    </ol>
  )
}

function Activated({
  draft,
  payNote,
  marinaNote,
  busy,
  onPay,
  onMarina,
}: {
  draft: OnboardingDraft
  payNote: string
  marinaNote: string
  busy: boolean
  onPay: (serviceId: string) => void
  onMarina: () => void
}) {
  const first = DEMO_SERVICES.find((service) => draft.serviceIds.includes(service.id))
  return (
    <>
      <p className="elementos-card">Cuenta de muestra <strong>{draft.accountId}</strong>. Vive en este navegador hasta que la borres.</p>
      <div className="elementos-actions">
        <button type="button" className="elementos-button" onClick={() => first && onPay(first.id)} disabled={busy || !first}>
          {first ? `${copy.steps.activated.primary}: ${first.name}` : 'Sin servicio para cobrar'}
        </button>
        <button type="button" className="elementos-quiet" onClick={onMarina} disabled={busy}>
          Preguntarle a Marina, sin enviar WhatsApp
        </button>
      </div>
      {payNote ? <p className="elementos-note" role="status">{payNote}</p> : null}
      {marinaNote ? <p className="elementos-card" role="status">{marinaNote}</p> : null}
      <p className="elementos-note">La respuesta, si llega, usa el webhook que Marina ya tiene. Esta página no cambia sus flujos ni manda WAHA por su cuenta.</p>
    </>
  )
}

function sameIssues(left: Issue[], right: Issue[]): boolean {
  return left.length === right.length && left.every((issue, index) => issue === right[index])
}

async function pay(
  serviceId: string,
  fetcher: OnboardingAppProps['checkoutFetcher'],
  setNote: (value: string) => void,
  setBusy: (value: boolean) => void,
) {
  setBusy(true)
  setNote('')
  try {
    const result = fetcher
      ? await fetcher(serviceId)
      : await fetch('/api/4elementos/checkout', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ serviceId }),
        }).then(async (response) => (await response.json()) as { url?: string; error?: string })
    if (result.url && isCheckoutUrl(result.url)) {
      window.location.assign(result.url)
      return
    }
    if (result.url) {
      setNote(copy.pay.unsafe_checkout_url)
      return
    }
    setNote(copy.pay[result.error ?? ''] ?? copy.pay.offline)
  } catch {
    setNote(copy.pay.offline)
  } finally {
    setBusy(false)
  }
}

async function ask(
  fetcher: OnboardingAppProps['marinaFetcher'],
  setNote: (value: string) => void,
  setBusy: (value: boolean) => void,
) {
  setBusy(true)
  setNote('')
  try {
    const text = 'Hola, quiero saber cómo reservar un masaje de muestra.'
    const result = fetcher
      ? await fetcher(text)
      : await fetch('/api/4elementos/marina/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, deliver: false, language: 'es' }),
        }).then(async (response) => (await response.json()) as { reply?: string; error?: string; escalated?: boolean })
    if (result.reply) {
      setNote(result.escalated ? `Marina no pudo contestar: ${result.reply}` : `Marina: ${result.reply}`)
      return
    }
    setNote(copy.pay[result.error ?? ''] ?? copy.pay.marina_not_configured)
  } catch {
    setNote(copy.pay.offline)
  } finally {
    setBusy(false)
  }
}
