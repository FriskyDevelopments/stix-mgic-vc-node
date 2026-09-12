import { Sparkle, Play, Users, Waveform, Record, ArrowRight, Camera, SpeakerHigh, Heart } from '@phosphor-icons/react'
import '@/styles/nebu-motion.css'

const BG = '#0d081a'
const YELLOW = '#f5e000'
const PURPLE = '#9026ff'
const CYAN = '#6bd9ff'
const INK = '#0c021a'
const PAPER = '#f7f5f2'

const STUDIO_URL = '/login'
const LOGIN_URL = '/login'
const ASHY_WALKTHROUGH_URL = '/units/ashy'
const DONATE_URL = 'https://ko-fi.com/friskypup'
const CRYPTO_DONATE_URL = 'https://nowpayments.io/donation/Frisky'

const PARTS = [
  { title: 'Studio', blurb: 'Find your frame.', color: YELLOW, icon: Camera, ink: true },
  { title: 'Sound', blurb: 'Set the mood.', color: PURPLE, icon: SpeakerHigh, ink: false },
  { title: 'Rooms', blurb: 'Bring people in.', color: CYAN, icon: Users, ink: true },
  { title: 'Record', blurb: 'Keep the good bits.', color: '#fff', icon: Record, ink: true },
] as const

const STEPS = [
  { n: '01', title: 'Prepare.', body: 'Open the studio. Choose your camera, microphone and sources.' },
  { n: '02', title: 'Preview.', body: 'Find the frame. Balance the sound. Check what you’re about to share.' },
  { n: '03', title: 'Share.', body: 'Open your room, invite your people, or record a take for later.' },
] as const

const TICKER = ['Your camera', 'Your music', 'Your room', 'Your NEBU'] as const

export function NebuLanding() {
  return (
    <div
      className="min-h-screen overflow-x-clip text-white"
      style={{ backgroundColor: BG, fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div
          className="nebu-blob absolute -left-24 top-16 h-[28rem] w-[28rem] rounded-full blur-3xl opacity-35"
          style={{ backgroundColor: PURPLE }}
        />
        <div
          className="nebu-blob nebu-blob-delay absolute -right-16 bottom-0 h-[24rem] w-[24rem] rounded-full blur-3xl opacity-25"
          style={{ backgroundColor: CYAN }}
        />
        <div
          className="nebu-blob absolute left-1/2 top-1/3 h-48 w-48 -translate-x-1/2 rounded-full blur-3xl opacity-15"
          style={{ backgroundColor: YELLOW }}
        />
      </div>

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <div className="flex items-center gap-2">
          <Sparkle size={22} weight="fill" className="nebu-spark" style={{ color: YELLOW }} />
          <span className="text-xl font-black tracking-tight uppercase">NEBU</span>
        </div>
        <nav className="flex items-center gap-3 text-sm font-bold">
          <a href="#studio" className="hidden text-white/70 transition hover:text-white sm:inline">
            Look around
          </a>
          <a href={ASHY_WALKTHROUGH_URL} className="hidden text-white/70 transition hover:text-white sm:inline">
            Ashy’s walkthrough
          </a>
          <a href="#support" className="hidden text-white/70 transition hover:text-white sm:inline">
            Support
          </a>
          <a href={LOGIN_URL} className="text-white/70 transition hover:text-white">
            Sign in
          </a>
        </nav>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-14">
          <div>
            <p className="nebu-rise nebu-rise-1 mb-4 text-[11px] font-bold tracking-[0.2em] uppercase text-white/55">
              Your browser. Your stage.
            </p>
            <h1 className="nebu-rise nebu-rise-2 text-5xl font-black leading-[0.95] tracking-tight sm:text-7xl">
              Set the{' '}
              <span className="inline-flex items-center gap-2">
                scene
                <Sparkle size={36} weight="fill" className="nebu-spark" style={{ color: CYAN }} />
              </span>
              .
            </h1>
            <p className="nebu-rise nebu-rise-3 mt-5 max-w-md text-lg font-semibold leading-7 text-white sm:text-xl">
              A browser studio to prepare, preview, and share.
            </p>
            <p className="nebu-rise nebu-rise-3 mt-3 max-w-md text-base leading-7 text-white/65 sm:text-lg">
              Your scene. Your sound. Your people. For the things you want to put out into the world.
            </p>
            <div className="nebu-rise nebu-rise-4 mt-8 flex flex-wrap items-center gap-4">
              <a
                href={STUDIO_URL}
                className="nebu-cta inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-sm font-black uppercase tracking-wide"
                style={{ backgroundColor: YELLOW, color: INK }}
              >
                Open your studio
                <ArrowRight size={18} weight="bold" />
              </a>
              <a href="#studio" className="text-sm font-bold text-white/70 underline-offset-4 hover:underline">
                Take a look around
              </a>
              <a
                href={ASHY_WALKTHROUGH_URL}
                className="text-sm font-bold text-white/70 underline-offset-4 hover:underline"
              >
                Like Ashy’s room
              </a>
            </div>
          </div>

          <div className="nebu-hero-art nebu-float relative mx-auto w-full max-w-md">
            <p
              className="nebu-hero-badge absolute left-2 top-2 z-10 rounded-md border-2 border-black px-3 py-2 text-center shadow-[3px_4px_0_#000]"
              style={{ backgroundColor: PAPER, color: INK }}
            >
              <span className="block text-[9px] font-bold tracking-[0.12em] uppercase">Picture. Sound.</span>
              <strong className="text-sm font-black tracking-tight">A little you.</strong>
            </p>
            <div
              className="nebu-hero-frame overflow-hidden rounded-[1.75rem] border-2 border-black shadow-[8px_8px_0_#000]"
              style={{ backgroundColor: PAPER, color: INK }}
            >
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full border border-black" />
                  <span className="h-2.5 w-2.5 rounded-full border border-black" />
                  <span className="h-2.5 w-2.5 rounded-full border border-black" />
                </span>
                <span className="text-[10px] font-bold tracking-[0.16em] uppercase">THE NEXT GOOD THING</span>
                <span className="text-lg leading-none">+</span>
              </div>
              <div className="relative mx-1 mb-1 aspect-[4/3] overflow-hidden rounded-2xl" style={{ backgroundColor: PURPLE }}>
                <div
                  className="absolute -right-8 -top-10 h-36 w-36 rounded-full border-[14px]"
                  style={{ borderColor: YELLOW, boxShadow: `inset 0 0 0 3px ${INK}` }}
                />
                <div
                  className="absolute -bottom-16 -left-12 h-40 w-40 rounded-full border-2 border-black"
                  style={{ backgroundColor: CYAN }}
                />
                <div className="absolute inset-0 flex items-end justify-between p-5">
                  <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-black">
                    01 / in your element
                  </p>
                  <span
                    className="nebu-live-pulse rounded-full px-3 py-1 text-[10px] font-black tracking-[0.14em] uppercase text-black"
                    style={{ backgroundColor: '#22c55e' }}
                  >
                    LIVE
                  </span>
                </div>
              </div>
            </div>
            <p
              className="nebu-hero-badge absolute bottom-2 left-2 right-16 z-10 flex items-center gap-2 rounded-2xl border-2 border-black px-3 py-2 shadow-[5px_6px_0_#000]"
              style={{ backgroundColor: CYAN, color: INK }}
            >
              <SpeakerHigh size={18} weight="fill" />
              <span className="text-[10px] font-black uppercase leading-tight tracking-tight">
                Sound on
                <br />
                World out
              </span>
            </p>
            <p
              className="nebu-hero-badge absolute bottom-16 right-2 z-10 flex h-24 w-24 flex-col items-center justify-center rounded-full border-2 border-black text-center shadow-[4px_4px_0_#000]"
              style={{ backgroundColor: '#b7ff2a', color: INK }}
            >
              <Users size={18} weight="fill" />
              <span className="mt-1 text-[9px] font-bold uppercase leading-tight">
                Bring your
                <br />
                <strong className="text-sm font-black">people.</strong>
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

        <section id="studio" className="px-5 py-20 sm:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-white/50">
                  01 / Meet your studio
                </p>
                <h2 className="mt-3 max-w-xl text-4xl font-black tracking-tight sm:text-5xl">
                  All the parts.
                  <br />
                  <span className="text-white/50">One place to play.</span>
                </h2>
              </div>
              <p className="nebu-body-copy max-w-sm text-base leading-7 text-white/90">
                Bring your picture, sound and people together. Check your scene before you share it.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PARTS.map(({ title, blurb, color, icon: Icon, ink }) => (
                <a
                  key={title}
                  href={STUDIO_URL}
                  className="nebu-card block rounded-3xl border-2 border-black p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                  style={{
                    backgroundColor: color,
                    color: ink ? INK : '#fff',
                    outlineColor: CYAN,
                  }}
                  aria-label={`Open studio — ${title}: ${blurb}`}
                >
                  <Icon size={28} weight="fill" />
                  <h3 className="mt-6 text-xl font-black">{title}</h3>
                  <p className="mt-1 text-sm font-medium opacity-80">{blurb}</p>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* Steps */}
        <section className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-white/50">
              03 / From idea to scene
            </p>
            <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
              Get into
              <br />
              your element.
            </h2>
            <ol className="mt-10 space-y-8">
              {STEPS.map((step) => (
                <li key={step.n} className="flex gap-4">
                  <span className="text-sm font-black" style={{ color: YELLOW }}>
                    {step.n}
                  </span>
                  <div>
                    <h3 className="text-2xl font-black">{step.title}</h3>
                    <p className="nebu-body-copy mt-1 max-w-sm text-sm leading-6 text-white/90">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div
            className="nebu-card relative overflow-hidden rounded-[2rem] border-2 border-black p-8 shadow-[10px_10px_0_#000]"
            style={{ backgroundColor: '#160b2a' }}
          >
            <div className="flex items-center gap-3">
              <Play size={22} weight="fill" style={{ color: YELLOW }} />
              <Waveform size={22} style={{ color: CYAN }} />
              <Users size={22} style={{ color: PURPLE }} />
            </div>
            <p className="mt-8 text-[11px] font-bold tracking-[0.18em] uppercase text-white/50">
              NEBU / in the studio
            </p>
            <p className="mt-2 text-3xl font-black leading-tight">
              Picture · Sound · People
            </p>
            <p className="nebu-body-copy mt-4 text-sm leading-6 text-white/90">
              Bring your picture, sound and people together. Check your scene before you share it.
            </p>
            <a
              href={STUDIO_URL}
              className="nebu-cta mt-8 inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-xs font-black uppercase tracking-wide"
              style={{ backgroundColor: YELLOW, color: INK }}
            >
              Start creating
              <ArrowRight size={16} weight="bold" />
            </a>
          </div>
        </section>

        {/* Support / donate promo */}
        <section id="support" className="px-5 pb-8 sm:px-8">
          <div className="mx-auto grid max-w-6xl gap-8 overflow-hidden rounded-[2rem] border-2 border-black bg-[#160b2a] p-8 shadow-[10px_10px_0_#000] lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <p className="text-[11px] font-bold tracking-[0.2em] uppercase" style={{ color: CYAN }}>
                04 / Keep it going
              </p>
              <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
                Keep the scene running.
              </h2>
              <p className="nebu-body-copy mt-4 max-w-lg text-base leading-7 text-white/90">
                Camera, sound, rooms, and a take you can keep — all in the browser. Hosting and the
                next build still cost something. A coffee is enough.
              </p>
              <p className="mt-3 text-sm font-bold text-white/50">Optional. Always.</p>
            </div>
            <div className="flex flex-col items-start gap-4">
              <a
                href={DONATE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="nebu-cta inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-sm font-black uppercase tracking-wide"
                style={{ backgroundColor: PURPLE, color: '#fff' }}
              >
                <Heart size={18} weight="fill" />
                Support NEBU
                <ArrowRight size={18} weight="bold" />
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

        {/* Final CTA */}
        <section className="px-5 pb-20 sm:px-8">
          <div
            className="nebu-card mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-[2rem] border-2 border-black px-8 py-10 sm:flex-row sm:items-center"
            style={{ backgroundColor: YELLOW, color: INK }}
          >
            <div>
              <p className="text-[11px] font-bold tracking-[0.18em] uppercase opacity-70">
                You’ve got something. Let it out.
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                Your next scene starts here.
              </h2>
            </div>
            <a
              href={STUDIO_URL}
              className="nebu-cta inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-black px-6 text-sm font-black uppercase tracking-wide text-white"
            >
              Open your studio
              <ArrowRight size={18} weight="bold" />
            </a>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10 px-5 py-8 text-center text-xs text-white/50 sm:px-8">
        NEBU · nebu.quest · Set the scene.{' '}
        <a href={DONATE_URL} className="text-white/55 underline-offset-2 hover:text-white hover:underline">
          Support
        </a>
      </footer>
    </div>
  )
}

export default NebuLanding
