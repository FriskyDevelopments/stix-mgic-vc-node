import { describe, expect, it } from 'vitest'
import { exampleTenant } from './example.ts'
import { TenantConfigError, loadTenantConfig } from './schema.ts'
import { themeTokens } from './theme.ts'

describe('tenant config', () => {
  it('loads the example tenant and exposes theme tokens', () => {
    const tenant = exampleTenant()
    expect(tenant.id).toBe('example')
    const theme = themeTokens(tenant)
    expect(theme.cssVariables['--wl-font-body']).toBe('Example Sans')
    expect(theme.cssVariables['--wl-color-tierra']).toBe('#886644')
    expect(theme.typographyStatus).toBe('confirmed')
  })

  it('rejects unknown keys, bad colors, and css injection in font names', () => {
    expect(() => loadTenantConfig({ ...exampleTenant(), owner: 'nope' })).toThrow(TenantConfigError)
    const color = structuredClone(exampleTenant())
    color.theme.colors.background = '#fff'
    expect(() => loadTenantConfig(color)).toThrow(/theme\.colors\.background/)
    const font = structuredClone(exampleTenant())
    font.theme.typography.display = 'Jost; background: url(https://evil.test)'
    expect(() => loadTenantConfig(font)).toThrow(/typography\.display/)
  })

  it('rejects a calendar module with no calendar block', () => {
    const { calendar: _calendar, ...rest } = structuredClone(exampleTenant())
    expect(() => loadTenantConfig({ ...rest, modules: ['calendar'] })).toThrow(/calendar/)
  })

  it('rejects duplicate services and negative prices', () => {
    const copy = structuredClone(exampleTenant())
    copy.calendar?.services.push({ ...copy.calendar.services[0], name: 'Copy' })
    expect(() => loadTenantConfig(copy)).toThrow(/duplicate/)
    const price = structuredClone(exampleTenant())
    if (price.calendar) price.calendar.services[0].priceMinor = -1
    expect(() => loadTenantConfig(price)).toThrow(/priceMinor/)
  })
})
