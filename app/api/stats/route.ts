/**
 * GET /api/stats
 *
 * Returns aggregated statistics across all areas. Useful for heatmap overlays
 * and dashboard summaries.
 *
 * Response includes:
 *   - total_areas: number of postal-code areas
 *   - price_range: { min, max } across all areas for the latest year
 *   - avg_prices_by_municipality: average price per sqm grouped by municipality
 *   - year: the year used for aggregation
 */

import { NextRequest, NextResponse } from 'next/server'
import { getDataProvider } from '@/app/lib/dataProvider'
import type { PropertyType } from '@/app/types'

interface MunicipalityAggregation {
  municipality: string
  avg_price_per_sqm: number
  area_count: number
  total_transactions: number
}

interface StatsResponse {
  total_areas: number
  year: number
  property_type: PropertyType
  price_range: {
    min: number | null
    max: number | null
  }
  avg_prices_by_municipality: MunicipalityAggregation[]
}

const VALID_PROPERTY_TYPES: PropertyType[] = [
  'kerrostalo',
  'rivitalo',
  'omakotitalo',
]

function isValidPropertyType(value: string): value is PropertyType {
  return (VALID_PROPERTY_TYPES as string[]).includes(value)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl

    const yearParam = searchParams.get('year')
    const year = yearParam ? parseInt(yearParam, 10) : 2024

    if (Number.isNaN(year)) {
      return NextResponse.json(
        { error: 'Invalid year parameter' },
        { status: 400 },
      )
    }

    const typeParam = searchParams.get('type') ?? 'kerrostalo'

    if (!isValidPropertyType(typeParam)) {
      return NextResponse.json(
        {
          error: `Invalid property type. Must be one of: ${VALID_PROPERTY_TYPES.join(', ')}`,
        },
        { status: 400 },
      )
    }

    const provider = getDataProvider()
    const geojson = await provider.getAreasGeoJSON(year, typeParam)

    // Collect all price values and group by municipality
    const municipalityMap = new Map<
      string,
      { totalPrice: number; count: number; totalTransactions: number }
    >()

    let minPrice: number | null = null
    let maxPrice: number | null = null

    for (const feature of geojson.features) {
      const props = feature.properties
      const price = props.price_per_sqm_avg as number | null
      const municipality = props.municipality as string
      const transactions = (props.transaction_count as number) ?? 0

      if (price !== null) {
        if (minPrice === null || price < minPrice) minPrice = price
        if (maxPrice === null || price > maxPrice) maxPrice = price
      }

      const existing = municipalityMap.get(municipality)
      if (existing) {
        if (price !== null) {
          existing.totalPrice += price
          existing.count += 1
        }
        existing.totalTransactions += transactions
      } else {
        municipalityMap.set(municipality, {
          totalPrice: price ?? 0,
          count: price !== null ? 1 : 0,
          totalTransactions: transactions,
        })
      }
    }

    const avgPricesByMunicipality: MunicipalityAggregation[] = Array.from(
      municipalityMap.entries(),
    )
      .map(([municipality, data]) => ({
        municipality,
        avg_price_per_sqm:
          data.count > 0 ? Math.round(data.totalPrice / data.count) : 0,
        area_count: data.count,
        total_transactions: data.totalTransactions,
      }))
      .sort((a, b) => b.avg_price_per_sqm - a.avg_price_per_sqm)

    const response: StatsResponse = {
      total_areas: geojson.features.length,
      year,
      property_type: typeParam,
      price_range: {
        min: minPrice,
        max: maxPrice,
      },
      avg_prices_by_municipality: avgPricesByMunicipality,
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600',
      },
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Internal server error'
    console.error('GET /api/stats failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
