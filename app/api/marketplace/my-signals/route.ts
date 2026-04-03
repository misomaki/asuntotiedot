/**
 * GET /api/marketplace/my-signals
 *
 * Returns the authenticated user's own interest & sell-intent signals
 * with building details (address, area, price).
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { UserSignalWithBuilding } from '@/app/types'

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set(name, value, options)
            } catch {
              // Server component — ignore
            }
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch interests and sell intents in parallel
  const [interestsResult, sellIntentsResult] = await Promise.all([
    supabase
      .from('building_interests')
      .select(`
        id,
        building_id,
        room_count,
        min_sqm,
        max_sqm,
        max_price_per_sqm,
        note,
        created_at,
        expires_at,
        buildings!inner(address, area_code, estimated_price_per_sqm)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('building_sell_intents')
      .select(`
        id,
        building_id,
        asking_price_per_sqm,
        property_type,
        note,
        created_at,
        expires_at,
        buildings!inner(address, area_code, estimated_price_per_sqm)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  if (interestsResult.error) {
    console.error('My interests fetch error:', interestsResult.error)
  }
  if (sellIntentsResult.error) {
    console.error('My sell intents fetch error:', sellIntentsResult.error)
  }

  const signals: UserSignalWithBuilding[] = []

  // Map interests
  for (const row of interestsResult.data ?? []) {
    const b = row.buildings as Record<string, unknown>
    signals.push({
      id: row.id,
      building_id: row.building_id,
      address: (b?.address as string) ?? null,
      area_name: null,
      area_code: (b?.area_code as string) ?? null,
      estimated_price_per_sqm: (b?.estimated_price_per_sqm as number) ?? null,
      created_at: row.created_at,
      expires_at: row.expires_at,
      type: 'interest',
      room_count: row.room_count,
      min_sqm: row.min_sqm,
      max_sqm: row.max_sqm,
      max_price_per_sqm: row.max_price_per_sqm,
      note: row.note,
    })
  }

  // Map sell intents
  for (const row of sellIntentsResult.data ?? []) {
    const b = row.buildings as Record<string, unknown>
    signals.push({
      id: row.id,
      building_id: row.building_id,
      address: (b?.address as string) ?? null,
      area_name: null,
      area_code: (b?.area_code as string) ?? null,
      estimated_price_per_sqm: (b?.estimated_price_per_sqm as number) ?? null,
      created_at: row.created_at,
      expires_at: row.expires_at,
      type: 'sell_intent',
      asking_price_per_sqm: row.asking_price_per_sqm,
      note: row.note,
    })
  }

  // Sort by created_at descending
  signals.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return NextResponse.json(signals)
}
