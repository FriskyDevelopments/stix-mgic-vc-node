import { DEMO_SERVICES, ELEMENTS, type ElementId } from '../payments/catalog.ts'

export { ELEMENTS }
import { isE164, normalizePhone } from '../shared/phone.ts'
import { stripControls } from '../shared/text.ts'

export const STEPS = [
  'landing',
  'welcome',
  'studio',
  'element',
  'services',
  'hours',
  'channels',
  'payments',
  'review',
  'activating',
  'activated',
] as const

export type StepId = (typeof STEPS)[number]

export const FORM_STEPS: readonly StepId[] = [
  'studio',
  'element',
  'services',
  'hours',
  'channels',
  'payments',
  'review',
]

export const WEEKDAYS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const
export type Weekday = (typeof WEEKDAYS)[number]

export const STORAGE_KEY = '4elementos.onboarding.v1'

export type Issue =
  | 'studio_name'
  | 'owner_name'
  | 'element'
  | 'services'
  | 'days'
  | 'whatsapp_number'
  | 'voice_number'
  | 'payments_ack'

export interface OnboardingDraft {
  version: 1
  step: StepId
  studioName: string
  ownerName: string
  element: ElementId | null
  serviceIds: string[]
  days: Weekday[]
  whatsappEnabled: boolean
  whatsappDisplay: string
  voiceEnabled: boolean
  voiceDisplay: string
  paymentsAcknowledged: boolean
  typeface: 'cinzel' | 'jost'
  activatedAt: string | null
  accountId: string | null
}

export function emptyDraft(): OnboardingDraft {
  return {
    version: 1,
    step: 'landing',
    studioName: '4 Elementos',
    ownerName: '',
    element: null,
    serviceIds: DEMO_SERVICES.map((service) => service.id),
    days: ['mar', 'mie', 'jue', 'vie', 'sab'],
    whatsappEnabled: true,
    whatsappDisplay: '',
    voiceEnabled: false,
    voiceDisplay: '',
    paymentsAcknowledged: false,
    typeface: 'cinzel',
    activatedAt: null,
    accountId: null,
  }
}

export function isValidName(value: string): boolean {
  const clean = stripControls(value).trim()
  if (clean.length < 2 || clean.length > 60) return false
  return /[\p{L}\p{N}]/u.test(clean)
}

export function issuesFor(step: StepId, draft: OnboardingDraft): Issue[] {
  if (step === 'review' || step === 'activating') {
    return FORM_STEPS.filter((item) => item !== 'review').flatMap((item) => issuesFor(item, draft))
  }
  if (step === 'studio') {
    const issues: Issue[] = []
    if (!isValidName(draft.studioName)) issues.push('studio_name')
    if (!isValidName(draft.ownerName)) issues.push('owner_name')
    return issues
  }
  if (step === 'element') return draft.element && ELEMENTS.includes(draft.element) ? [] : ['element']
  if (step === 'services') {
    const known = new Set(DEMO_SERVICES.map((service) => service.id))
    return draft.serviceIds.some((id) => known.has(id)) ? [] : ['services']
  }
  if (step === 'hours') return draft.days.some((day) => WEEKDAYS.includes(day)) ? [] : ['days']
  if (step === 'channels') {
    const issues: Issue[] = []
    if (draft.whatsappDisplay.trim() && !isE164(normalizePhone(draft.whatsappDisplay))) issues.push('whatsapp_number')
    if (draft.voiceDisplay.trim() && !isE164(normalizePhone(draft.voiceDisplay))) issues.push('voice_number')
    return issues
  }
  if (step === 'payments') return draft.paymentsAcknowledged ? [] : ['payments_ack']
  return []
}

export function nextStep(step: StepId): StepId | null {
  const index = STEPS.indexOf(step)
  if (index < 0 || index === STEPS.length - 1) return null
  return STEPS[index + 1] ?? null
}

export function prevStep(step: StepId): StepId | null {
  const index = STEPS.indexOf(step)
  if (index <= 0) return null
  return STEPS[index - 1] ?? null
}

export function reachable(draft: OnboardingDraft): StepId[] {
  const out: StepId[] = ['landing', 'welcome']
  for (const step of FORM_STEPS) {
    out.push(step)
    if (issuesFor(step, draft).length > 0) break
  }
  return out
}

function normalizeDraft(draft: OnboardingDraft): OnboardingDraft {
  return {
    ...draft,
    studioName: stripControls(draft.studioName).trim(),
    ownerName: stripControls(draft.ownerName).trim(),
    whatsappDisplay: draft.whatsappDisplay.trim() ? normalizePhone(draft.whatsappDisplay) : '',
    voiceDisplay: draft.voiceDisplay.trim() ? normalizePhone(draft.voiceDisplay) : '',
    serviceIds: draft.serviceIds.filter((id) => DEMO_SERVICES.some((service) => service.id === id)),
    days: draft.days.filter((day) => WEEKDAYS.includes(day)),
  }
}

export function goNext(draft: OnboardingDraft): { draft: OnboardingDraft; issues: Issue[] } {
  if (draft.step === 'activating' || draft.step === 'activated') return { draft, issues: [] }
  const issues = issuesFor(draft.step, draft)
  if (issues.length) return { draft, issues }
  const normalized = normalizeDraft(draft)
  const next = nextStep(normalized.step)
  if (!next) return { draft: normalized, issues: [] }
  return { draft: { ...normalized, step: next }, issues: [] }
}

export function goBack(draft: OnboardingDraft): OnboardingDraft {
  if (draft.step === 'activated' || draft.step === 'landing') return draft
  const prev = prevStep(draft.step)
  if (!prev) return draft
  return { ...draft, step: prev }
}

export function goTo(draft: OnboardingDraft, step: StepId): OnboardingDraft {
  if (step === draft.step) return draft
  if (draft.activatedAt) return draft
  if (step === 'activating' || step === 'activated') return draft
  if (!reachable(draft).includes(step)) return draft
  return { ...draft, step }
}

export function accountIdFor(studioName: string, nowIso: string): string {
  const slug = studioName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 12) || 'estudio'
  const stamp = nowIso.replace(/\D/g, '').slice(0, 12)
  return `4e-${slug}-${stamp}`
}

export function completeActivation(draft: OnboardingDraft, nowIso: string): OnboardingDraft {
  if (draft.step === 'activated' && draft.activatedAt) return draft
  if (draft.step !== 'activating') return draft
  if (issuesFor('activating', draft).length) return draft
  const studioName = draft.studioName.trim()
  return {
    ...normalizeDraft(draft),
    step: 'activated',
    studioName,
    activatedAt: nowIso,
    accountId: draft.accountId ?? accountIdFor(studioName, nowIso),
  }
}

export function formProgress(step: StepId): { index: number; total: number } | null {
  const index = FORM_STEPS.indexOf(step)
  if (index < 0) return null
  return { index: index + 1, total: FORM_STEPS.length }
}

export function resume(raw: string | null): OnboardingDraft {
  if (!raw) return emptyDraft()
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return emptyDraft()
    const value = parsed as Partial<OnboardingDraft>
    if (value.version !== 1) return emptyDraft()
    if (typeof value.step !== 'string' || !STEPS.includes(value.step as StepId)) return emptyDraft()
    const base = emptyDraft()
    const element = ELEMENTS.includes(value.element as ElementId) ? (value.element as ElementId) : null
    const draft: OnboardingDraft = {
      ...base,
      step: value.step as StepId,
      studioName: typeof value.studioName === 'string' ? value.studioName.slice(0, 80) : base.studioName,
      ownerName: typeof value.ownerName === 'string' ? value.ownerName.slice(0, 80) : '',
      element,
      serviceIds: Array.isArray(value.serviceIds) ? value.serviceIds.filter((id): id is string => typeof id === 'string') : base.serviceIds,
      days: Array.isArray(value.days) ? value.days.filter((day): day is Weekday => WEEKDAYS.includes(day as Weekday)) : base.days,
      whatsappEnabled: typeof value.whatsappEnabled === 'boolean' ? value.whatsappEnabled : base.whatsappEnabled,
      whatsappDisplay: typeof value.whatsappDisplay === 'string' ? value.whatsappDisplay.slice(0, 24) : '',
      voiceEnabled: typeof value.voiceEnabled === 'boolean' ? value.voiceEnabled : base.voiceEnabled,
      voiceDisplay: typeof value.voiceDisplay === 'string' ? value.voiceDisplay.slice(0, 24) : '',
      paymentsAcknowledged: value.paymentsAcknowledged === true,
      typeface: value.typeface === 'jost' ? 'jost' : 'cinzel',
      activatedAt: typeof value.activatedAt === 'string' ? value.activatedAt : null,
      accountId: typeof value.accountId === 'string' ? value.accountId.slice(0, 48) : null,
    }
    if (draft.activatedAt) return { ...draft, step: 'activated' }
    if (draft.step === 'activating') return { ...draft, step: 'review' }
    return draft
  } catch {
    return emptyDraft()
  }
}

export interface SummaryLine {
  label: string
  value: string
}

export function summary(draft: OnboardingDraft): SummaryLine[] {
  const services = DEMO_SERVICES.filter((service) => draft.serviceIds.includes(service.id)).map((service) => service.name)
  const dayLabels: Record<Weekday, string> = {
    lun: 'lunes',
    mar: 'martes',
    mie: 'miércoles',
    jue: 'jueves',
    vie: 'viernes',
    sab: 'sábado',
    dom: 'domingo',
  }
  return [
    { label: 'Estudio', value: draft.studioName.trim() || '—' },
    { label: 'Responsable', value: draft.ownerName.trim() || '—' },
    { label: 'Elemento', value: draft.element ?? '—' },
    { label: 'Letra', value: draft.typeface === 'jost' ? 'Jost' : 'Cinzel' },
    { label: 'Servicios', value: services.join(', ') || '—' },
    { label: 'Días', value: draft.days.map((day) => dayLabels[day]).join(', ') || '—' },
    {
      label: 'WhatsApp (WAHA)',
      value: draft.whatsappEnabled ? draft.whatsappDisplay || 'sí, sin número en pantalla' : 'no',
    },
    {
      label: 'Llamadas (Twilio)',
      value: draft.voiceEnabled ? draft.voiceDisplay || 'sí, sin número en pantalla' : 'no',
    },
    { label: 'Cobro', value: 'Stripe, solo modo prueba' },
  ]
}
