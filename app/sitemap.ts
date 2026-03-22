import { MetadataRoute } from 'next'
import { getDataProvider } from '@/app/lib/dataProvider'

const BASE_URL = 'https://neliot.vercel.app'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const provider = getDataProvider()
  const geojson = await provider.getAreasGeoJSON(2024, 'kerrostalo')
  const features = geojson?.features ?? []

  const areaCodes = features
    .map(f => f.properties?.area_code as string)
    .filter(Boolean)
    .sort()

  const now = new Date()

  return [
    // Main pages
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/alue`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    // Area pages
    ...areaCodes.map(code => ({
      url: `${BASE_URL}/alue/${code}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ]
}
