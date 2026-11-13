import { describe, expect, it } from 'vitest'
import { emptyDraft, goBack, goNext, goTo, resume, STORAGE_KEY, completeActivation, type OnboardingDraft } from './flow.ts'

describe('onboarding flow', () => {
  it('blocks an empty owner name and keeps it when going back', () => {
    let draft = emptyDraft()
    draft = goNext(draft).draft
    draft = goNext(draft).draft
    const blocked = goNext(draft)
    expect(blocked.issues).toContain('owner_name')
    expect(blocked.draft.step).toBe('studio')
    draft = { ...draft, ownerName: 'Rangel' }
    draft = goNext(draft).draft
    expect(draft.step).toBe('element')
    draft = goBack(draft)
    expect(draft.ownerName).toBe('Rangel')
    expect(draft.step).toBe('studio')
  })

  it('requires an element, one service, and the test-mode acknowledgement', () => {
    let draft: OnboardingDraft = { ...emptyDraft(), step: 'element', ownerName: 'Rangel' }
    expect(goNext(draft).issues).toContain('element')
    draft = { ...draft, element: 'agua' }
    draft = goNext(draft).draft
    draft = { ...draft, serviceIds: [] }
    expect(goNext(draft).issues).toContain('services')
    draft = { ...draft, serviceIds: ['masaje-relajante'] }
    draft = { ...goNext(draft).draft, days: [] }
    expect(goNext(draft).issues).toContain('days')
    draft = { ...draft, days: ['vie'], step: 'payments' }
    expect(goNext(draft).issues).toContain('payments_ack')
    draft = { ...draft, paymentsAcknowledged: true }
    expect(goNext(draft).draft.step).toBe('review')
  })

  it('turns a 10-digit WhatsApp into a Mexican number and refuses junk', () => {
    const base = { ...emptyDraft(), step: 'channels' as const, ownerName: 'Rangel', element: 'agua' as const }
    const normalized = goNext({ ...base, whatsappDisplay: '55 1234 5678' }).draft
    expect(normalized.whatsappDisplay).toBe('+525512345678')
    expect(normalized.step).toBe('payments')
    const bad = goNext({ ...base, whatsappDisplay: 'hola' })
    expect(bad.issues).toContain('whatsapp_number')
  })

  it('does not jump ahead, survives corrupt storage, and resumes activation on review', () => {
    const draft = { ...emptyDraft(), ownerName: 'Rangel' }
    expect(goTo(draft, 'review').step).toBe('landing')
    expect(resume('{').step).toBe('landing')
    expect(resume(JSON.stringify({ version: 1, step: 'sideways' })).step).toBe('landing')
    const stored = resume(JSON.stringify({ ...emptyDraft(), step: 'activating', ownerName: 'Rangel', element: 'agua', paymentsAcknowledged: true }))
    expect(stored.step).toBe('review')
    const done = resume(JSON.stringify({ ...emptyDraft(), step: 'studio', activatedAt: '2026-11-12T00:00:00.000Z', accountId: '4e-test' }))
    expect(done.step).toBe('activated')
  })

  it('activates only from the activating step', () => {
    const review = { ...emptyDraft(), step: 'review' as const, ownerName: 'Rangel', element: 'agua' as const, paymentsAcknowledged: true }
    expect(completeActivation(review, '2026-11-12T00:00:00.000Z').step).toBe('review')
    const activating = { ...review, step: 'activating' as const }
    const done = completeActivation(activating, '2026-11-12T00:00:00.000Z')
    expect(done.step).toBe('activated')
    expect(done.accountId).toBe('4e-4elementos-202611120000')
    expect(completeActivation(done, '2026-11-13T00:00:00.000Z').accountId).toBe(done.accountId)
  })

  it('keeps the default WhatsApp choice when an older draft omitted it', () => {
    const stored = resume(JSON.stringify({ version: 1, step: 'channels', ownerName: 'Rangel' }))
    expect(stored.whatsappEnabled).toBe(true)
    expect(stored.voiceEnabled).toBe(false)
    const off = resume(JSON.stringify({ version: 1, step: 'channels', whatsappEnabled: false, voiceEnabled: true }))
    expect(off.whatsappEnabled).toBe(false)
    expect(off.voiceEnabled).toBe(true)
  })

  it('uses the storage key the screen writes', () => {
    expect(STORAGE_KEY).toBe('4elementos.onboarding.v1')
  })
})
