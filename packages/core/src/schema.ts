import { hasControlChars } from './text.ts'

export const MODULE_IDS = ['calendar', 'neuronas'] as const
export type ModuleId = (typeof MODULE_IDS)[number]

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const HEX = /^#[0-9a-fA-F]{6}$/
const LOCALE = /^[a-z]{2}-[A-Z]{2}$/
const CURRENCY = /^[A-Z]{3}$/
const HM = /^([01]\d|2[0-3]):([0-5]\d)$/
const FONT = /^[A-Za-z0-9][A-Za-z0-9 .+-]{0,40}$/
const TIME_ZONE = /^[A-Za-z0-9_+-]{1,64}(?:\/[A-Za-z0-9_+-]{1,64})+$/

export interface ThemeColors {
  background: string
  surface: string
  text: string
  accent: string
  tierra: string
  agua: string
  fuego: string
  aire: string
}

export interface TypographyCandidate {
  id: string
  display: string
  body: string
}

export interface ThemeConfig {
  colors: ThemeColors
  typography: {
    status: 'provisional' | 'confirmed'
    display: string
    body: string
    candidates: TypographyCandidate[]
  }
}

export interface CatalogService {
  slug: string
  name: string
  durationMinutes: number
  priceMinor: number | null
  active: boolean
  confirmed: boolean
}

export interface BusinessHours {
  weekday: number
  open: string
  close: string
}

export interface CalendarConfig {
  hoursConfirmed: boolean
  hours: BusinessHours[]
  services: CatalogService[]
}

export interface NeuronasConfig {
  allowDelete: boolean
  collections: string[]
}

export interface TenantConfig {
  id: string
  brandName: string
  tagline: string | null
  locale: string
  timeZone: string
  currency: string
  modules: ModuleId[]
  theme: ThemeConfig
  calendar: CalendarConfig | null
  neuronas: NeuronasConfig | null
}

export class TenantConfigError extends Error {
  readonly errors: readonly string[]

  constructor(errors: readonly string[]) {
    super(errors.join('; '))
    this.name = 'TenantConfigError'
    this.errors = errors
  }
}

const COLOR_KEYS = ['background', 'surface', 'text', 'accent', 'tierra', 'agua', 'fuego', 'aire'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unknownKeys(obj: Record<string, unknown>, allowed: readonly string[], path: string, errors: string[]) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) errors.push(`${path}.${key}: unknown`)
  }
}

function requireString(value: unknown, path: string, errors: string[], pattern?: RegExp, max = 80): string | null {
  if (typeof value !== 'string' || hasControlChars(value)) {
    errors.push(`${path}: expected string`)
    return null
  }
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) {
    errors.push(`${path}: invalid`)
    return null
  }
  if (pattern && !pattern.test(trimmed)) {
    errors.push(`${path}: invalid`)
    return null
  }
  return trimmed
}

function requireBoolean(value: unknown, path: string, errors: string[]): boolean | null {
  if (typeof value !== 'boolean') {
    errors.push(`${path}: expected boolean`)
    return null
  }
  return value
}

function parseColors(value: unknown, errors: string[]): ThemeColors | null {
  if (!isRecord(value)) {
    errors.push('theme.colors: expected object')
    return null
  }
  unknownKeys(value, COLOR_KEYS, 'theme.colors', errors)
  const colors = {} as ThemeColors
  for (const key of COLOR_KEYS) {
    const color = requireString(value[key], `theme.colors.${key}`, errors, HEX, 7)
    if (color) colors[key] = color
  }
  return errors.some((entry) => entry.startsWith('theme.colors')) ? null : colors
}

function parseTypography(value: unknown, errors: string[]): ThemeConfig['typography'] | null {
  if (!isRecord(value)) {
    errors.push('theme.typography: expected object')
    return null
  }
  unknownKeys(value, ['status', 'display', 'body', 'candidates'], 'theme.typography', errors)
  if (value.status !== 'provisional' && value.status !== 'confirmed') {
    errors.push('theme.typography.status: invalid')
  }
  const display = requireString(value.display, 'theme.typography.display', errors, FONT, 41)
  const body = requireString(value.body, 'theme.typography.body', errors, FONT, 41)
  if (!Array.isArray(value.candidates)) {
    errors.push('theme.typography.candidates: expected array')
    return null
  }
  if (value.candidates.length > 4) errors.push('theme.typography.candidates: too many')
  const candidates: TypographyCandidate[] = []
  for (let i = 0; i < value.candidates.length; i += 1) {
    const item = value.candidates[i]
    const path = `theme.typography.candidates.${i}`
    if (!isRecord(item)) {
      errors.push(`${path}: expected object`)
      continue
    }
    unknownKeys(item, ['id', 'display', 'body'], path, errors)
    const id = requireString(item.id, `${path}.id`, errors, /^[A-Za-z0-9]{1,8}$/, 8)
    const itemDisplay = requireString(item.display, `${path}.display`, errors, FONT, 41)
    const itemBody = requireString(item.body, `${path}.body`, errors, FONT, 41)
    if (id && itemDisplay && itemBody) candidates.push({ id, display: itemDisplay, body: itemBody })
  }
  if (!display || !body || (value.status !== 'provisional' && value.status !== 'confirmed')) return null
  return { status: value.status, display, body, candidates }
}

function parseServices(value: unknown, errors: string[]): CatalogService[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 40) {
    errors.push('calendar.services: expected 1 to 40 services')
    return null
  }
  const services: CatalogService[] = []
  const slugs = new Set<string>()
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i]
    const path = `calendar.services.${i}`
    if (!isRecord(item)) {
      errors.push(`${path}: expected object`)
      continue
    }
    unknownKeys(item, ['slug', 'name', 'durationMinutes', 'priceMinor', 'active', 'confirmed'], path, errors)
    const slug = requireString(item.slug, `${path}.slug`, errors, SLUG, 48)
    const name = requireString(item.name, `${path}.name`, errors, undefined, 80)
    const active = requireBoolean(item.active, `${path}.active`, errors)
    const confirmed = requireBoolean(item.confirmed, `${path}.confirmed`, errors)
    const duration = item.durationMinutes
    if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 15 || duration > 240) {
      errors.push(`${path}.durationMinutes: expected integer 15 to 240`)
    }
    let priceMinor: number | null = null
    if (item.priceMinor === null) {
      priceMinor = null
    } else if (typeof item.priceMinor === 'number' && Number.isInteger(item.priceMinor) && item.priceMinor >= 0 && item.priceMinor <= 10_000_000) {
      priceMinor = item.priceMinor
    } else {
      errors.push(`${path}.priceMinor: expected null or integer cents`)
    }
    if (slug && slugs.has(slug)) errors.push(`${path}.slug: duplicate`)
    if (slug) slugs.add(slug)
    if (slug && name && active !== null && confirmed !== null && typeof duration === 'number' && Number.isInteger(duration)) {
      services.push({ slug, name, durationMinutes: duration, priceMinor, active, confirmed })
    }
  }
  return services
}

function parseHours(value: unknown, errors: string[]): BusinessHours[] | null {
  if (!Array.isArray(value) || value.length > 7) {
    errors.push('calendar.hours: expected an array of at most 7 days')
    return null
  }
  const hours: BusinessHours[] = []
  const days = new Set<number>()
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i]
    const path = `calendar.hours.${i}`
    if (!isRecord(item)) {
      errors.push(`${path}: expected object`)
      continue
    }
    unknownKeys(item, ['weekday', 'open', 'close'], path, errors)
    const weekday = item.weekday
    const open = requireString(item.open, `${path}.open`, errors, HM, 5)
    const close = requireString(item.close, `${path}.close`, errors, HM, 5)
    if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      errors.push(`${path}.weekday: expected 0 to 6`)
    } else if (days.has(weekday)) {
      errors.push(`${path}.weekday: duplicate`)
    } else {
      days.add(weekday)
    }
    if (open && close && open >= close) errors.push(`${path}: open must be before close`)
    if (typeof weekday === 'number' && open && close) hours.push({ weekday, open, close })
  }
  return hours
}

function parseCalendar(value: unknown, errors: string[]): CalendarConfig | null {
  if (!isRecord(value)) {
    errors.push('calendar: expected object')
    return null
  }
  unknownKeys(value, ['hoursConfirmed', 'hours', 'services'], 'calendar', errors)
  const hoursConfirmed = requireBoolean(value.hoursConfirmed, 'calendar.hoursConfirmed', errors)
  const hours = parseHours(value.hours, errors)
  const services = parseServices(value.services, errors)
  if (hoursConfirmed === null || !hours || !services) return null
  return { hoursConfirmed, hours, services }
}

function parseNeuronas(value: unknown, errors: string[]): NeuronasConfig | null {
  if (!isRecord(value)) {
    errors.push('neuronas: expected object')
    return null
  }
  unknownKeys(value, ['allowDelete', 'collections'], 'neuronas', errors)
  const allowDelete = requireBoolean(value.allowDelete, 'neuronas.allowDelete', errors)
  if (!Array.isArray(value.collections) || value.collections.length === 0 || value.collections.length > 20) {
    errors.push('neuronas.collections: expected 1 to 20 collections')
    return null
  }
  const collections: string[] = []
  for (let i = 0; i < value.collections.length; i += 1) {
    const collection = requireString(value.collections[i], `neuronas.collections.${i}`, errors, SLUG, 32)
    if (collection && collections.includes(collection)) errors.push(`neuronas.collections.${i}: duplicate`)
    if (collection) collections.push(collection)
  }
  if (allowDelete === null) return null
  return { allowDelete, collections }
}

function parseTenant(value: unknown, errors: string[]): TenantConfig | null {
  if (!isRecord(value)) {
    errors.push('tenant: expected object')
    return null
  }
  unknownKeys(
    value,
    ['id', 'brandName', 'tagline', 'locale', 'timeZone', 'currency', 'modules', 'theme', 'calendar', 'neuronas'],
    'tenant',
    errors,
  )
  const id = requireString(value.id, 'tenant.id', errors, SLUG, 32)
  const brandName = requireString(value.brandName, 'tenant.brandName', errors, undefined, 80)
  let tagline: string | null = null
  if (value.tagline === null) tagline = null
  else {
    const parsed = requireString(value.tagline, 'tenant.tagline', errors, undefined, 120)
    tagline = parsed
  }
  const locale = requireString(value.locale, 'tenant.locale', errors, LOCALE, 5)
  const timeZone = requireString(value.timeZone, 'tenant.timeZone', errors, TIME_ZONE, 64)
  const currency = requireString(value.currency, 'tenant.currency', errors, CURRENCY, 3)
  if (!Array.isArray(value.modules) || value.modules.length === 0) {
    errors.push('tenant.modules: expected at least one module')
  }
  const modules: ModuleId[] = []
  if (Array.isArray(value.modules)) {
    for (let i = 0; i < value.modules.length; i += 1) {
      const item = value.modules[i]
      if (typeof item !== 'string' || !MODULE_IDS.includes(item as ModuleId)) {
        errors.push(`tenant.modules.${i}: unknown module`)
        continue
      }
      if (modules.includes(item as ModuleId)) errors.push(`tenant.modules.${i}: duplicate`)
      modules.push(item as ModuleId)
    }
  }
  if (!isRecord(value.theme)) errors.push('theme: expected object')
  else unknownKeys(value.theme, ['colors', 'typography'], 'theme', errors)
  const colors = isRecord(value.theme) ? parseColors(value.theme.colors, errors) : null
  const typography = isRecord(value.theme) ? parseTypography(value.theme.typography, errors) : null

  const wantsCalendar = modules.includes('calendar')
  const wantsNeuronas = modules.includes('neuronas')
  if (wantsCalendar && value.calendar === undefined) errors.push('calendar: required')
  if (!wantsCalendar && value.calendar !== undefined && value.calendar !== null) errors.push('calendar: not enabled')
  if (wantsNeuronas && value.neuronas === undefined) errors.push('neuronas: required')
  if (!wantsNeuronas && value.neuronas !== undefined && value.neuronas !== null) errors.push('neuronas: not enabled')

  const calendar = wantsCalendar ? parseCalendar(value.calendar, errors) : null
  const neuronas = wantsNeuronas ? parseNeuronas(value.neuronas, errors) : null
  if (!id || !brandName || !locale || !timeZone || !currency || !colors || !typography) return null
  if (wantsCalendar && !calendar) return null
  if (wantsNeuronas && !neuronas) return null
  return {
    id,
    brandName,
    tagline,
    locale,
    timeZone,
    currency,
    modules,
    theme: { colors, typography },
    calendar,
    neuronas,
  }
}

export function loadTenantConfig(input: unknown): TenantConfig {
  const errors: string[] = []
  const tenant = parseTenant(input, errors)
  if (!tenant || errors.length > 0) throw new TenantConfigError(errors.length > 0 ? errors : ['tenant: invalid'])
  return tenant
}

export function loadTenantConfigFromJson(text: string): TenantConfig {
  try {
    return loadTenantConfig(JSON.parse(text) as unknown)
  } catch (error) {
    if (error instanceof TenantConfigError) throw error
    throw new TenantConfigError(['tenant: invalid json'])
  }
}
