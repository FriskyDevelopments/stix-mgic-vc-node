/**
 * Sample menu for the 4 Elementos demo.
 * Prices are NOT Rangel's. Her Notion panel still has those fields empty.
 * Every row is marked `demo: true` so a screen cannot present them as confirmed.
 */
export const ELEMENTS = ['tierra', 'agua', 'fuego', 'aire'] as const
export type ElementId = (typeof ELEMENTS)[number]

export interface ServiceOffer {
  id: string
  name: string
  durationMin: number
  priceMxn: number
  element: ElementId
  summary: string
  demo: true
}

export const DEMO_SERVICES: readonly ServiceOffer[] = [
  {
    id: 'masaje-relajante',
    name: 'Masaje relajante',
    durationMin: 60,
    priceMxn: 900,
    element: 'agua',
    summary: 'Ritmo lento para soltar el día.',
    demo: true,
  },
  {
    id: 'descontracturante',
    name: 'Descontracturante',
    durationMin: 50,
    priceMxn: 950,
    element: 'tierra',
    summary: 'Trabajo más firme sobre la tensión.',
    demo: true,
  },
  {
    id: 'piedras-calientes',
    name: 'Piedras calientes',
    durationMin: 75,
    priceMxn: 1100,
    element: 'fuego',
    summary: 'Calor constante, sin prisa.',
    demo: true,
  },
  {
    id: 'reflexologia',
    name: 'Reflexología',
    durationMin: 45,
    priceMxn: 700,
    element: 'tierra',
    summary: 'Pies, palmas y un cierre más corto.',
    demo: true,
  },
  {
    id: 'aromaterapia',
    name: 'Aromaterapia',
    durationMin: 60,
    priceMxn: 850,
    element: 'aire',
    summary: 'Aceite y respiro. El aroma se confirma en la cita.',
    demo: true,
  },
]

export function findService(id: string): ServiceOffer | null {
  return DEMO_SERVICES.find((service) => service.id === id) ?? null
}

export function priceCentavos(service: ServiceOffer): number {
  return service.priceMxn * 100
}
