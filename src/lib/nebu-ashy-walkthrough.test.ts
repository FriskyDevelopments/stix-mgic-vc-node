import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ASHY_SCENES,
  ASHY_UNIT,
  BEFORE_YOU_START,
  NEBU_BRAND,
  NEBU_CSS_VARS,
  NEBU_LOGIN_URL,
  PIPE_LABELS,
  STUDIO_URL,
  actProgress,
  getScene,
  isTelegramUnlocked,
  nextSceneId,
  pipesForScene,
  prevSceneId,
  sceneIndex,
} from './nebu-ashy-walkthrough'

describe('NEBU Ashy walkthrough step model', () => {
  it('seeds Ashy unit without bot token secrets', () => {
    expect(ASHY_UNIT.slug).toBe('ashy')
    expect(ASHY_UNIT.hostedUnitId).toBe('8888816358')
    expect(ASHY_UNIT.botDisplay).toBe('@kimi_Friskydev_bot')
    const blob = JSON.stringify(ASHY_SCENES) + JSON.stringify(ASHY_UNIT)
    expect(blob.toLowerCase()).not.toMatch(/bot_token|telegram_bot_token|apitoken|secret_key/)
    expect(blob).not.toMatch(/\d{10}:[A-Za-z0-9_-]{20,}/)
  })

  it('keeps the three pipes labeled separately', () => {
    expect(PIPE_LABELS.local_preview.title).toBe('Local preview')
    expect(PIPE_LABELS.room_output.title).toBe('Room output')
    expect(PIPE_LABELS.telegram_broadcast.title).toBe('Telegram broadcast')
    for (const scene of ASHY_SCENES) {
      expect(scene.pipes).toHaveProperty('local_preview')
      expect(scene.pipes).toHaveProperty('room_output')
      expect(scene.pipes).toHaveProperty('telegram_broadcast')
    }
  })

  it('locks Telegram until Act II', () => {
    expect(isTelegramUnlocked('prep')).toBe(false)
    expect(isTelegramUnlocked('act-i-sign-in')).toBe(false)
    expect(isTelegramUnlocked('act-i-private-room')).toBe(false)
    expect(isTelegramUnlocked('act-ii-unit-type')).toBe(true)
    expect(pipesForScene('act-i-devices').telegram_broadcast).toBe('locked')
    expect(pipesForScene('act-ii-connect').telegram_broadcast).toBe('active')
  })

  it('ships before-you-start checklist with OBS optional', () => {
    expect(BEFORE_YOU_START.map((item) => item.id)).toEqual([
      'headphones',
      'stable_link',
      'short_clip',
      'account',
      'helper',
      'obs',
    ])
    expect(BEFORE_YOU_START.find((item) => item.id === 'obs')?.optional).toBe(true)
  })

  it('navigates scenes linearly with act progress', () => {
    expect(sceneIndex('prep')).toBe(0)
    expect(nextSceneId('prep')).toBe('act-i-sign-in')
    expect(prevSceneId('prep')).toBeNull()
    expect(nextSceneId('act-iii-cutover')).toBeNull()
    const progress = actProgress('act-i-devices')
    expect(progress.act).toBe('act_i')
    expect(progress.stepInAct).toBe(2)
    expect(progress.actLength).toBe(3)
    expect(progress.overallLength).toBe(ASHY_SCENES.length)
  })

  it('keeps FriskyDev ID studio separate from NEBU Better Auth login', () => {
    const signIn = getScene('act-i-sign-in')
    expect(signIn?.primaryCta?.href).toBe(NEBU_LOGIN_URL)
    expect(signIn?.secondaryCta?.href).toBe(STUDIO_URL)
    expect(signIn?.body).toMatch(/FriskyDev ID/)
    expect(signIn?.body).toMatch(/separate/i)
    const ops = getScene('act-iii-ops')
    expect(ops?.primaryCta?.href).toBe(STUDIO_URL)
    expect(ops?.body).toMatch(/nebu\.quest/)
  })

  it('includes Ashy brand line, CTA, and room-admin optional tip after room works', () => {
    expect(NEBU_BRAND.line).toBe('Set the scene.')
    expect(NEBU_BRAND.cta).toContain("Like Ashy’s room")
    expect(NEBU_BRAND.night).toBe('#0B001A')
    expect(NEBU_BRAND.yellow).toBe('#FFD100')
    expect(NEBU_BRAND.violet).toBe('#7A4FB8')
    expect(NEBU_BRAND.cyan).toBe('#5EA8B8')
    expect(NEBU_BRAND.ash).toBe('#9A93A0')
    expect(NEBU_BRAND.danger).toBe('#B57A7A')
    expect(NEBU_CSS_VARS['--nebu-yellow']).toBe(NEBU_BRAND.yellow)
    expect(NEBU_CSS_VARS['--nebu-ash']).toBe(NEBU_BRAND.ash)
    const room = getScene('act-i-private-room')
    expect(room?.optionalTip).toMatch(/mute|kick|pin|end/i)
    expect(room?.practiceRule).toBe(true)
  })

  it('keeps CSS variables in lockstep with NEBU_BRAND and drops carnival neon', () => {
    const tokens = readFileSync(resolve(__dirname, '../styles/nebu-tokens.css'), 'utf8')
    expect(tokens).toContain(NEBU_BRAND.night)
    expect(tokens).toContain(NEBU_BRAND.yellow)
    expect(tokens).toContain(NEBU_BRAND.violet)
    expect(tokens).toContain(NEBU_BRAND.cyan)
    expect(tokens).toContain(NEBU_BRAND.ash)
    expect(tokens).toContain(NEBU_BRAND.danger)
    expect(tokens).toContain(NEBU_BRAND.live)
    expect(tokens).not.toContain('#9D00FF')
    expect(tokens).not.toContain('#00E5FF')
    expect(tokens).not.toContain('#B7FF2A')
    expect(NEBU_BRAND).not.toHaveProperty('lime')
  })

  it('documents BYO vs hosted with Ashy unit id only as display', () => {
    const unit = getScene('act-ii-unit-type')
    expect(unit?.body).toContain('8888816358')
    expect(unit?.body).toContain('@kimi_Friskydev_bot')
    expect(unit?.secondaryCta?.note).toMatch(/vault|Wrangler/i)
  })
})
