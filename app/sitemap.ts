import { MetadataRoute } from 'next'
import { getDataProvider } from '@/app/lib/dataProvider'
import { getAllCitySlugs } from '@/app/lib/citySlugs'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://neliohinnat.fi'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const provider = getDataProvider()
  const geojson = await provider.getAreasGeoJSON(2024, 'kerrostalo')
  const features = geojson?.features ?? []

  const areaCodes = features
    .map(f => f.properties?.area_code as string)
    .filter(Boolean)
    .sort()

  const citySlugs = getAllCitySlugs()
  const now = new Date()

  return [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/kaupungit`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/alue`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/faq`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/kayttoehdot`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/tietosuoja`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    // City landing pages
    ...citySlugs.map(slug => ({
      url: `${BASE_URL}/kaupunki/${slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })),
    // Area pages
    ...areaCodes.map(code => ({
      url: `${BASE_URL}/alue/${code}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ]
}
