/**
 * POST /api/marketplace/sell-intent — Announce selling intent
 * DELETE /api/marketplace/sell-intent — Remove sell intent
 *
 * Requires authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server'
import { isValidUUID, sanitizeNote, isPositiveNumber } from '@/app/lib/validation'
import { getAuthenticatedSupabase, getSupabaseAdmin } from '@/app/lib/supabaseClient'

export const dynamic = 'force-dynamic'

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

  if (!isValidUUID(building_id)) {
    return NextResponse.json({ error: 'Invalid building_id' }, { status: 400 })
  }

  // Verify user has registered this building as their address
  const admin = getSupabaseAdmin()
  const { data: userAddr } = await admin
    .from('user_addresses')
    .select('id')
    .eq('user_id', user.id)
    .eq('building_id', building_id)
    .limit(1)

  if (!userAddr || userAddr.length === 0) {
    return NextResponse.json(
      { error: 'Voit ilmoittaa myyntiin vain osoitteeseesi linkitetyn rakennuksen. Lisää osoitteesi ensin asetuksissa.' },
      { status: 403 }
    )
  }

  // Validate property_type if provided
  const validTypes = ['kerrostalo', 'rivitalo', 'omakotitalo']
  if (property_type && !validTypes.includes(property_type)) {
    return NextResponse.json({ error: 'Invalid property_type' }, { status: 400 })
  }

  // Validate numeric fields
  if (asking_price_per_sqm != null && !isPositiveNumber(asking_price_per_sqm)) {
    return NextResponse.json({ error: 'Invalid asking_price_per_sqm' }, { status: 400 })
  }

  // Sanitize note
  const sanitizedNote = sanitizeNote(note, 500)

  const { data, error } = await supabase
    .from('building_sell_intents')
    .upsert(
      {
        user_id: user.id,
        building_id,
        asking_price_per_sqm: asking_price_per_sqm ?? null,
        property_type: property_type ?? null,
        note: sanitizedNote,
      },
      { onConflict: 'user_id,building_id' }
    )
    .select()
    .single()

  if (error) {
    console.error('Sell intent upsert error:', error)
    return NextResponse.json({ error: 'Failed to save sell intent' }, { status: 500 })
  }

  // Check for match: are there interested buyers on this building?
  const { count: interestCount } = await admin
    .from('building_interests')
    .select('*', { count: 'exact', head: true })
    .eq('building_id', building_id)

  return NextResponse.json({
    ...data,
    match: interestCount && interestCount > 0
      ? { interest_count: interestCount }
      : null,
  }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const supabase = await getAuthenticatedSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const buildingId = request.nextUrl.searchParams.get('buildingId')
  if (!isValidUUID(buildingId)) {
    return NextResponse.json({ error: 'Invalid buildingId' }, { status: 400 })
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
