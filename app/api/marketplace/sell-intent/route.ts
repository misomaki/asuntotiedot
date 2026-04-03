/**
 * POST /api/marketplace/sell-intent — Announce selling intent
 * DELETE /api/marketplace/sell-intent — Remove sell intent
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
  const { building_id, asking_price_per_sqm, property_type, note } = body as {
    building_id: string
    asking_price_per_sqm?: number
    property_type?: string
    note?: string
  }

  if (!building_id) {
    return NextResponse.json({ error: 'Missing building_id' }, { status: 400 })
  }

  if (note && note.length > 500) {
    return NextResponse.json({ error: 'Note too long (max 500 chars)' }, { status: 400 })
  }

  // Validate property_type if provided
  const validTypes = ['kerrostalo', 'rivitalo', 'omakotitalo']
  if (property_type && !validTypes.includes(property_type)) {
    return NextResponse.json({ error: 'Invalid property_type' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('building_sell_intents')
    .upsert(
      {
        user_id: user.id,
        building_id,
        asking_price_per_sqm: asking_price_per_sqm ?? null,
        property_type: property_type ?? null,
        note: note ?? null,
      },
      { onConflict: 'user_id,building_id' }
    )
    .select()
    .single()

  if (error) {
    console.error('Sell intent upsert error:', error)
    return NextResponse.json({ error: 'Failed to save sell intent' }, { status: 500 })
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
    .from('building_sell_intents')
    .delete()
    .eq('user_id', user.id)
    .eq('building_id', buildingId)

  if (error) {
    console.error('Sell intent delete error:', error)
    return NextResponse.json({ error: 'Failed to remove sell intent' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
