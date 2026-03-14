/**
 * Configuration for data import scripts.
 * Defines city bounding boxes and postal code prefix filters.
 */

export interface CityConfig {
  name: string
  /** Postal code prefixes to include (e.g. ['00', '01', '02'] for Helsinki metro) */
  postalPrefixes: string[]
  /** [minLng, minLat, maxLng, maxLat] */
  bbox: [number, number, number, number]
}

export const CITIES: CityConfig[] = [
  {
    name: 'Helsinki metro',
    postalPrefixes: ['00', '01', '02'],
    bbox: [24.50, 60.05, 25.30, 60.35],
  },
  {
    name: 'Tampere',
    postalPrefixes: ['33', '34'],
    bbox: [23.55, 61.38, 24.00, 61.60],
  },
  {
    name: 'Turku',
    postalPrefixes: ['20', '21'],
    bbox: [22.05, 60.35, 22.50, 60.55],
  },
  {
    name: 'Oulu',
    postalPrefixes: ['90'],
    bbox: [25.25, 64.85, 25.70, 65.15],
  },
  {
    name: 'Jyväskylä',
    postalPrefixes: ['40'],
    bbox: [25.55, 62.15, 25.95, 62.35],
  },
  {
    name: 'Kuopio',
    postalPrefixes: ['70'],
    bbox: [27.50, 62.82, 27.90, 63.00],
  },
  {
    name: 'Lahti',
    postalPrefixes: ['15'],
    bbox: [25.55, 60.93, 25.80, 61.05],
  },
]

/** All postal prefixes across all cities */
export const ALL_POSTAL_PREFIXES = CITIES.flatMap((c) => c.postalPrefixes)

/** Check if a postal code belongs to one of our target cities */
export function isTargetPostalCode(postalCode: string): boolean {
  return ALL_POSTAL_PREFIXES.some((prefix) => postalCode.startsWith(prefix))
}

/** StatFin PxWeb API base URL */
export const PXWEB_BASE_URL =
  'https://pxdata.stat.fi/PXWeb/api/v1/fi/StatFin/ashi/statfin_ashi_pxt_13mu.px'

/** Paavo WFS base URL */
export const PAAVO_WFS_URL =
  'https://geo.stat.fi/geoserver/postialue/ows'
