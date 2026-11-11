import { loadTenantConfig, type TenantConfig } from './schema.ts'

const colors = {
  background: '#f4f4f4',
  surface: '#ffffff',
  text: '#222222',
  accent: '#335555',
  tierra: '#886644',
  agua: '#447788',
  fuego: '#aa5544',
  aire: '#dddddd',
}

export function exampleTenant(overrides: Record<string, unknown> = {}): TenantConfig {
  return loadTenantConfig({
    id: 'example',
    brandName: 'Example',
    tagline: null,
    locale: 'en-US',
    timeZone: 'America/Mexico_City',
    currency: 'USD',
    modules: ['calendar', 'neuronas'],
    theme: {
      colors,
      typography: {
        status: 'confirmed',
        display: 'Example Sans',
        body: 'Example Sans',
        candidates: [],
      },
    },
    calendar: {
      hoursConfirmed: true,
      hours: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, open: '10:00', close: '19:00' })),
      services: [
        {
          slug: 'sample',
          name: 'Sample',
          durationMinutes: 60,
          priceMinor: 1000,
          active: true,
          confirmed: true,
        },
        {
          slug: 'paused',
          name: 'Paused',
          durationMinutes: 60,
          priceMinor: null,
          active: false,
          confirmed: false,
        },
      ],
    },
    neuronas: {
      allowDelete: false,
      collections: ['notes', 'marca'],
    },
    ...overrides,
  })
}
