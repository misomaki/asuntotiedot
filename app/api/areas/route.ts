/**
 * GET /api/areas
 *
 * Returns all postal-code areas as a GeoJSON FeatureCollection with price
 * data merged into each feature's properties.
 *
 * Query parameters:
 *   - year  (number, default 2024)
 *   - type  ('kerrostalo' | 'rivitalo' | 'omakotitalo', default 'kerrostalo')
 */

import { NextRequest, NextResponse } from 'next/server'
import { getDataProvider } from '@/app/lib/dataProvider'
import type { PropertyType } from '@/app/types'

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

    return NextResponse.json(geojson, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600',
      },
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Internal server error'
    console.error('GET /api/areas failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
