import type { TenantConfig } from './schema.ts'

export interface ThemeTokens {
  tenantId: string
  brandName: string
  locale: string
  typographyStatus: 'provisional' | 'confirmed'
  cssVariables: Record<string, string>
}

const COLOR_KEYS = ['background', 'surface', 'text', 'accent', 'tierra', 'agua', 'fuego', 'aire'] as const

export function themeTokens(tenant: TenantConfig): ThemeTokens {
  const cssVariables: Record<string, string> = {
    '--wl-font-display': tenant.theme.typography.display,
    '--wl-font-body': tenant.theme.typography.body,
  }
  for (const key of COLOR_KEYS) {
    cssVariables[`--wl-color-${key}`] = tenant.theme.colors[key]
  }
  return {
    tenantId: tenant.id,
    brandName: tenant.brandName,
    locale: tenant.locale,
    typographyStatus: tenant.theme.typography.status,
    cssVariables,
  }
}
