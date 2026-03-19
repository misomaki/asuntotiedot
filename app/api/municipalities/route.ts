/**
 * GET /api/municipalities
 *
 * Returns actual municipality boundary polygons as GeoJSON FeatureCollection
 * with median price per municipality. Used for zoomed-out map overview.
 *
 * Municipality geometries come from Statistics Finland WFS (tilastointialueet).
 * Prices come from the get_municipality_prices RPC (cascading fallback).
 *
 * Query parameters:
 *   - year  (number, default 2024)
 *   - type  ('kerrostalo' | 'rivitalo' | 'omakotitalo', default 'kerrostalo')
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { PropertyType } from '@/app/types'

const VALID_PROPERTY_TYPES: PropertyType[] = [
  'kerrostalo',
  'rivitalo',
  'omakotitalo',
]

function isValidPropertyType(value: string): value is PropertyType {
  return (VALID_PROPERTY_TYPES as string[]).includes(value)
}

/** Statistics Finland WFS — municipality boundaries at 1:1M scale */
const MUNICIPALITY_WFS_URL =
  'https://geo.stat.fi/geoserver/tilastointialueet/ows'

interface WFSFeature {
  type: 'Feature'
  properties: {
    kunta: string   // municipality code e.g. "091"
    nimi: string     // Finnish name e.g. "Helsinki"
    [key: string]: unknown
  }
  geometry: {
    type: string
    coordinates: unknown
  }
}

/** Cache municipality boundaries in-memory (they don't change within a process) */
let cachedBoundaries: WFSFeature[] | null = null

async function fetchMunicipalityBoundaries(): Promise<WFSFeature[]> {
  if (cachedBoundaries) return cachedBoundaries

  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeName: 'tilastointialueet:kunta1000k_2024',
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
  })

  const response = await fetch(`${MUNICIPALITY_WFS_URL}?${params}`)
  if (!response.ok) {
    throw new Error(`WFS error ${response.status}: ${await response.text()}`)
  }

  const geojson = await response.json()
  cachedBoundaries = geojson.features ?? []
  console.log(`Cached ${cachedBoundaries!.length} municipality boundaries from WFS`)
  return cachedBoundaries!
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl

    const yearParam = searchParams.get('year')
    const year = yearParam ? parseInt(yearParam, 10) : 2024
    if (Number.isNaN(year)) {
      return NextResponse.json({ error: 'Invalid year parameter' }, { status: 400 })
    }

    const typeParam = searchParams.get('type') ?? 'kerrostalo'
    if (!isValidPropertyType(typeParam)) {
      return NextResponse.json(
        { error: `Invalid property type. Must be one of: ${VALID_PROPERTY_TYPES.join(', ')}` },
        { status: 400 },
      )
    }

    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!sbUrl || !sbKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    // Fetch municipality boundaries and prices in parallel
    const supabase = createClient(sbUrl, sbKey, { auth: { persistSession: false } })

    const [boundaries, priceResult] = await Promise.all([
      fetchMunicipalityBoundaries(),
      supabase.rpc('get_municipality_prices', {
        p_year: year,
        p_property_type: typeParam,
      }),
    ])

    if (priceResult.error) {
      console.error('get_municipality_prices error:', priceResult.error.message)
      return NextResponse.json({ error: priceResult.error.message }, { status: 500 })
    }

    // Build price lookup by municipality name
    const priceByName = new Map<string, number>()
    for (const row of priceResult.data ?? []) {
      priceByName.set(row.municipality, Number(row.median_price))
    }

    // Include ALL municipalities — priced ones get their color, others get neutral fill
    const features = boundaries.map((f) => ({
      type: 'Feature' as const,
      properties: {
        municipality: f.properties.nimi,
        price_per_sqm_avg: priceByName.get(f.properties.nimi) ?? null,
      },
      geometry: f.geometry,
    }))

    // Compute price range from municipalities that have data
    const pricedValues = [...priceByName.values()]
    const minPrice = Math.min(...pricedValues)
    const maxPrice = Math.max(...pricedValues)

    const geojson = {
      type: 'FeatureCollection',
      features,
      priceRange: { min: minPrice, max: maxPrice },
    }

    return NextResponse.json(geojson, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('GET /api/municipalities failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
