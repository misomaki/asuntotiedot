/**
 * GET /api/prices
 *
 * Returns the price trend for a given area and property type, sorted by year.
 *
 * Query parameters:
 *   - area  (string, required) – postal code / area code
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

    const areaCode = searchParams.get('area')

    if (!areaCode) {
      return NextResponse.json(
        { error: 'Missing required query parameter: area' },
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
    const prices = await provider.getPriceTrend(areaCode, typeParam)

    return NextResponse.json(prices)
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Internal server error'
    console.error('GET /api/prices failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
