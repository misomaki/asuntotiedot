/**
 * Shared city configuration — single source of truth for postal prefixes.
 * Used by both the frontend (Voronoi filtering) and data import scripts.
 */

export interface CityConfig {
  name: string
  postalPrefixes: string[]
  bbox: [number, number, number, number]
}

export const CITIES: CityConfig[] = [
  { name: 'Helsinki metro', postalPrefixes: ['00', '01', '02'], bbox: [24.50, 60.05, 25.30, 60.35] },
  { name: 'Tampere', postalPrefixes: ['33', '34', '37'], bbox: [23.42, 61.38, 24.00, 61.60] },
  { name: 'Turku', postalPrefixes: ['20', '21'], bbox: [22.05, 60.35, 22.50, 60.55] },
  { name: 'Oulu', postalPrefixes: ['90'], bbox: [25.25, 64.85, 25.70, 65.15] },
  { name: 'Jyväskylä', postalPrefixes: ['40'], bbox: [25.55, 62.15, 25.95, 62.35] },
  { name: 'Kuopio', postalPrefixes: ['70'], bbox: [27.50, 62.82, 27.90, 63.00] },
  { name: 'Lahti', postalPrefixes: ['15'], bbox: [25.55, 60.93, 25.80, 61.05] },
]

/** All postal prefixes across all cities */
export const ALL_POSTAL_PREFIXES = CITIES.flatMap((c) => c.postalPrefixes)

/** Check if a postal code belongs to one of our target cities */
export function isTargetPostalCode(postalCode: string): boolean {
  return ALL_POSTAL_PREFIXES.some((prefix) => postalCode.startsWith(prefix))
}
