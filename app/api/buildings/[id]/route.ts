/**
 * GET /api/buildings/:id
 *
 * Returns detailed information about a single building,
 * including its price estimation breakdown.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getDataProvider } from '@/app/lib/dataProvider'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json(
      { error: 'Missing building ID' },
      { status: 400 }
    )
  }

  const provider = getDataProvider()

  // Check if provider supports building queries
  if (!('getBuildingDetails' in provider)) {
    return NextResponse.json(
      { error: 'Building data not available' },
      { status: 404 }
    )
  }

  const supabaseProvider = provider as {
    getBuildingDetails: (id: string) => Promise<unknown>
  }

  const building = await supabaseProvider.getBuildingDetails(id)

  if (!building) {
    return NextResponse.json(
      { error: 'Building not found' },
      { status: 404 }
    )
  }

  return NextResponse.json(building, {
    headers: { 'Cache-Control': 'public, s-maxage=300' },
  })
}
