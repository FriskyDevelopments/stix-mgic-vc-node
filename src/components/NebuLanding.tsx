import { Users, Waveform, Record, ArrowRight, Camera, SpeakerHigh, Heart } from '@phosphor-icons/react'
import { ASHY_UNIT_PATH, NEBU_BRAND, NEBU_LOGIN_URL, nebuBrandStyle } from '@/lib/nebu-ashy-walkthrough'
import '@/styles/nebu-motion.css'

const STUDIO_URL = '/login'
const LOGIN_URL = NEBU_LOGIN_URL
const ASHY_WALKTHROUGH_URL = ASHY_UNIT_PATH
const DONATE_URL = 'https://ko-fi.com/friskypup'
const CRYPTO_DONATE_URL = 'https://nowpayments.io/donation/Frisky'

const PARTS = [
  { n: '01', title: 'Studio', blurb: 'Find your frame.', color: 'var(--nebu-yellow)', icon: Camera, ink: true },
  { n: '02', title: 'Sound', blurb: 'Set the mood.', color: 'var(--nebu-violet)', icon: SpeakerHigh, ink: false },
  { n: '03', title: 'Rooms', blurb: 'Bring people in.', color: 'var(--nebu-cyan)', icon: Users, ink: true },
  { n: '04', title: 'Record', blurb: 'Keep the good bits.', color: 'var(--nebu-paper)', icon: Record, ink: true },
] as const

const STEPS = [
  { n: '01', title: 'Prepare.', body: 'Open the studio. Choose your camera, microphone and sources.' },
  { n: '02', title: 'Preview.', body: 'Find the frame. Balance the sound. Check what you’re about to share.' },
  { n: '03', title: 'Share.', body: 'Open your room, invite your people, or record a take for later.' },
] as const

const TICKER = ['Your camera', 'Your music', 'Your room', 'Your NEBU'] as const

function NebuMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <g fill="currentColor">
        <rect x="3" y="4" width="10" height="1.5" />
        <rect x="3" y="7.25" width="10" height="1.5" />
        <rect x="3" y="10.5" width="10" height="1.5" />
      </g>
    </svg>
  )
}

export function NebuLanding() {
  return (
    <div
      className="min-h-screen overflow-x-clip text-white"
      style={{
        ...nebuBrandStyle(),
        backgroundColor: 'var(--nebu-night)',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div
          className="nebu-blob absolute -left-24 top-16 h-[22rem] w-[22rem] rounded-full blur-3xl opacity-20"
          style={{ backgroundColor: 'var(--nebu-violet)' }}
        />
        <div
          className="nebu-blob nebu-blob-delay absolute -right-16 bottom-0 h-[18rem] w-[18rem] rounded-full blur-3xl opacity-12"
          style={{ backgroundColor: 'var(--nebu-cyan)' }}
        />
      </div>

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between border-b border-[var(--nebu-hairline)] px-5 py-3 sm:px-8">
        <div className="flex items-center gap-2" style={{ color: 'var(--nebu-yellow)' }}>
          <NebuMark size={18} />
          <span className="text-sm font-black tracking-[0.18em] uppercase">NEBU</span>
          <span className="hidden text-[10px] font-bold tracking-[0.16em] uppercase text-[var(--nebu-smoke)] sm:inline">
            · console
          </span>
        </div>
        <nav className="flex items-center gap-3 text-[10px] font-bold tracking-[0.14em] uppercase">
          <a href="#studio" className="hidden text-[var(--nebu-ash)] transition hover:text-white sm:inline">
            01 Studio
          </a>
          <a href={ASHY_WALKTHROUGH_URL} className="hidden text-[var(--nebu-ash)] transition hover:text-white sm:inline">
            02 Ashy
          </a>
          <a href="#support" className="hidden text-[var(--nebu-ash)] transition hover:text-white sm:inline">
            03 Support
          </a>
          <a href={LOGIN_URL} className="text-[var(--nebu-ash)] transition hover:text-white">
            Sign in
          </a>
        </nav>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl gap-8 px-5 pb-10 pt-6 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-10">
          <div>
            <p className="nebu-rise nebu-rise-1 nebu-kicker mb-3">00 / Control surface</p>
            <h1 className="nebu-rise nebu-rise-2 text-4xl font-black leading-[0.95] tracking-tight sm:text-6xl">
              Set the{' '}
              <span className="inline-flex items-center gap-2">
                scene
                <span style={{ color: 'var(--nebu-yellow)' }}>
                  <NebuMark size={28} />
                </span>
              </span>
              .
            </h1>
            <p className="nebu-rise nebu-rise-3 mt-4 max-w-md text-base font-semibold leading-6 text-white sm:text-lg">
              A browser studio to prepare, preview, and share.
            </p>
            <p className="nebu-rise nebu-rise-3 mt-2 max-w-md text-sm leading-6 text-[var(--nebu-ash)] sm:text-base">
              Your scene. Your sound. Your people. For the things you want to put out into the world.
            </p>
            <div className="nebu-rise nebu-rise-4 mt-6 flex flex-wrap items-center gap-3">
              <a
                href={STUDIO_URL}
                className="nebu-cta inline-flex min-h-11 items-center gap-2 rounded-md px-5 text-xs font-black uppercase tracking-wide"
                style={{ backgroundColor: 'var(--nebu-yellow)', color: 'var(--nebu-ink)' }}
              >
                Open your studio
                <ArrowRight size={16} weight="bold" />
              </a>
              <a href="#studio" className="text-xs font-bold text-[var(--nebu-ash)] underline-offset-4 hover:underline">
                Take a look around
              </a>
              <a
                href={ASHY_WALKTHROUGH_URL}
                className="text-xs font-bold text-[var(--nebu-ash)] underline-offset-4 hover:underline"
              >
                Like Ashy’s room
              </a>
            </div>
          </div>

          <div className="nebu-hero-art nebu-float relative mx-auto w-full max-w-md">
            <p
              className="nebu-hero-badge absolute left-2 top-2 z-10 rounded-md border border-[var(--nebu-hairline)] px-2.5 py-1.5 text-center"
              style={{ backgroundColor: 'var(--nebu-panel)', color: 'var(--nebu-paper)' }}
            >
              <span className="block text-[9px] font-bold tracking-[0.14em] uppercase text-[var(--nebu-smoke)]">
                Cam · Mic · Room
              </span>
              <strong className="text-xs font-black tracking-tight">Preview bus</strong>
            </p>
            <div className="nebu-hero-frame nebu-console" style={{ color: 'var(--nebu-paper)' }}>
              <div className="nebu-console-bar">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--nebu-ash)' }} />
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--nebu-ash)' }} />
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--nebu-yellow)' }} />
                </span>
                <span>NEBU / studio monitor</span>
                <span>+</span>
              </div>
              <div
                className="relative mx-1 mb-1 aspect-[4/3] overflow-hidden rounded-md"
                style={{ backgroundColor: 'color-mix(in srgb, var(--nebu-violet) 35%, var(--nebu-night))' }}
              >
                <div
                  className="absolute -right-8 -top-10 h-36 w-36 rounded-full border-[10px] opacity-40"
                  style={{ borderColor: 'var(--nebu-yellow)' }}
                />
                <div
                  className="absolute -bottom-16 -left-12 h-40 w-40 rounded-full opacity-30"
                  style={{ backgroundColor: 'var(--nebu-cyan)' }}
                />
                <div className="absolute inset-0 flex items-end justify-between p-4">
                  <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-[var(--nebu-paper)]">
                    00 / in your element
                  </p>
                  <span
                    className="nebu-live-pulse rounded px-2 py-0.5 text-[10px] font-black tracking-[0.14em] uppercase"
                    style={{ backgroundColor: 'var(--nebu-live)', color: 'var(--nebu-ink)' }}
                  >
                    LIVE
                  </span>
                </div>
              </div>
              <div className="grid gap-2 px-3 pb-3 pt-1">
                <div className="nebu-meter">
                  Cam
                  <i>
                    <span style={{ width: '72%' }} />
                  </i>
                </div>
                <div className="nebu-meter">
                  Mic
                  <i>
                    <span style={{ width: '48%', backgroundColor: 'var(--nebu-yellow)' }} />
                  </i>
                </div>
                <div className="nebu-meter">
                  Room
                  <i>
                    <span style={{ width: '31%', backgroundColor: 'var(--nebu-violet)' }} />
                  </i>
                </div>
              </div>
            </div>
            <p
              className="nebu-hero-badge absolute bottom-2 left-2 right-24 z-10 flex items-center gap-2 rounded-md border border-[var(--nebu-hairline)] px-2.5 py-1.5"
              style={{ backgroundColor: 'var(--nebu-panel)', color: 'var(--nebu-paper)' }}
            >
              <SpeakerHigh size={14} weight="fill" style={{ color: 'var(--nebu-cyan)' }} />
              <span className="text-[9px] font-black uppercase leading-tight tracking-tight">
                Sound bus
                <br />
                <span className="text-[var(--nebu-ash)]">Idle · ready</span>
              </span>
            </p>
            <p
              className="nebu-hero-badge absolute bottom-14 right-2 z-10 flex h-16 w-16 flex-col items-center justify-center rounded-md border border-[var(--nebu-hairline)] text-center"
              style={{ backgroundColor: 'var(--nebu-panel)', color: 'var(--nebu-paper)' }}
            >
              <Users size={14} weight="fill" style={{ color: 'var(--nebu-ash)' }} />
              <span className="mt-1 text-[8px] font-bold uppercase leading-tight text-[var(--nebu-smoke)]">
                People
                <br />
                <strong className="text-[10px] font-black text-[var(--nebu-paper)]">Standby</strong>
              </span>
            </p>
          </div>
        </section>

        <div className="nebu-ticker" role="presentation">
          <div className="nebu-ticker-track">
            <div className="nebu-ticker-group">
              {TICKER.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            <div className="nebu-ticker-group" aria-hidden="true">
              {TICKER.map((item) => (
                <span key={`dup-${item}`}>{item}</span>
              ))}
            </div>
          </div>
        </div>

        <section id="studio" className="px-5 py-12 sm:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="nebu-kicker">01 / Meet your studio</p>
                <h2 className="mt-2 max-w-xl text-3xl font-black tracking-tight sm:text-4xl">
                  All the parts.
                  <br />
                  <span className="text-[var(--nebu-smoke)]">One place to play.</span>
                </h2>
              </div>
              <p className="nebu-body-copy max-w-sm text-sm leading-6 text-white/90">
                Bring your picture, sound and people together. Check your scene before you share it.
              </p>
            </div>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PARTS.map(({ n, title, blurb, color, icon: Icon, ink }) => (
                <a
                  key={title}
                  href={STUDIO_URL}
                  className="nebu-card block rounded-xl border border-[var(--nebu-hairline)] p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                  style={{
                    backgroundColor: color,
                    color: ink ? 'var(--nebu-ink)' : '#fff',
                    outlineColor: 'var(--nebu-cyan)',
                  }}
                  aria-label={`Open studio — ${title}: ${blurb}`}
                >
                  <div className="flex items-center justify-between text-[10px] font-black tracking-[0.16em] uppercase opacity-70">
                    <span>{n}</span>
                    <Icon size={20} weight="fill" />
                  </div>
                  <h3 className="mt-4 text-lg font-black">{title}</h3>
                  <p className="mt-1 text-sm font-medium opacity-80">{blurb}</p>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:px-8 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="nebu-kicker">02 / From idea to scene</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Get into
              <br />
              your element.
            </h2>
            <ol className="mt-7 space-y-5">
              {STEPS.map((step) => (
                <li key={step.n} className="flex gap-3">
                  <span className="text-xs font-black" style={{ color: 'var(--nebu-yellow)' }}>
                    {step.n}
                  </span>
                  <div>
                    <h3 className="text-xl font-black">{step.title}</h3>
                    <p className="nebu-body-copy mt-1 max-w-sm text-sm leading-6 text-white/90">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="nebu-card nebu-console relative p-6">
            <div className="flex items-center gap-3 text-[var(--nebu-ash)]">
              <Camera size={18} weight="fill" style={{ color: 'var(--nebu-yellow)' }} />
              <Waveform size={18} style={{ color: 'var(--nebu-cyan)' }} />
              <Users size={18} style={{ color: 'var(--nebu-violet)' }} />
            </div>
            <p className="nebu-kicker mt-6">NEBU / in the studio</p>
            <p className="mt-2 text-2xl font-black leading-tight">Picture · Sound · People</p>
            <p className="nebu-body-copy mt-3 text-sm leading-6 text-white/90">
              Bring your picture, sound and people together. Check your scene before you share it.
            </p>
            <a
              href={STUDIO_URL}
              className="nebu-cta mt-6 inline-flex min-h-10 items-center gap-2 rounded-md px-4 text-[11px] font-black uppercase tracking-wide"
              style={{ backgroundColor: 'var(--nebu-yellow)', color: 'var(--nebu-ink)' }}
            >
              Start creating
              <ArrowRight size={14} weight="bold" />
            </a>
          </div>
        </section>

        <section id="support" className="px-5 pb-6 sm:px-8">
          <div className="nebu-console mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <p className="nebu-kicker" style={{ color: 'var(--nebu-cyan)' }}>
                03 / Keep it going
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                Keep the scene running.
              </h2>
              <p className="nebu-body-copy mt-3 max-w-lg text-sm leading-6 text-white/90">
                Camera, sound, rooms, and a take you can keep — all in the browser. Hosting and the
                next build still cost something. A coffee is enough.
              </p>
              <p className="mt-2 text-xs font-bold text-[var(--nebu-smoke)]">Optional. Always.</p>
            </div>
            <div className="flex flex-col items-start gap-3">
              <a
                href={DONATE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="nebu-cta inline-flex min-h-11 items-center gap-2 rounded-md px-5 text-xs font-black uppercase tracking-wide"
                style={{ backgroundColor: 'var(--nebu-violet)', color: '#fff' }}
              >
                <Heart size={16} weight="fill" />
                Support NEBU
                <ArrowRight size={16} weight="bold" />
              </a>
              <p className="text-[11px] leading-5 text-[var(--nebu-smoke)]">
                Donation link:{' '}
                <a href={DONATE_URL} className="underline underline-offset-2 hover:text-white/70">
                  ko-fi.com/friskypup
                </a>
                {' · '}
                <a href={CRYPTO_DONATE_URL} className="underline underline-offset-2 hover:text-white/70">
                  Crypto
                </a>
              </p>
            </div>
          </div>
        </section>

        <section className="px-5 pb-14 sm:px-8">
          <div
            className="nebu-card mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 rounded-xl border border-[var(--nebu-ink)] px-6 py-6 sm:flex-row sm:items-center"
            style={{ backgroundColor: 'var(--nebu-yellow)', color: 'var(--nebu-ink)' }}
          >
            <div>
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase opacity-70">
                You’ve got something. Let it out.
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
                Your next scene starts here.
              </h2>
            </div>
            <a
              href={STUDIO_URL}
              className="nebu-cta inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md bg-[var(--nebu-ink)] px-5 text-xs font-black uppercase tracking-wide text-white"
            >
              Open your studio
              <ArrowRight size={16} weight="bold" />
            </a>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-[var(--nebu-hairline)] px-5 py-6 text-center text-[11px] text-[var(--nebu-smoke)] sm:px-8">
        NEBU · nebu.quest · {NEBU_BRAND.line}{' '}
        <a href={DONATE_URL} className="text-[var(--nebu-ash)] underline-offset-2 hover:text-white hover:underline">
          Support
        </a>
      </footer>
    </div>
  )
}

export default NebuLanding
