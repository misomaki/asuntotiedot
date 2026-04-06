/**
 * GET /api/cities/:slug
 *
 * Returns aggregated statistics for a city: prices by type,
 * top/cheapest areas, demographics summary, building stats.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCityBySlug } from '@/app/lib/citySlugs'
import { getDataProvider } from '@/app/lib/dataProvider'
export const dynamic = 'force-dynamic'

interface AreaPrice {
  area_code: string
  name: string
  municipality: string
  kerrostalo: number | null
  rivitalo: number | null
  omakotitalo: number | null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const city = getCityBySlug(slug)

  if (!city) {
    return NextResponse.json({ error: 'City not found' }, { status: 404 })
  }

  const provider = getDataProvider()
  const geojson = await provider.getAreasGeoJSON(2024, 'kerrostalo')
  const features = geojson?.features ?? []

  // Filter areas belonging to this city by postal prefix
  const cityFeatures = features.filter(f => {
    const code = f.properties?.area_code as string
    return code && city.postalPrefixes.some(p => code.startsWith(p))
  })

  // Deduplicate by area_code (Voronoi has multiple cells per postal code)
  const seenCodes = new Set<string>()
  const areaPrices: AreaPrice[] = cityFeatures
    .map(f => {
      const props = f.properties as Record<string, unknown>
      return {
        area_code: props.area_code as string,
        name: props.name as string,
        municipality: props.municipality as string,
        kerrostalo: props.price_kerrostalo as number | null,
        rivitalo: props.price_rivitalo as number | null,
        omakotitalo: props.price_omakotitalo as number | null,
      }
    })
    .filter(a => {
      if (!a.name || !a.area_code || seenCodes.has(a.area_code)) return false
      seenCodes.add(a.area_code)
      return true
    })

  const areaCodes = areaPrices.map(a => a.area_code).sort()

  // Aggregate city-level prices by type
  const ktPrices = areaPrices.map(a => a.kerrostalo).filter((p): p is number => p != null && p > 0)
  const rtPrices = areaPrices.map(a => a.rivitalo).filter((p): p is number => p != null && p > 0)
  const oktPrices = areaPrices.map(a => a.omakotitalo).filter((p): p is number => p != null && p > 0)

  const median = (arr: number[]) => {
    if (arr.length === 0) return null
    const sorted = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  }

  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null

  // Top 5 most expensive and cheapest areas (by kerrostalo, fallback rivitalo)
  const areasWithPrice = areaPrices
    .map(a => ({ ...a, price: a.kerrostalo ?? a.rivitalo ?? a.omakotitalo }))
    .filter(a => a.price != null && a.price > 0)
    .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))

  const topAreas = areasWithPrice.slice(0, 5).map(a => ({
    area_code: a.area_code,
    name: a.name,
    price: a.price,
  }))

  const cheapestAreas = areasWithPrice.slice(-5).reverse().map(a => ({
    area_code: a.area_code,
    name: a.name,
    price: a.price,
  }))

  // Fetch one representative area for demographic data
  const representativeCode = areaCodes[Math.floor(areaCodes.length / 2)]
  let demographics = null
  if (representativeCode) {
    try {
      const areaDetails = await provider.getAreaDetails(representativeCode, 2024)
      if (areaDetails?.demographics) {
        demographics = {
          population: areaDetails.demographics.population,
          median_age: areaDetails.demographics.median_age,
        }
      }
    } catch {
      // Skip demographics if fetch fails
    }
  }

  const result = {
    city: city.name,
    slug: city.slug,
    areaCount: areaCodes.length,
    center: city.center,
    zoom: city.zoom,
    prices: {
      kerrostalo: { median: median(ktPrices), avg: avg(ktPrices), count: ktPrices.length },
      rivitalo: { median: median(rtPrices), avg: avg(rtPrices), count: rtPrices.length },
      omakotitalo: { median: median(oktPrices), avg: avg(oktPrices), count: oktPrices.length },
    },
    topAreas,
    cheapestAreas,
    demographics,
    areaCodes,
  }

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' },
  })
}
