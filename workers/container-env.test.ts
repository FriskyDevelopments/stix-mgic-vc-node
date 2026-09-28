import { describe, expect, it } from 'vitest'
import {
  ASHY_CONTAINER_PORT,
  ASHY_FORWARDED_ENV_KEYS,
  buildAshyContainerEnv,
  missingRequiredAshySecrets,
} from './container-env'

describe('buildAshyContainerEnv', () => {
  it('listens on the Dockerfile port even when Worker env omits PORT', () => {
    const env = buildAshyContainerEnv({})
    expect(env.PORT).toBe(String(ASHY_CONTAINER_PORT))
    expect(env.HOST).toBe('0.0.0.0')
    expect(env.NODE_ENV).toBe('production')
    expect(env.AUTH_REQUIRED).toBe('true')
    expect(env.MEDIA_PLANE_ENABLED).toBe('true')
  })

  it('forwards non-empty secrets and omits blanks', () => {
    const env = buildAshyContainerEnv({
      OPERATOR_TOKEN_SECRET: 'replace-with-32-plus-random-chars',
      TELEGRAM_BOT_TOKEN: '   ',
      TELEGRAM_BOT_USERNAME: '@kimi_Friskydev_bot',
      CLOUDFLARE_TURN_KEY_API_TOKEN: undefined,
    })
    expect(env.OPERATOR_TOKEN_SECRET).toBe('replace-with-32-plus-random-chars')
    expect(env.TELEGRAM_BOT_USERNAME).toBe('@kimi_Friskydev_bot')
    expect(env).not.toHaveProperty('TELEGRAM_BOT_TOKEN')
    expect(env).not.toHaveProperty('CLOUDFLARE_TURN_KEY_API_TOKEN')
  })

  it('does not let a Worker PORT var move the container listener', () => {
    const env = buildAshyContainerEnv({ PORT: '8787' })
    expect(env.PORT).toBe('10000')
  })

  it('includes Cloudflare Realtime secret names in the forward list', () => {
    expect(ASHY_FORWARDED_ENV_KEYS).toContain('CLOUDFLARE_TURN_KEY_API_TOKEN')
    expect(ASHY_FORWARDED_ENV_KEYS).toContain('CLOUDFLARE_REALTIME_APP_SECRET')
  })
})

describe('missingRequiredAshySecrets', () => {
  it('requires OPERATOR_TOKEN_SECRET in production-shaped env', () => {
    expect(missingRequiredAshySecrets({})).toEqual(['OPERATOR_TOKEN_SECRET'])
    expect(missingRequiredAshySecrets({ OPERATOR_TOKEN_SECRET: 'short' })).toEqual([
      'OPERATOR_TOKEN_SECRET',
    ])
    expect(
      missingRequiredAshySecrets({ OPERATOR_TOKEN_SECRET: 'replace-with-32-plus-random-chars' }),
    ).toEqual([])
  })
})
