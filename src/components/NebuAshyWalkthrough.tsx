import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Sparkle } from '@phosphor-icons/react'
import {
  ASHY_SCENES,
  ASHY_UNIT,
  BEFORE_YOU_START,
  NEBU_BRAND,
  NEBU_LOGIN_URL,
  PIPE_LABELS,
  STUDIO_URL,
  nebuBrandStyle,
  actProgress,
  getScene,
  isTelegramUnlocked,
  nextSceneId,
  prevSceneId,
  type ChecklistItem,
  type WalkthroughCta,
  type WalkthroughPipe,
  type WalkthroughScene,
} from '@/lib/nebu-ashy-walkthrough'
import '@/styles/nebu-ashy-walkthrough.css'

const PIPE_ORDER: WalkthroughPipe[] = ['local_preview', 'room_output', 'telegram_broadcast']

function statusLabel(status: string): string {
  if (status === 'active') return 'Focus'
  if (status === 'done') return 'Done'
  if (status === 'locked') return 'Locked'
  return 'Idle'
}

function CtaButton({
  cta,
  onAdvance,
  variant = 'primary',
}: {
  cta: WalkthroughCta
  onAdvance?: () => void
  variant?: 'primary' | 'ghost' | 'violet'
}) {
  const className = [
    'nebu-ashy__btn',
    variant === 'ghost' ? 'is-ghost' : '',
    variant === 'violet' ? 'is-violet' : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (cta.href.startsWith('#')) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => onAdvance?.()}
        title={cta.note}
      >
        {cta.label}
        <ArrowRight size={16} weight="bold" />
      </button>
    )
  }

  return (
    <a className={className} href={cta.href} title={cta.note}>
      {cta.label}
      {cta.kind === 'stub' ? ' · soon' : null}
      <ArrowRight size={16} weight="bold" />
    </a>
  )
}

function PipeStrip({ scene }: { scene: WalkthroughScene }) {
  return (
    <div className="nebu-ashy__pipes" aria-label="Keep these three outputs separate">
      {PIPE_ORDER.map((pipe) => {
        const meta = PIPE_LABELS[pipe]
        const status = scene.pipes[pipe]
        return (
          <article key={pipe} className="nebu-ashy__pipe" data-status={status}>
            <p className="nebu-ashy__pipe-title">
              {meta.title}
              <span className="nebu-ashy__pipe-status">{statusLabel(status)}</span>
            </p>
            <p>{meta.blurb}</p>
          </article>
        )
      })}
    </div>
  )
}

function Checklist({
  checked,
  onToggle,
}: {
  checked: Record<string, boolean>
  onToggle: (item: ChecklistItem) => void
}) {
  return (
    <ul className="nebu-ashy__checklist" aria-label="Before you start">
      {BEFORE_YOU_START.map((item) => {
        const isOn = Boolean(checked[item.id])
        return (
          <li key={item.id}>
            <button
              type="button"
              aria-pressed={isOn}
              aria-label={`${isOn ? 'Uncheck' : 'Check'} ${item.label}`}
              onClick={() => onToggle(item)}
            >
              {isOn ? <Check size={12} weight="bold" /> : null}
            </button>
            <span>{item.label}</span>
            {item.optional ? <small>Optional</small> : null}
          </li>
        )
      })}
    </ul>
  )
}

function UnitCards() {
  return (
    <div className="nebu-ashy__unit" aria-label="Ashy unit choices">
      <div className="nebu-ashy__unit-card">
        <strong>BYO Telegram</strong>
        <span>You own the bot. Paste the BotFather token once in the vault — never here.</span>
      </div>
      <div className="nebu-ashy__unit-card">
        <strong>FriskyDev hosted unit</strong>
        <span>We run the bot. Ashy’s example:</span>
        <code>
          {ASHY_UNIT.hostedUnitId} · {ASHY_UNIT.botDisplay}
        </code>
      </div>
    </div>
  )
}

export function NebuAshyWalkthrough() {
  const [sceneId, setSceneId] = useState(ASHY_SCENES[0].id)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const scene = getScene(sceneId) ?? ASHY_SCENES[0]
  const progress = actProgress(scene.id)
  const nextId = nextSceneId(scene.id)
  const prevId = prevSceneId(scene.id)
  const telegramOpen = isTelegramUnlocked(scene.id)

  const notes = useMemo(() => {
    const list = [scene.primaryCta?.note, scene.secondaryCta?.note].filter(Boolean) as string[]
    return list
  }, [scene])

  function goNext() {
    if (nextId) setSceneId(nextId)
  }

  function goPrev() {
    if (prevId) setSceneId(prevId)
  }

  function toggleItem(item: ChecklistItem) {
    setChecked((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
  }

  return (
    <div className="nebu-ashy" style={nebuBrandStyle()}>
      <div className="nebu-ashy__shell">
        <header className="nebu-ashy__top">
          <a className="nebu-ashy__brand" href="/welcome" aria-label="NEBU home">
            <Sparkle size={18} weight="fill" color={NEBU_BRAND.yellow} />
            <strong>NEBU</strong>
            <span>Ashy unit · {ASHY_UNIT.slug}</span>
          </a>
          <nav className="nebu-ashy__nav" aria-label="Quick links">
            <a className="nebu-ashy__chip" href={NEBU_LOGIN_URL}>
              NEBU sign in
            </a>
            <a className="nebu-ashy__chip is-yellow" href={STUDIO_URL}>
              Open studio
            </a>
          </nav>
        </header>

        <section className="nebu-ashy__hero">
          <p className="nebu-ashy__kicker">00 / Ashy unit · control path</p>
          <h1>
            {NEBU_BRAND.line.replace(/\.$/, '')}
            <em>.</em>
          </h1>
          <p className="nebu-ashy__sub">
            Your Telegram. FriskyDev ID. A unit we host. Walk Ashy’s path: local preview, then a
            private room with one helper, then dens — never all at once.
          </p>
          <p className="nebu-ashy__cta-line">{NEBU_BRAND.cta}</p>
          <PipeStrip scene={scene} />
          {scene.practiceRule ? (
            <p className="nebu-ashy__rule" role="note">
              Practice rule: finish Act I (sign in → devices → private room + Leave) before Telegram
              or OBS.
              {!telegramOpen ? ' Telegram stays locked until then.' : ' Act I done — dens practice is unlocked.'}
            </p>
          ) : null}
        </section>

        <div className="nebu-ashy__progress" aria-hidden="true">
          {ASHY_SCENES.map((entry, index) => (
            <span
              key={entry.id}
              className={
                index === progress.overallIndex
                  ? 'is-current'
                  : index < progress.overallIndex
                    ? 'is-seen'
                    : undefined
              }
            />
          ))}
        </div>

        <div className="nebu-ashy__grid">
          <aside className="nebu-ashy__panel">
            <p className="nebu-ashy__meta">
              {scene.actLabel} · {progress.stepInAct}/{progress.actLength}
            </p>
            <h2>{scene.title}</h2>
            <p className="nebu-ashy__body">{scene.body}</p>

            {scene.id === 'prep' ? (
              <Checklist checked={checked} onToggle={toggleItem} />
            ) : null}

            {scene.id === 'act-ii-unit-type' || scene.id === 'act-ii-connect' ? <UnitCards /> : null}

            {scene.optionalTip ? (
              <p className="nebu-ashy__tip" role="note">
                Optional tip: {scene.optionalTip}
              </p>
            ) : null}

            <div className="nebu-ashy__actions">
              <button
                type="button"
                className="nebu-ashy__btn is-ghost"
                onClick={goPrev}
                disabled={!prevId}
              >
                <ArrowLeft size={16} weight="bold" />
                Back
              </button>
              {scene.primaryCta ? (
                <CtaButton
                  cta={scene.primaryCta}
                  onAdvance={goNext}
                  variant="primary"
                />
              ) : null}
              {scene.secondaryCta ? (
                <CtaButton
                  cta={scene.secondaryCta}
                  onAdvance={goNext}
                  variant="violet"
                />
              ) : null}
              {nextId && scene.primaryCta && !scene.primaryCta.href.startsWith('#') ? (
                <button type="button" className="nebu-ashy__btn is-ghost" onClick={goNext}>
                  Next scene
                  <ArrowRight size={16} weight="bold" />
                </button>
              ) : null}
            </div>
            {notes.map((note) => (
              <p key={note} className="nebu-ashy__note">
                {note}
              </p>
            ))}
          </aside>

          <section className="nebu-ashy__panel" aria-label="Scene map">
            <p className="nebu-ashy__meta">Scene map · {scene.sceneLabel}</p>
            <h2>Ashy’s practice path.</h2>
            <p className="nebu-ashy__body">
              Same discipline as the VC Node guide for Ashy. Preview on your device. Room for the
              helper. Telegram as its own pipe. Stop and Leave before “go live.”
            </p>
            <ul className="nebu-ashy__checklist">
              {ASHY_SCENES.map((entry) => {
                const active = entry.id === scene.id
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      aria-label={`Go to ${entry.title}`}
                      onClick={() => setSceneId(entry.id)}
                    >
                      {active || sceneIndexDone(entry.id, scene.id) ? (
                        <Check size={12} weight="bold" />
                      ) : null}
                    </button>
                    <span>
                      {entry.sceneLabel}: {entry.title}
                    </span>
                    <small>{entry.act === 'prep' ? 'Prep' : entry.act.replace('_', ' ').toUpperCase()}</small>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>

        <footer className="nebu-ashy__footer">
          Marketing on <a href="https://nebu.quest">nebu.quest</a> · Studio on{' '}
          <a href={STUDIO_URL}>vc.friskydev.com</a> · Unit slug <code>{ASHY_UNIT.slug}</code> · No
          token secrets on this page.
        </footer>
      </div>
    </div>
  )
}

function sceneIndexDone(candidateId: string, currentId: string): boolean {
  const candidate = ASHY_SCENES.findIndex((scene) => scene.id === candidateId)
  const current = ASHY_SCENES.findIndex((scene) => scene.id === currentId)
  return candidate >= 0 && current >= 0 && candidate < current
}

export default NebuAshyWalkthrough
