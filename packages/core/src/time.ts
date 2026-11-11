// Mexico dropped daylight saving time in 2022. Mexico City stays UTC−6 all year.
export const TIME_ZONE_OFFSETS: Readonly<Record<string, string>> = {
  'America/Mexico_City': '-06:00',
}

export function offsetFor(timeZone: string): string | null {
  return TIME_ZONE_OFFSETS[timeZone] ?? null
}
