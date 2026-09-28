import { z } from 'zod'

export const OVERLAY_SCHEMA_VERSION = 1 as const
export const OVERLAY_LIMITS = {
  screens: 64,
  layersPerScreen: 200,
  textLength: 2000,
  jsonLength: 2_000_000,
  canvasSize: 8192,
} as const

export const DEFAULT_OVERLAY_TOKENS = {
  ink: '#111a1c', paper: '#f5f2ec', mint: '#70c8ac', line: '#334144',
} as const

/** Local font stacks only. A pack cannot request a font URL or inject CSS. */
export const OVERLAY_FONTS = {
  sans: 'Arial, sans-serif',
  serif: 'Georgia, serif',
  mono: 'Courier New, monospace',
} as const

export const OVERLAY_TEXT_BINDINGS = ['session.title', 'host.name', 'guest.name', 'track.title', 'track.artist', 'scene.title'] as const
export type OverlayTextBinding = typeof OVERLAY_TEXT_BINDINGS[number]
export type OverlayValues = Partial<Record<OverlayTextBinding, string>>
export const STARTER_SCREEN_TITLES = [
  'Starting Soon', 'Live Camera', 'Just Chatting', 'Screen Share', 'Presentation',
  'Interview', 'Guest Spotlight', 'Panel', 'Co-host', 'Music Session', 'DJ Set',
  'Now Playing', 'Intermission', 'Be Right Back', 'Technical Pause', 'Countdown',
  'Announcement', 'Credits', 'Ending', 'Offline',
] as const

export function isValidOverlayText(value: string): boolean {
  for (const character of value) {
    const point = character.codePointAt(0)!
    if ((point < 32 && point !== 10) || point === 127 || point === 0xfffe || point === 0xffff || (point >= 0xd800 && point <= 0xdfff)) return false
  }
  return true
}

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/, 'Use 1–64 letters, numbers, hyphens or underscores.')
const metadataText = z.string().max(120).refine((value) => isValidOverlayText(value) && !value.includes('\n'), 'Use a single line of valid plain text.')
const hexColor = z.string().regex(/^#[\da-fA-F]{6}(?:[\da-fA-F]{2})?$/, 'Use a six- or eight-digit hex color.')
const color = z.union([z.enum(['ink', 'paper', 'mint', 'line', 'transparent']), hexColor])
const coordinate = z.number().finite().min(0).max(OVERLAY_LIMITS.canvasSize)
const bounds = z.object({
  unit: z.enum(['px', 'normalized']),
  x: coordinate,
  y: coordinate,
  width: coordinate,
  height: coordinate,
}).strict()
const baseLayer = {
  id,
  bounds,
  opacity: z.number().finite().min(0).max(1).optional(),
  visible: z.boolean().optional(),
}
const strokeWidth = z.number().finite().positive().max(64)

const layerSchema = z.discriminatedUnion('type', [
  z.object({
    ...baseLayer,
    type: z.literal('rect'),
    fill: color,
    stroke: color.optional(),
    strokeWidth: strokeWidth.optional(),
    radius: z.number().finite().min(0).max(1024).optional(),
  }).strict(),
  z.object({
    ...baseLayer,
    type: z.literal('text'),
    text: z.string().max(OVERLAY_LIMITS.textLength).refine(
      isValidOverlayText,
      'Use plain text with optional line breaks, without invalid Unicode or control characters.',
    ),
    binding: z.enum(OVERLAY_TEXT_BINDINGS).optional(),
    color,
    fontFamily: z.enum(['sans', 'serif', 'mono']),
    fontSize: z.number().finite().min(1).max(512),
    fontWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)]).optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
  }).strict(),
  z.object({
    ...baseLayer,
    type: z.literal('line'),
    color,
    strokeWidth,
  }).strict(),
])

const packSchema = z.object({
  schemaVersion: z.literal(OVERLAY_SCHEMA_VERSION),
  packId: id,
  version: z.string().regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/, 'Use a major.minor.patch version.'),
  title: metadataText.min(1),
  author: metadataText,
  status: z.enum(['draft', 'ready']),
  /** A declaration for inventory, not a license grant or legal assessment. */
  commercialStatus: z.enum(['unreviewed', 'approved', 'restricted']),
  canvas: z.object({
    width: z.number().int().min(1).max(OVERLAY_LIMITS.canvasSize),
    height: z.number().int().min(1).max(OVERLAY_LIMITS.canvasSize),
    background: z.literal('transparent'),
  }).strict(),
  tokens: z.object({ ink: hexColor, paper: hexColor, mint: hexColor, line: hexColor }).strict(),
  screens: z.array(z.object({
    id,
    title: metadataText.min(1),
    layers: z.array(layerSchema).max(OVERLAY_LIMITS.layersPerScreen),
  }).strict()).min(1).max(OVERLAY_LIMITS.screens),
}).strict().superRefine((pack, ctx) => {
  const screenIds = new Set<string>()
  pack.screens.forEach((screen, screenIndex) => {
    if (screenIds.has(screen.id)) ctx.addIssue({ code: 'custom', path: ['screens', screenIndex, 'id'], message: 'Screen IDs must be unique within the pack.' })
    screenIds.add(screen.id)
    const layerIds = new Set<string>()
    screen.layers.forEach((layer, layerIndex) => {
      const path = ['screens', screenIndex, 'layers', layerIndex]
      if (layerIds.has(layer.id)) ctx.addIssue({ code: 'custom', path: [...path, 'id'], message: 'Layer IDs must be unique within a screen.' })
      layerIds.add(layer.id)
      const { x, y, width, height, unit } = layer.bounds
      const maxX = unit === 'normalized' ? 1 : pack.canvas.width
      const maxY = unit === 'normalized' ? 1 : pack.canvas.height
      if (x + width > maxX || y + height > maxY) ctx.addIssue({ code: 'custom', path: [...path, 'bounds'], message: 'Bounds must fit inside the canvas (normalized coordinates range from 0 to 1).' })
      if (layer.type !== 'line' && (width === 0 || height === 0)) ctx.addIssue({ code: 'custom', path: [...path, 'bounds'], message: 'Text and rectangles need positive width and height.' })
      if (layer.type === 'line' && width === 0 && height === 0) ctx.addIssue({ code: 'custom', path: [...path, 'bounds'], message: 'A line needs a nonzero width or height.' })
    })
  })
})

export type OverlayPack = z.infer<typeof packSchema>
export type OverlayScreen = OverlayPack['screens'][number]
export type OverlayLayer = OverlayScreen['layers'][number]
export type OverlayBounds = OverlayLayer['bounds']
export type OverlayColor = z.infer<typeof color>
export type OverlayValidationIssue = { path: string; message: string }
export type OverlayValidationResult = { ok: true; pack: OverlayPack } | { ok: false; errors: OverlayValidationIssue[] }

// JSON imports cannot carry prototypes/accessors. Apply that same boundary to direct
// object imports before the schema reads their fields. No inherited configuration.
function plainDataIssue(value: unknown, path = '$', depth = 0): OverlayValidationIssue | null {
  if (!value || typeof value !== 'object') return null
  if (depth > 8) return { path, message: 'Pack nesting is too deep.' }
  const prototype = Object.getPrototypeOf(value)
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype || value.length > OVERLAY_LIMITS.layersPerScreen) return { path, message: 'Use a plain array within the pack limits.' }
  } else if (prototype !== Object.prototype && prototype !== null) return { path, message: 'Only plain JSON objects and arrays are allowed.' }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key)) return { path, message: 'Unsupported object key.' }
    const field = Object.getOwnPropertyDescriptor(value, key)!
    if (!('value' in field)) return { path: `${path}.${key}`, message: 'Accessors are not allowed in pack data.' }
    const issue = plainDataIssue(field.value, `${path}.${key}`, depth + 1)
    if (issue) return issue
  }
  return null
}

export function validateOverlayPack(value: unknown): OverlayValidationResult {
  const issue = plainDataIssue(value)
  if (issue) return { ok: false, errors: [issue] }
  const result = packSchema.safeParse(value)
  if (result.success && JSON.stringify(result.data).length + 1 > OVERLAY_LIMITS.jsonLength) {
    return { ok: false, errors: [{ path: '$', message: `Pack JSON exceeds ${OVERLAY_LIMITS.jsonLength} characters.` }] }
  }
  return result.success
    ? { ok: true, pack: result.data }
    : { ok: false, errors: result.error.issues.map((issue) => ({ path: issue.path.join('.') || '$', message: issue.message })) }
}

export class OverlayValidationError extends Error {
  constructor(public readonly errors: OverlayValidationIssue[]) {
    super(errors.map((error) => `${error.path}: ${error.message}`).join('\n'))
    this.name = 'OverlayValidationError'
  }
}

export function assertOverlayPack(value: unknown): OverlayPack {
  const result = validateOverlayPack(value)
  if (!result.ok) throw new OverlayValidationError(result.errors)
  return result.pack
}

export function importOverlayPack(json: string): OverlayValidationResult {
  if (typeof json !== 'string' || json.length > OVERLAY_LIMITS.jsonLength) return { ok: false, errors: [{ path: '$', message: `Pack JSON must be a string of at most ${OVERLAY_LIMITS.jsonLength} characters.` }] }
  try { return validateOverlayPack(JSON.parse(json)) } catch {
    return { ok: false, errors: [{ path: '$', message: 'The pack is not valid JSON.' }] }
  }
}

/** Validation creates a clean copy; unknown fields are rejected, never exported. */
export function exportOverlayPack(pack: OverlayPack): string {
  const safePack = assertOverlayPack(pack)
  const pretty = `${JSON.stringify(safePack, null, 2)}\n`
  return pretty.length <= OVERLAY_LIMITS.jsonLength ? pretty : `${JSON.stringify(safePack)}\n`
}

function emptyPack(packId: string, screens: OverlayScreen[]): OverlayPack {
  return {
    schemaVersion: OVERLAY_SCHEMA_VERSION,
    packId,
    version: '0.1.0',
    title: 'VC Node',
    author: '',
    status: 'draft',
    commercialStatus: 'unreviewed',
    canvas: { width: 1920, height: 1080, background: 'transparent' },
    tokens: { ...DEFAULT_OVERLAY_TOKENS },
    screens,
  }
}

export function createBlankPack(): OverlayPack {
  return emptyPack('vc-node-master', [{ id: 'empty-master', title: 'Empty master', layers: [] }])
}

export function createStarterPack(): OverlayPack {
  return emptyPack('vc-node-starter', STARTER_SCREEN_TITLES.map((title, index) => {
    const number = String(index + 1).padStart(2, '0')
    return { id: `screen-${number}`, title, layers: [] }
  }))
}
