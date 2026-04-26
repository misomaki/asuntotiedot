import { MetadataRoute } from 'next'
import { getDataProvider } from '@/app/lib/dataProvider'
import { getAllCitySlugs } from '@/app/lib/citySlugs'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.neliohinnat.fi'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const provider = getDataProvider()

  // Fetch all 3 property types to capture areas that only have RT/OKT data
  const [ktGeo, rtGeo, oktGeo] = await Promise.all([
    provider.getAreasGeoJSON(2024, 'kerrostalo'),
    provider.getAreasGeoJSON(2024, 'rivitalo'),
    provider.getAreasGeoJSON(2024, 'omakotitalo'),
  ])

  const codeSet = new Set<string>()
  for (const geo of [ktGeo, rtGeo, oktGeo]) {
    for (const f of geo?.features ?? []) {
      const code = f.properties?.area_code as string
      if (code) codeSet.add(code)
    }
  }
  const areaCodes = [...codeSet].sort()

  const citySlugs = getAllCitySlugs()
  // Use a fixed date representing last data update — not new Date() which Googlebot ignores
  const dataUpdated = new Date('2026-04-01')
  const staticUpdated = new Date('2026-04-10')

  return [
    {
      url: BASE_URL,
      lastModified: dataUpdated,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/kaupungit`,
      lastModified: dataUpdated,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/alue`,
      lastModified: dataUpdated,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/faq`,
      lastModified: staticUpdated,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/kayttoehdot`,
      lastModified: new Date('2026-04-13'),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/tietosuoja`,
      lastModified: new Date('2026-04-13'),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    // City landing pages
    ...citySlugs.map(slug => ({
      url: `${BASE_URL}/kaupunki/${slug}`,
      lastModified: dataUpdated,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })),
    // Area pages
    ...areaCodes.map(code => ({
      url: `${BASE_URL}/alue/${code}`,
      lastModified: dataUpdated,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ]
}
