/**
 * City slug mapping for SEO-friendly URLs.
 * Maps URL-safe slugs to city display names and postal prefixes.
 */

import { CITIES, type CityConfig } from './cities'

export interface CitySlugConfig extends CityConfig {
  slug: string
  /** Municipality names in the database for this city */
  municipalities: string[]
  /** SEO description snippet */
  seoDescription: string
  /** Coordinates for map center [lng, lat] */
  center: [number, number]
  /** Default zoom level */
  zoom: number
}

export const CITY_SLUGS: CitySlugConfig[] = [
  {
    ...CITIES[0],
    slug: 'helsinki',
    name: 'Helsinki',
    municipalities: ['Helsinki', 'Espoo', 'Vantaa', 'Kauniainen'],
    seoDescription: 'Pääkaupunkiseudun asuntohinnat kartalla. Helsinki, Espoo, Vantaa ja Kauniainen.',
    center: [24.94, 60.17],
    zoom: 11,
  },
  {
    ...CITIES[1],
    slug: 'tampere',
    name: 'Tampere',
    municipalities: ['Tampere', 'Nokia', 'Ylöjärvi', 'Kangasala'],
    seoDescription: 'Tampereen seudun asuntohinnat kartalla. Tampere, Nokia ja lähikunnat.',
    center: [23.76, 61.50],
    zoom: 12,
  },
  {
    ...CITIES[2],
    slug: 'turku',
    name: 'Turku',
    municipalities: ['Turku', 'Kaarina', 'Raisio', 'Naantali'],
    seoDescription: 'Turun seudun asuntohinnat kartalla. Turku, Kaarina ja lähikunnat.',
    center: [22.27, 60.45],
    zoom: 12,
  },
  {
    ...CITIES[3],
    slug: 'oulu',
    name: 'Oulu',
    municipalities: ['Oulu'],
    seoDescription: 'Oulun asuntohinnat kartalla. Kerrostalojen, rivitalojen ja omakotitalojen neliöhinnat.',
    center: [25.47, 65.01],
    zoom: 12,
  },
  {
    ...CITIES[4],
    slug: 'jyvaskyla',
    name: 'Jyväskylä',
    municipalities: ['Jyväskylä'],
    seoDescription: 'Jyväskylän asuntohinnat kartalla. Kerrostalojen, rivitalojen ja omakotitalojen neliöhinnat.',
    center: [25.74, 62.24],
    zoom: 12,
  },
  {
    ...CITIES[5],
    slug: 'kuopio',
    name: 'Kuopio',
    municipalities: ['Kuopio'],
    seoDescription: 'Kuopion asuntohinnat kartalla. Kerrostalojen, rivitalojen ja omakotitalojen neliöhinnat.',
    center: [27.69, 62.89],
    zoom: 12,
  },
  {
    ...CITIES[6],
    slug: 'lahti',
    name: 'Lahti',
    municipalities: ['Lahti'],
    seoDescription: 'Lahden asuntohinnat kartalla. Kerrostalojen, rivitalojen ja omakotitalojen neliöhinnat.',
    center: [25.66, 60.98],
    zoom: 12,
  },
]

export function getCityBySlug(slug: string): CitySlugConfig | undefined {
  return CITY_SLUGS.find(c => c.slug === slug)
}

export function getAllCitySlugs(): string[] {
  return CITY_SLUGS.map(c => c.slug)
}
