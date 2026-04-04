/**
 * GET /api/marketplace/signals?buildingId=...
 *
 * Returns aggregate signal counts for a building (public, no user details).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/app/lib/supabaseClient'
import type { BuildingSignals } from '@/app/types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const buildingId = request.nextUrl.searchParams.get('buildingId')

  if (!buildingId) {
    return NextResponse.json(
      { error: 'Missing buildingId parameter' },
      { status: 400 }
    )
  }

  const supabase = getSupabaseClient()

  const { data, error } = await supabase.rpc('get_building_signals', {
    p_building_id: buildingId,
  })

  if (error) {
    console.error('get_building_signals error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch signals' },
      { status: 500 }
    )
  }

  const signals: BuildingSignals = data ?? {
    interest_count: 0,
    sell_intent_count: 0,
    has_sell_intent: false,
  }

  return NextResponse.json(signals, {
    headers: { 'Cache-Control': 'public, s-maxage=60' },
  })
}
