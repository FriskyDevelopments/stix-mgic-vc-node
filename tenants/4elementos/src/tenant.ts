import { loadTenantConfig, type CatalogService, type TenantConfig } from '../../../packages/core/src/schema.ts'
import { catalogNote } from '../../../modules/neuronas/src/notes.ts'
import type { Note } from '../../../modules/neuronas/src/store.ts'

export const SEEDED_AT = '2026-11-11T00:00:00.000Z'

const SERVICE_NAMES = [
  ['masaje-relajante', 'Masaje relajante'],
  ['descontracturante', 'Descontracturante'],
  ['piedras-calientes', 'Piedras calientes'],
  ['reflexologia', 'Reflexología'],
  ['aromaterapia', 'Aromaterapia'],
] as const

function service(slug: string, name: string): CatalogService {
  return {
    slug,
    name,
    durationMinutes: 60,
    priceMinor: null,
    active: true,
    confirmed: false,
  }
}

export const fourElementos: TenantConfig = loadTenantConfig({
  id: '4elementos',
  brandName: '4 Elementos',
  tagline: null,
  locale: 'es-MX',
  timeZone: 'America/Mexico_City',
  currency: 'MXN',
  modules: ['calendar', 'neuronas'],
  theme: {
    colors: {
      background: '#f6f1e8',
      surface: '#fffdf8',
      text: '#2c3330',
      accent: '#3f6f5b',
      tierra: '#8c5a3c',
      agua: '#4e7c86',
      fuego: '#c4653a',
      aire: '#d9d3c5',
    },
    typography: {
      status: 'provisional',
      display: 'Jost',
      body: 'Jost',
      candidates: [
        { id: 'A', display: 'Jost', body: 'Jost' },
        { id: 'B', display: 'Cinzel', body: 'Inter' },
      ],
    },
  },
  calendar: {
    hoursConfirmed: false,
    hours: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, open: '10:00', close: '19:00' })),
    services: SERVICE_NAMES.map(([slug, name]) => service(slug, name)),
  },
  neuronas: {
    allowDelete: false,
    collections: ['servicios', 'marca', 'equipo', 'operacion'],
  },
})

function note(draft: {
  id: string
  collection: string
  title: string
  body: string
  tags: string[]
}): Note {
  return catalogNote(fourElementos, { ...draft, createdAt: SEEDED_AT })
}

export const fourElementosNotes: Note[] = [
  ...SERVICE_NAMES.map(([slug, name]) => note({
    id: `catalog:servicio:${slug}`,
    collection: 'servicios',
    title: name,
    body: `«${name}» está en el catálogo. El precio y la duración todavía no están confirmados. El calendario usa 60 minutos solo para calcular los huecos.`,
    tags: ['servicio', slug],
  })),
  note({
    id: 'catalog:marca',
    collection: 'marca',
    title: 'Marca',
    body: 'Los cuatro elementos (tierra, agua, fuego y aire) son la base de la marca. La tipografía sigue provisional en Jost. La elección entre Jost (A) y Cinzel con Inter (B) sigue abierta.',
    tags: ['marca'],
  }),
  note({
    id: 'catalog:equipo',
    collection: 'equipo',
    title: 'Equipo',
    body: 'Todavía no hay terapeutas confirmadas en este módulo.',
    tags: ['equipo'],
  }),
  note({
    id: 'catalog:horario',
    collection: 'operacion',
    title: 'Horario',
    body: 'Horario provisional: lunes a sábado, 10:00 a 19:00, hora de Ciudad de México. Domingo cerrado. Sigue sin confirmar.',
    tags: ['horario'],
  }),
]
