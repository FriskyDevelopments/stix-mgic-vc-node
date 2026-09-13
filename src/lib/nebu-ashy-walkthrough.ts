/**
 * NEBU Ashy mega-easy walkthrough — step model.
 * Same discipline as Ashy’s VC Node Implementation Guide:
 * keep Local preview, Room output, and Telegram broadcast separate.
 * No bot tokens or secrets belong here.
 */

export const ASHY_UNIT = {
  slug: 'ashy',
  displayName: 'Ashy Slashy',
  telegramHandle: '@Ashy6942',
  hostedUnitId: '8888816358',
  botDisplay: '@kimi_Friskydev_bot',
} as const

export const NEBU_BRAND = {
  night: '#0B001A',
  yellow: '#FFD100',
  violet: '#7A4FB8',
  cyan: '#5EA8B8',
  ash: '#9A93A0',
  paper: '#F4F1EC',
  ink: '#0C021A',
  smoke: '#8B8494',
  panel: '#16121F',
  hairline: '#3C3646',
  danger: '#B57A7A',
  live: '#7A9B86',
  line: 'Set the scene.',
  cta: "Like Ashy’s room — BYO Telegram or take a FriskyDev hosted unit.",
} as const

/** CSS custom properties sourced from NEBU_BRAND — apply on landing, walkthrough, host chrome. */
export const NEBU_CSS_VARS = {
  '--nebu-night': NEBU_BRAND.night,
  '--nebu-bg': NEBU_BRAND.night,
  '--nebu-bg-2': NEBU_BRAND.panel,
  '--nebu-yellow': NEBU_BRAND.yellow,
  '--nebu-purple': NEBU_BRAND.violet,
  '--nebu-violet': NEBU_BRAND.violet,
  '--nebu-cyan': NEBU_BRAND.cyan,
  '--nebu-ash': NEBU_BRAND.ash,
  '--nebu-paper': NEBU_BRAND.paper,
  '--nebu-ink': NEBU_BRAND.ink,
  '--nebu-smoke': NEBU_BRAND.smoke,
  '--nebu-panel': NEBU_BRAND.panel,
  '--nebu-hairline': NEBU_BRAND.hairline,
  '--nebu-danger': NEBU_BRAND.danger,
  '--nebu-live': NEBU_BRAND.live,
} as const

export function nebuBrandStyle(): Record<string, string> {
  return { ...NEBU_CSS_VARS }
}

export const STUDIO_URL = 'https://vc.friskydev.com'
export const NEBU_LOGIN_URL = '/login'
export const NEBU_MARKETING_URL = 'https://nebu.quest'
export const ASHY_UNIT_PATH = '/units/ashy'

/** The three pipes Ashy’s guide insists stay separate in the UI. */
export type WalkthroughPipe = 'local_preview' | 'room_output' | 'telegram_broadcast'

export type PipeStatus = 'active' | 'idle' | 'locked' | 'done'

export type WalkthroughActId = 'prep' | 'act_i' | 'act_ii' | 'act_iii'

export type WalkthroughCtaKind = 'real' | 'stub'

export type WalkthroughCta = {
  label: string
  /** Absolute or app-relative URL when kind is real; informative when stub. */
  href: string
  kind: WalkthroughCtaKind
  /** Short honesty note for stubs (e.g. "Opens studio — paste token only in vault"). */
  note?: string
}

export type WalkthroughScene = {
  id: string
  act: WalkthroughActId
  actLabel: string
  sceneLabel: string
  title: string
  body: string
  /** Which pipe is the focus of this scene. */
  focusPipe: WalkthroughPipe
  pipes: Record<WalkthroughPipe, PipeStatus>
  primaryCta?: WalkthroughCta
  secondaryCta?: WalkthroughCta
  /** Shown after private room succeeds — optional late tip only. */
  optionalTip?: string
  /** Practice rule callout (finish Act I before Telegram/OBS). */
  practiceRule?: boolean
}

export type ChecklistItem = {
  id: string
  label: string
  optional?: boolean
}

export const BEFORE_YOU_START: ChecklistItem[] = [
  { id: 'headphones', label: 'Headphones' },
  { id: 'stable_link', label: 'Stable link' },
  { id: 'short_clip', label: 'Short test clip' },
  { id: 'account', label: 'Sign-in account ready' },
  { id: 'helper', label: 'One helper on standby' },
  { id: 'obs', label: 'OBS (optional)', optional: true },
]

export const PIPE_LABELS: Record<WalkthroughPipe, { title: string; blurb: string }> = {
  local_preview: {
    title: 'Local preview',
    blurb: 'Checking a source on your device. Preview alone sends nothing.',
  },
  room_output: {
    title: 'Room output',
    blurb: 'What people in the browser room actually receive.',
  },
  telegram_broadcast: {
    title: 'Telegram broadcast',
    blurb: 'Separate pipe into an existing Telegram call / dens.',
  },
}

const LOCKED_TELEGRAM: Record<WalkthroughPipe, PipeStatus> = {
  local_preview: 'idle',
  room_output: 'idle',
  telegram_broadcast: 'locked',
}

export const ASHY_SCENES: WalkthroughScene[] = [
  {
    id: 'prep',
    act: 'prep',
    actLabel: 'Before you start',
    sceneLabel: 'Checklist',
    title: 'Gather the basics.',
    body: 'Headphones, a stable link, a short test clip, your sign-in account, and one helper. OBS stays optional until the room path works.',
    focusPipe: 'local_preview',
    pipes: { ...LOCKED_TELEGRAM, local_preview: 'active' },
    primaryCta: {
      label: 'Start Act I',
      href: '#act-i-sign-in',
      kind: 'real',
      note: 'Advances the walkthrough — no Telegram yet.',
    },
    practiceRule: true,
  },
  {
    id: 'act-i-sign-in',
    act: 'act_i',
    actLabel: 'Act I — Set the scene',
    sceneLabel: 'Scene 1',
    title: 'Sign in.',
    body: 'Open NEBU / VC Node. Creators can continue with NEBU social login. Operators use FriskyDev ID on the studio. These identities stay separate — never collapse them.',
    focusPipe: 'local_preview',
    pipes: { ...LOCKED_TELEGRAM, local_preview: 'active' },
    primaryCta: {
      label: 'NEBU sign in',
      href: NEBU_LOGIN_URL,
      kind: 'real',
      note: 'NEBU Better Auth (consumer). Not FriskyDev ID.',
    },
    secondaryCta: {
      label: 'Open studio (FriskyDev ID)',
      href: STUDIO_URL,
      kind: 'real',
      note: 'Operators only — Authentik / FriskyDev ID on vc.friskydev.com.',
    },
    practiceRule: true,
  },
  {
    id: 'act-i-devices',
    act: 'act_i',
    actLabel: 'Act I — Set the scene',
    sceneLabel: 'Scene 2',
    title: 'Check cam & mic.',
    body: 'Allow permissions. Speak. Watch levels. Success: preview moves, mic reacts. Hearing yourself in speakers is optional. This step does not join a room.',
    focusPipe: 'local_preview',
    pipes: { local_preview: 'active', room_output: 'idle', telegram_broadcast: 'locked' },
    primaryCta: {
      label: 'Open device setup in studio',
      href: STUDIO_URL,
      kind: 'real',
      note: 'Studio Room studio → Set up camera & microphone.',
    },
    practiceRule: true,
  },
  {
    id: 'act-i-private-room',
    act: 'act_i',
    actLabel: 'Act I — Set the scene',
    sceneLabel: 'Scene 3',
    title: 'Private room + helper.',
    body: 'Open a room → Copy invite → one helper joins. Confirm picture and sound both ways. Leave when done.',
    focusPipe: 'room_output',
    pipes: { local_preview: 'done', room_output: 'active', telegram_broadcast: 'locked' },
    primaryCta: {
      label: 'Open room controls in studio',
      href: STUDIO_URL,
      kind: 'real',
      note: 'Create a private room, copy invite, practice Leave.',
    },
    optionalTip:
      'After the room works: from host controls you can mute, kick, pin, or end the call for the dens group — optional late tip only.',
    practiceRule: true,
  },
  {
    id: 'act-ii-unit-type',
    act: 'act_ii',
    actLabel: 'Act II — Bring the dens',
    sceneLabel: 'Scene 4',
    title: 'BYO vs Hosted.',
    body: `Bring your own Telegram bot (~$9–19/mo) or take a FriskyDev hosted unit (~$29–49/mo). Ashy’s example hosted unit is ${ASHY_UNIT.hostedUnitId} (${ASHY_UNIT.botDisplay}). Never paste a BotFather token in chat.`,
    focusPipe: 'telegram_broadcast',
    pipes: { local_preview: 'done', room_output: 'done', telegram_broadcast: 'active' },
    primaryCta: {
      label: 'Choose Hosted (Ashy example)',
      href: '#act-ii-connect',
      kind: 'stub',
      note: `Hosted unit ${ASHY_UNIT.hostedUnitId} — FriskyDev already runs the bot. No token needed here.`,
    },
    secondaryCta: {
      label: 'Choose BYO Telegram',
      href: '#act-ii-connect',
      kind: 'stub',
      note: 'Paste the BotFather token only in the NEBU vault / Wrangler secret — never in this walkthrough.',
    },
  },
  {
    id: 'act-ii-connect',
    act: 'act_ii',
    actLabel: 'Act II — Bring the dens',
    sceneLabel: 'Scene 5',
    title: 'Connect.',
    body: 'BYO: paste the token once in setup (secret vault). Hosted: attach the Ashy-style unit; FriskyDev already runs the bot. Display name only — no secrets on screen.',
    focusPipe: 'telegram_broadcast',
    pipes: { local_preview: 'done', room_output: 'done', telegram_broadcast: 'active' },
    primaryCta: {
      label: `Attach hosted ${ASHY_UNIT.hostedUnitId}`,
      href: STUDIO_URL,
      kind: 'stub',
      note: `Connects to ${ASHY_UNIT.botDisplay} when the hosted unit API is live. Studio opens for handoff.`,
    },
  },
  {
    id: 'act-ii-dens-practice',
    act: 'act_ii',
    actLabel: 'Act II — Bring the dens',
    sceneLabel: 'Scene 6',
    title: 'First dens practice + stop.',
    body: 'One short practice: governed invite or existing call path. Helper confirms. Stop broadcast. Leave room. Go live only after this works.',
    focusPipe: 'telegram_broadcast',
    pipes: { local_preview: 'done', room_output: 'done', telegram_broadcast: 'active' },
    primaryCta: {
      label: 'Practice dens in studio',
      href: STUDIO_URL,
      kind: 'real',
      note: 'Stop cleanly before any “go live.”',
    },
  },
  {
    id: 'act-iii-ops',
    act: 'act_iii',
    actLabel: 'Act III — Keep it alive',
    sceneLabel: 'Scene 7',
    title: 'FriskyDev ID ops.',
    body: 'Operator signs in with FriskyDev ID → manages the unit, rotates a BYO token in the vault, opens studio. Product NEBU login stays on nebu.quest.',
    focusPipe: 'room_output',
    pipes: { local_preview: 'done', room_output: 'active', telegram_broadcast: 'done' },
    primaryCta: {
      label: 'Operator studio (FriskyDev ID)',
      href: STUDIO_URL,
      kind: 'real',
      note: 'Authentik / FriskyDev ID — not NEBU Better Auth.',
    },
  },
  {
    id: 'act-iii-persistent-scene',
    act: 'act_iii',
    actLabel: 'Act III — Keep it alive',
    sceneLabel: 'Scene 8',
    title: 'Make it once. Keep it alive.',
    body: 'Persistent scene config per unit. Ashy’s unit is the template seed — same slug, same hosted example id.',
    focusPipe: 'room_output',
    pipes: { local_preview: 'done', room_output: 'active', telegram_broadcast: 'done' },
    primaryCta: {
      label: 'Open Ashy unit again',
      href: ASHY_UNIT_PATH,
      kind: 'real',
    },
  },
  {
    id: 'act-iii-cutover',
    act: 'act_iii',
    actLabel: 'Act III — Keep it alive',
    sceneLabel: 'Scene 9',
    title: 'nebu.quest vs vc.friskydev.com.',
    body: 'Marketing lives on nebu.quest (brand). Studio lives on vc.friskydev.com. Cloudflare hosts the SaaS edge. Cut over when ready — identities stay on their own planes.',
    focusPipe: 'room_output',
    pipes: { local_preview: 'done', room_output: 'active', telegram_broadcast: 'done' },
    primaryCta: {
      label: 'Visit nebu.quest',
      href: NEBU_MARKETING_URL,
      kind: 'real',
    },
    secondaryCta: {
      label: 'Open studio',
      href: STUDIO_URL,
      kind: 'real',
    },
  },
]

export const ACT_ORDER: WalkthroughActId[] = ['prep', 'act_i', 'act_ii', 'act_iii']

export function sceneIndex(sceneId: string): number {
  return ASHY_SCENES.findIndex((scene) => scene.id === sceneId)
}

export function getScene(sceneId: string): WalkthroughScene | undefined {
  return ASHY_SCENES.find((scene) => scene.id === sceneId)
}

export function nextSceneId(sceneId: string): string | null {
  const index = sceneIndex(sceneId)
  if (index < 0 || index >= ASHY_SCENES.length - 1) return null
  return ASHY_SCENES[index + 1].id
}

export function prevSceneId(sceneId: string): string | null {
  const index = sceneIndex(sceneId)
  if (index <= 0) return null
  return ASHY_SCENES[index - 1].id
}

/** Act I must finish before Telegram / OBS practice (Ashy guide rule). */
export function isTelegramUnlocked(sceneId: string): boolean {
  const index = sceneIndex(sceneId)
  if (index < 0) return false
  const scene = ASHY_SCENES[index]
  return scene.act === 'act_ii' || scene.act === 'act_iii'
}

export function actProgress(sceneId: string): {
  act: WalkthroughActId
  stepInAct: number
  actLength: number
  overallIndex: number
  overallLength: number
} {
  const overallIndex = Math.max(0, sceneIndex(sceneId))
  const scene = ASHY_SCENES[overallIndex]
  const actScenes = ASHY_SCENES.filter((entry) => entry.act === scene.act)
  const stepInAct = actScenes.findIndex((entry) => entry.id === scene.id) + 1
  return {
    act: scene.act,
    stepInAct,
    actLength: actScenes.length,
    overallIndex,
    overallLength: ASHY_SCENES.length,
  }
}

export function pipesForScene(sceneId: string): Record<WalkthroughPipe, PipeStatus> {
  const scene = getScene(sceneId)
  return scene?.pipes ?? { ...LOCKED_TELEGRAM }
}
