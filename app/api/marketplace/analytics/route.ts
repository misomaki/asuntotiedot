/**
 * GET /api/marketplace/analytics?municipality=Helsinki&limit=20&signal_type=all
 *
 * Returns marketplace analytics: top buildings, top areas, summary stats,
 * and per-city breakdown. All data is public (aggregate counts only).
 *
 * Query params:
 *   municipality — filter to a specific city (optional)
 *   limit        — max results per ranking (default 20, max 100)
 *   signal_type  — 'interest' | 'sell_intent' | 'all' for area ranking sort (default 'all')
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/app/lib/supabaseClient'
import type {
  MarketplaceAnalytics,
  TopBuildingBySignal,
  TopAreaBySignal,
  MarketplaceSummary,
  CityMarketplaceStats,
} from '@/app/types'

export const dynamic = 'force-dynamic'

const VALID_SIGNAL_TYPES = ['interest', 'sell_intent', 'all'] as const

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const municipality = params.get('municipality') || null
  const signalType = params.get('signal_type') || 'all'
  const limitParam = params.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '20', 10) || 20, 1), 100)

  if (!VALID_SIGNAL_TYPES.includes(signalType as typeof VALID_SIGNAL_TYPES[number])) {
    return NextResponse.json(
      { error: `Invalid signal_type. Must be one of: ${VALID_SIGNAL_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  const supabase = getSupabaseClient()

  // Run all queries in parallel
  const [
    summaryResult,
    topByInterestResult,
    topBySellIntentResult,
    topAreasResult,
    byCityResult,
  ] = await Promise.all([
    supabase.rpc('get_marketplace_summary', {
      p_municipality: municipality,
    }),
    supabase.rpc('get_top_buildings_by_interest', {
      p_municipality: municipality,
      p_limit: limit,
    }),
    supabase.rpc('get_top_buildings_by_sell_intent', {
      p_municipality: municipality,
      p_limit: limit,
    }),
    supabase.rpc('get_top_areas_by_signals', {
      p_municipality: municipality,
      p_signal_type: signalType,
      p_limit: limit,
    }),
    supabase.rpc('get_marketplace_by_city', {
      p_limit: 50,
    }),
  ])

  // Check for errors
  const errors: string[] = []
  if (summaryResult.error) errors.push(`summary: ${summaryResult.error.message}`)
  if (topByInterestResult.error) errors.push(`top_by_interest: ${topByInterestResult.error.message}`)
  if (topBySellIntentResult.error) errors.push(`top_by_sell_intent: ${topBySellIntentResult.error.message}`)
  if (topAreasResult.error) errors.push(`top_areas: ${topAreasResult.error.message}`)
  if (byCityResult.error) errors.push(`by_city: ${byCityResult.error.message}`)

  if (errors.length > 0) {
    console.error('Marketplace analytics errors:', errors)
    return NextResponse.json(
      { error: 'Failed to fetch analytics', details: errors },
      { status: 500 }
    )
  }

  const summary: MarketplaceSummary = summaryResult.data ?? {
    total_interests: 0,
    total_sell_intents: 0,
    total_matches: 0,
    unique_buildings_with_interest: 0,
    unique_buildings_with_sell_intent: 0,
    unique_areas_with_signals: 0,
    unique_users: 0,
  }

  const response: MarketplaceAnalytics = {
    summary,
    top_buildings_by_interest: (topByInterestResult.data ?? []) as TopBuildingBySignal[],
    top_buildings_by_sell_intent: (topBySellIntentResult.data ?? []) as TopBuildingBySignal[],
    top_areas: (topAreasResult.data ?? []) as TopAreaBySignal[],
    by_city: municipality
      ? (byCityResult.data ?? []) as CityMarketplaceStats[]  // full city list regardless of filter
      : (byCityResult.data ?? []) as CityMarketplaceStats[],
  }

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'public, s-maxage=120' },
  })
}
