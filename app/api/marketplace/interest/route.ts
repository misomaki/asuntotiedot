/**
 * POST /api/marketplace/interest — Express interest in a building
 * DELETE /api/marketplace/interest — Remove interest
 *
 * Requires authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getAuthenticatedSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
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
}

export async function POST(request: NextRequest) {
  const supabase = await getAuthenticatedSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { building_id, room_count, min_sqm, max_sqm, max_price_per_sqm, note } = body as {
    building_id: string
    room_count?: string
    min_sqm?: number
    max_sqm?: number
    max_price_per_sqm?: number
    note?: string
  }

  if (!building_id) {
    return NextResponse.json({ error: 'Missing building_id' }, { status: 400 })
  }

  // Validate room_count
  const validRoomCounts = ['1', '2', '3', '4', '5+']
  if (room_count && !validRoomCounts.includes(room_count)) {
    return NextResponse.json({ error: 'Invalid room_count' }, { status: 400 })
  }

  // Validate sqm range
  if (min_sqm != null && max_sqm != null && min_sqm > max_sqm) {
    return NextResponse.json({ error: 'min_sqm cannot exceed max_sqm' }, { status: 400 })
  }

  // Validate note length
  if (note && note.length > 280) {
    return NextResponse.json({ error: 'Note too long (max 280 chars)' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('building_interests')
    .upsert(
      {
        user_id: user.id,
        building_id,
        room_count: room_count ?? null,
        min_sqm: min_sqm ?? null,
        max_sqm: max_sqm ?? null,
        max_price_per_sqm: max_price_per_sqm ?? null,
        note: note ?? null,
      },
      { onConflict: 'user_id,building_id' }
    )
    .select()
    .single()

  if (error) {
    console.error('Interest upsert error:', error)
    return NextResponse.json({ error: 'Failed to save interest' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const supabase = await getAuthenticatedSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const buildingId = request.nextUrl.searchParams.get('buildingId')
  if (!buildingId) {
    return NextResponse.json({ error: 'Missing buildingId' }, { status: 400 })
  }

  const { error } = await supabase
    .from('building_interests')
    .delete()
    .eq('user_id', user.id)
    .eq('building_id', buildingId)

  if (error) {
    console.error('Interest delete error:', error)
    return NextResponse.json({ error: 'Failed to remove interest' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
