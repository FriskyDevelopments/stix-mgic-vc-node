import { Sparkle, Play, Users, Waveform, Record, ArrowRight, Camera, SpeakerHigh, Heart } from '@phosphor-icons/react'
import '@/styles/nebu-motion.css'

const BG = '#0d081a'
const YELLOW = '#f5e000'
const PURPLE = '#9026ff'
const CYAN = '#6bd9ff'
const INK = '#0c021a'

const STUDIO_URL = 'https://vc.friskydev.com'
const LOGIN_URL = '/login'
const DONATE_URL = 'https://nowpayments.io/donation/Frisky'

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

export function NebuLanding() {
  return (
    <div
      className="min-h-screen text-white"
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
          <a href="#support" className="hidden text-white/70 transition hover:text-white sm:inline">
            Support
          </a>
          <a
            href={LOGIN_URL}
            className="nebu-cta rounded-full px-4 py-2 text-[12px] tracking-wide uppercase"
            style={{ backgroundColor: YELLOW, color: INK }}
          >
            Sign in
          </a>
        </nav>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-14">
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
            <p className="nebu-rise nebu-rise-3 mt-5 max-w-md text-base leading-7 text-white/65 sm:text-lg">
              Your scene. Your sound. Your people. A browser studio for the things you want to put
              out into the world.
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
            </div>
          </div>

          <div className="nebu-float relative mx-auto w-full max-w-md">
            <div
              className="overflow-hidden rounded-[1.75rem] border-2 border-black shadow-[8px_8px_0_#000]"
              style={{ backgroundColor: '#160b2a' }}
            >
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                <span className="ml-2 text-[10px] font-bold tracking-[0.16em] uppercase text-white/40">
                  NEBU / scene
                </span>
              </div>
              <div className="relative aspect-[4/3] p-5">
                <div
                  className="absolute inset-5 rounded-2xl opacity-90"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(144,38,255,0.55), rgba(107,217,255,0.25) 45%, rgba(245,224,0,0.35))',
                  }}
                />
                <div className="absolute bottom-8 left-8 right-8 flex items-end justify-between">
                  <div>
                    <p className="text-xs font-bold tracking-[0.18em] uppercase text-white/70">Picture</p>
                    <p className="text-2xl font-black">Find your frame.</p>
                  </div>
                  <span
                    className="nebu-live-pulse rounded-full px-3 py-1 text-[10px] font-black tracking-[0.14em] uppercase text-black"
                    style={{ backgroundColor: '#22c55e' }}
                  >
                    LIVE
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Parts */}
        <section id="studio" className="bg-white px-5 py-20 text-black sm:px-8">
          <div className="mx-auto max-w-6xl">
            <p className="text-[11px] font-bold tracking-[0.2em] uppercase" style={{ color: PURPLE }}>
              01 / Meet your studio
            </p>
            <h2 className="mt-3 max-w-xl text-4xl font-black tracking-tight sm:text-5xl">
              All the parts.
              <br />
              One place to play.
            </h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PARTS.map(({ title, blurb, color, icon: Icon, ink }) => (
                <article
                  key={title}
                  className="nebu-card rounded-3xl border-2 border-black p-5"
                  style={{ backgroundColor: color, color: ink ? INK : '#fff' }}
                >
                  <Icon size={28} weight="fill" />
                  <h3 className="mt-6 text-xl font-black">{title}</h3>
                  <p className="mt-1 text-sm font-medium opacity-80">{blurb}</p>
                </article>
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
                    <p className="mt-1 max-w-sm text-sm leading-6 text-white/60">{step.body}</p>
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
            <p className="mt-8 text-[11px] font-bold tracking-[0.18em] uppercase text-white/45">
              NEBU / in the studio
            </p>
            <p className="mt-2 text-3xl font-black leading-tight">
              Picture · Sound · People
            </p>
            <p className="mt-4 text-sm leading-6 text-white/55">
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
                04 / Keep the lights on
              </p>
              <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
                Keep the studio lit.
              </h2>
              <p className="mt-4 max-w-lg text-base leading-7 text-white/65">
                If NEBU is useful, you can keep it going. Camera, sound, rooms, and local recording
                stay in your browser. A tip covers hosting, domains, and the next scene.
              </p>
              <p className="mt-3 text-sm font-bold text-white/45">
                No ads. No install tax. Just the studio — and the people who keep it running.
              </p>
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
                Donate
                <ArrowRight size={18} weight="bold" />
              </a>
              <p className="text-xs leading-5 text-white/40">
                Donation link:{' '}
                <a href={DONATE_URL} className="underline underline-offset-2 hover:text-white/70">
                  nowpayments.io/donation/Frisky
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
              Get started
              <ArrowRight size={18} weight="bold" />
            </a>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10 px-5 py-8 text-center text-xs text-white/40 sm:px-8">
        NEBU · nebu.quest · Set the scene.{' '}
        <a href={DONATE_URL} className="text-white/55 underline-offset-2 hover:text-white hover:underline">
          Donate
        </a>
      </footer>
    </div>
  )
}

export default NebuLanding
