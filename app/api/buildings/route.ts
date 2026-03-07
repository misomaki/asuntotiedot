/**
 * GET /api/buildings?west=...&south=...&east=...&north=...&year=2024
 *
 * Returns building outlines as GeoJSON within the given bounding box.
 * Only returns buildings with estimated prices. Limited to 5000 buildings.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getDataProvider } from '@/app/lib/dataProvider'
import { SupabaseDataProvider } from '@/app/lib/supabaseDataProvider'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const west = parseFloat(searchParams.get('west') ?? '0')
  const south = parseFloat(searchParams.get('south') ?? '0')
  const east = parseFloat(searchParams.get('east') ?? '0')
  const north = parseFloat(searchParams.get('north') ?? '0')
  const year = parseInt(searchParams.get('year') ?? '2024', 10)

  // Validate bounds
  if (
    isNaN(west) || isNaN(south) || isNaN(east) || isNaN(north) ||
    west >= east || south >= north
  ) {
    return NextResponse.json(
      { error: 'Invalid bounding box parameters' },
      { status: 400 }
    )
  }

  // Only available with Supabase provider
  const provider = getDataProvider()
  if (!('getBuildingsGeoJSON' in provider)) {
    return NextResponse.json(
      { type: 'FeatureCollection', features: [] },
      { headers: { 'Cache-Control': 'public, s-maxage=60' } }
    )
  }

  const supabaseProvider = provider as SupabaseDataProvider
  const geojson = await supabaseProvider.getBuildingsGeoJSON(
    [west, south, east, north],
    year
  )

  return NextResponse.json(geojson, {
    headers: { 'Cache-Control': 'public, s-maxage=300' },
  })
}
