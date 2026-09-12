import { Play, Users, Waveform, Record, ArrowRight, Camera, SpeakerHigh, Heart } from '@phosphor-icons/react'
import '@/styles/nebu-motion.css'

const BG = '#0d081a'
const YELLOW = '#f5e000'
const PURPLE = '#9026ff'
const CYAN = '#6bd9ff'
const INK = '#0c021a'
const PAPER = '#f7f5f2'
const PANEL = '#160b2a'

const STUDIO_URL = '/login'
const LOGIN_URL = '/login'
const ASHY_WALKTHROUGH_URL = '/units/ashy'
const DONATE_URL = 'https://ko-fi.com/friskypup'
const CRYPTO_DONATE_URL = 'https://nowpayments.io/donation/Frisky'

const PARTS = [
  { ch: '01', title: 'Studio', blurb: 'Find your frame.', color: YELLOW, icon: Camera },
  { ch: '02', title: 'Sound', blurb: 'Set the mood.', color: PURPLE, icon: SpeakerHigh },
  { ch: '03', title: 'Rooms', blurb: 'Bring people in.', color: CYAN, icon: Users },
  { ch: '04', title: 'Record', blurb: 'Keep the good bits.', color: PAPER, icon: Record },
] as const

const STEPS = [
  { n: '01', title: 'Prepare.', body: 'Open the studio. Choose your camera, microphone and sources.' },
  { n: '02', title: 'Preview.', body: 'Find the frame. Balance the sound. Check what you’re about to share.' },
  { n: '03', title: 'Share.', body: 'Open your room, invite your people, or record a take for later.' },
] as const

const TICKER = ['Your camera', 'Your music', 'Your room', 'Your NEBU'] as const

const NAV = [
  { href: '#studio', label: 'Studio', hideMobile: true },
  { href: ASHY_WALKTHROUGH_URL, label: 'Walkthrough', hideMobile: true },
  { href: '#support', label: 'Support', hideMobile: true },
  { href: LOGIN_URL, label: 'Sign in', hideMobile: false },
] as const

function NebuMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <title>NEBU</title>
      <g fill={YELLOW}>
        <rect x="3" y="4" width="10" height="1.5" />
        <rect x="3" y="7.25" width="10" height="1.5" />
        <rect x="3" y="10.5" width="10" height="1.5" />
      </g>
    </svg>
  )
}

function Kicker({ children }: { children: string }) {
  return <p className="nebu-kicker">{children}</p>
}

function ChannelMeter({ label, color, fill }: { label: string; color: string; fill: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-mono text-[9px] font-bold tracking-[0.16em] uppercase text-white/45">{label}</span>
      <span className="h-1.5 overflow-hidden rounded-sm bg-white/10">
        <span className="block h-full" style={{ width: fill, backgroundColor: color }} />
      </span>
    </div>
  )
}

export function NebuLanding() {
  return (
    <div
      className="nebu-console min-h-screen overflow-x-hidden text-white"
      style={{ backgroundColor: BG, fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div
          className="nebu-blob absolute -left-24 top-16 h-[22rem] w-[22rem] rounded-full blur-3xl opacity-25"
          style={{ backgroundColor: PURPLE }}
        />
        <div
          className="nebu-blob nebu-blob-delay absolute -right-16 bottom-0 h-[18rem] w-[18rem] rounded-full blur-3xl opacity-20"
          style={{ backgroundColor: CYAN }}
        />
        <div
          className="nebu-blob absolute left-1/2 top-1/3 h-40 w-40 -translate-x-1/2 rounded-full blur-3xl opacity-10"
          style={{ backgroundColor: YELLOW }}
        />
      </div>

      <header className="relative z-10 border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <NebuMark />
            <span className="text-sm font-black tracking-[0.18em] uppercase">NEBU</span>
            <span className="hidden font-mono text-[10px] font-bold tracking-[0.18em] uppercase text-white/40 sm:inline">
              · Console
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-2 font-mono text-[10px] font-bold tracking-[0.16em] uppercase text-white/45 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CYAN }} />
              Ready
            </span>
            <nav className="flex items-center gap-3 font-mono text-[10px] font-bold tracking-[0.16em] uppercase">
              {NAV.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className={`${item.hideMobile ? 'hidden sm:inline' : ''} text-white/60 transition hover:text-white`}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl gap-8 px-5 pb-10 pt-6 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-10 lg:pt-10">
          <div>
            <Kicker>00 / YOUR BROWSER. YOUR STAGE.</Kicker>
            <h1 className="nebu-rise nebu-rise-2 mt-3 text-4xl font-black leading-[0.92] tracking-tight sm:text-6xl">
              Set the scene.
            </h1>
            <p className="nebu-rise nebu-rise-3 mt-4 max-w-md text-base font-semibold leading-6 text-white sm:text-lg">
              A browser studio to prepare, preview, and share.
            </p>
            <p className="nebu-rise nebu-rise-3 mt-2 max-w-md text-sm leading-6 text-white/65 sm:text-base">
              Your scene. Your sound. Your people. For the things you want to put out into the world.
            </p>
            <div className="nebu-rise nebu-rise-4 mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
              <a
                href={STUDIO_URL}
                className="nebu-cta inline-flex min-h-11 items-center gap-2 rounded-md px-5 text-xs font-black uppercase tracking-[0.14em]"
                style={{ backgroundColor: YELLOW, color: INK }}
              >
                Open your studio
                <ArrowRight size={16} weight="bold" />
              </a>
              <a href="#studio" className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-white/70 underline-offset-4 hover:underline">
                Take a look around
              </a>
              <a
                href={ASHY_WALKTHROUGH_URL}
                className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-white/70 underline-offset-4 hover:underline"
              >
                Like Ashy’s room
              </a>
            </div>
          </div>

          <div className="nebu-hero-art nebu-float relative mx-auto w-full max-w-md">
            <p
              className="nebu-hero-badge absolute left-2 top-2 z-10 rounded-sm border border-black/80 px-2.5 py-1.5 shadow-[3px_3px_0_#000]"
              style={{ backgroundColor: PAPER, color: INK }}
            >
              <span className="block font-mono text-[9px] font-bold tracking-[0.14em] uppercase">CH 01 / CAM</span>
              <strong className="text-xs font-black tracking-tight">Preview</strong>
            </p>
            <div
              className="nebu-hero-frame overflow-hidden rounded-md border border-white/15 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
              style={{ backgroundColor: PANEL, color: '#fff' }}
            >
              <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#ff5f56' }} />
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: YELLOW }} />
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#22c55e' }} />
                </span>
                <span className="font-mono text-[10px] font-bold tracking-[0.16em] uppercase text-white/50">
                  NEBU / PREVIEW
                </span>
                <span
                  className="nebu-live-pulse rounded-sm px-2 py-0.5 font-mono text-[9px] font-black tracking-[0.14em] uppercase text-black"
                  style={{ backgroundColor: '#22c55e' }}
                >
                  LIVE
                </span>
              </div>
              <div className="relative mx-1 mb-1 aspect-[16/10] overflow-hidden rounded-sm" style={{ backgroundColor: PURPLE }}>
                <div
                  className="absolute -right-8 -top-10 h-32 w-32 rounded-full border-[12px]"
                  style={{ borderColor: YELLOW, boxShadow: `inset 0 0 0 3px ${INK}` }}
                />
                <div
                  className="absolute -bottom-14 -left-10 h-36 w-36 rounded-full border border-black"
                  style={{ backgroundColor: CYAN }}
                />
                <div className="absolute inset-0 flex items-end justify-between p-3">
                  <p className="font-mono text-[9px] font-bold tracking-[0.16em] uppercase text-black">
                    01 / in your element
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 border-t border-white/10 px-3 py-2.5">
                <ChannelMeter label="Cam" color={YELLOW} fill="78%" />
                <ChannelMeter label="Mic" color={CYAN} fill="62%" />
                <ChannelMeter label="Room" color={PURPLE} fill="44%" />
              </div>
            </div>
            <p
              className="nebu-hero-badge absolute bottom-2 left-2 z-10 flex items-center gap-2 rounded-sm border border-black px-2.5 py-1.5 shadow-[4px_4px_0_#000]"
              style={{ backgroundColor: CYAN, color: INK }}
            >
              <SpeakerHigh size={14} weight="fill" />
              <span className="font-mono text-[9px] font-black uppercase leading-tight tracking-[0.08em]">
                Aud / Ready
              </span>
            </p>
            <p
              className="nebu-hero-badge absolute bottom-14 right-2 z-10 flex items-center gap-1.5 rounded-sm border border-black px-2.5 py-1.5 shadow-[3px_3px_0_#000]"
              style={{ backgroundColor: YELLOW, color: INK }}
            >
              <Users size={14} weight="fill" />
              <span className="font-mono text-[9px] font-black uppercase leading-tight tracking-[0.08em]">
                Room / Open
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

        <section id="studio" className="px-5 py-12 sm:px-8 sm:py-14">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <Kicker>01 / MEET YOUR STUDIO</Kicker>
                <h2 className="mt-2 max-w-xl text-3xl font-black tracking-tight sm:text-4xl">
                  All the parts.
                  <span className="text-white/45"> One place to play.</span>
                </h2>
              </div>
              <p className="nebu-body-copy max-w-sm text-sm leading-6 text-white/90">
                Bring your picture, sound and people together. Check your scene before you share it.
              </p>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PARTS.map(({ ch, title, blurb, color, icon: Icon }) => (
                <a
                  key={title}
                  href={STUDIO_URL}
                  className="nebu-card nebu-module block rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                  style={{ outlineColor: CYAN }}
                  aria-label={`Open studio — ${title}: ${blurb}`}
                >
                  <span className="nebu-module-rail" style={{ backgroundColor: color }} />
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-bold tracking-[0.16em] uppercase text-white/45">
                      CH {ch}
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                  </span>
                  <Icon size={22} weight="fill" style={{ color }} />
                  <h3 className="mt-4 text-lg font-black tracking-tight">{title}</h3>
                  <p className="mt-1 text-sm font-medium text-white/70">{blurb}</p>
                  <span className="mt-4 inline-flex items-center gap-1 font-mono text-[10px] font-bold tracking-[0.16em] uppercase text-white/45">
                    Open
                    <ArrowRight size={12} weight="bold" />
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:px-8 sm:py-14 lg:grid-cols-2 lg:items-start">
          <div>
            <Kicker>02 / FROM IDEA TO SCENE</Kicker>
            <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Get into your element.
            </h2>
            <ol className="mt-6 divide-y divide-white/10 border-y border-white/10">
              {STEPS.map((step) => (
                <li key={step.n} className="flex gap-4 py-4">
                  <span className="w-8 shrink-0 font-mono text-[11px] font-black" style={{ color: YELLOW }}>
                    {step.n}
                  </span>
                  <div>
                    <h3 className="text-xl font-black tracking-tight">{step.title}</h3>
                    <p className="nebu-body-copy mt-1 max-w-sm text-sm leading-6 text-white/90">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div
            className="nebu-card relative overflow-hidden rounded-md border border-white/15 p-6"
            style={{ backgroundColor: PANEL }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex items-center gap-3">
                <Play size={18} weight="fill" style={{ color: YELLOW }} />
                <Waveform size={18} style={{ color: CYAN }} />
                <Users size={18} style={{ color: PURPLE }} />
              </div>
              <span className="font-mono text-[10px] font-bold tracking-[0.16em] uppercase text-white/40">
                Rack / 02
              </span>
            </div>
            <p className="nebu-kicker mt-5">NEBU / IN THE STUDIO</p>
            <p className="mt-2 text-2xl font-black leading-tight">Picture · Sound · People</p>
            <p className="nebu-body-copy mt-3 text-sm leading-6 text-white/90">
              Bring your picture, sound and people together. Check your scene before you share it.
            </p>
            <a
              href={STUDIO_URL}
              className="nebu-cta mt-6 inline-flex min-h-10 items-center gap-2 rounded-md px-4 text-[11px] font-black uppercase tracking-[0.14em]"
              style={{ backgroundColor: YELLOW, color: INK }}
            >
              Start creating
              <ArrowRight size={14} weight="bold" />
            </a>
          </div>
        </section>

        <section id="support" className="px-5 pb-6 sm:px-8">
          <div
            className="mx-auto grid max-w-6xl gap-6 overflow-hidden rounded-md border border-white/15 p-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:p-7"
            style={{ backgroundColor: PANEL }}
          >
            <div>
              <Kicker>03 / KEEP IT GOING</Kicker>
              <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                Keep the scene running.
              </h2>
              <p className="nebu-body-copy mt-3 max-w-lg text-sm leading-6 text-white/90">
                Camera, sound, rooms, and a take you can keep — all in the browser. Hosting and the
                next build still cost something. A coffee is enough.
              </p>
              <p className="mt-2 font-mono text-[10px] font-bold tracking-[0.14em] uppercase text-white/40">
                Optional. Always.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3">
              <a
                href={DONATE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="nebu-cta inline-flex min-h-11 items-center gap-2 rounded-md px-5 text-xs font-black uppercase tracking-[0.14em]"
                style={{ backgroundColor: PURPLE, color: '#fff' }}
              >
                <Heart size={16} weight="fill" />
                Support NEBU
                <ArrowRight size={16} weight="bold" />
              </a>
              <p className="text-xs leading-5 text-white/40">
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
            className="nebu-card mx-auto flex max-w-6xl flex-col items-start justify-between gap-5 rounded-md border border-black px-6 py-6 sm:flex-row sm:items-center sm:px-7"
            style={{ backgroundColor: YELLOW, color: INK }}
          >
            <div>
              <p className="font-mono text-[10px] font-bold tracking-[0.18em] uppercase opacity-70">
                04 / OPEN STUDIO
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
                Your next scene starts here.
              </h2>
            </div>
            <a
              href={STUDIO_URL}
              className="nebu-cta inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md bg-black px-5 text-xs font-black uppercase tracking-[0.14em] text-white"
            >
              Open your studio
              <ArrowRight size={16} weight="bold" />
            </a>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10 px-5 py-5 text-center font-mono text-[10px] tracking-[0.12em] uppercase text-white/45 sm:px-8">
        NEBU · nebu.quest · Set the scene.{' '}
        <a href={DONATE_URL} className="text-white/55 underline-offset-2 hover:text-white hover:underline">
          Support
        </a>
      </footer>
    </div>
  )
}

export default NebuLanding
