/**
 * GET    /api/marketplace/my-addresses — List user's registered addresses
 * POST   /api/marketplace/my-addresses — Add a new address (geocode → match building)
 * DELETE /api/marketplace/my-addresses — Remove an address
 *
 * Requires authenticated user. Max 3 addresses per user.
 */

import { NextRequest, NextResponse } from 'next/server'
import { isValidUUID, sanitizeNote } from '@/app/lib/validation'
import { searchAddresses } from '@/app/lib/geocoding'
import { getAuthenticatedSupabase, getSupabaseAdmin } from '@/app/lib/supabaseClient'

const MAX_ADDRESSES = 3

// ── GET: list user's addresses with building info ──
export async function GET() {
  const supabase = await getAuthenticatedSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Use admin client to join with buildings (RLS won't block buildings read)
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('user_addresses')
    .select(`
      id,
      user_id,
      address_text,
      building_id,
      latitude,
      longitude,
      created_at
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Fetch user addresses error:', error)
    return NextResponse.json({ error: 'Failed to fetch addresses' }, { status: 500 })
  }

  // Enrich with building info
  const buildingIds = (data || []).map(a => a.building_id).filter(Boolean) as string[]
  let buildingMap: Record<string, { address: string | null; building_type: string | null; construction_year: number | null; estimated_price_per_sqm: number | null }> = {}

  if (buildingIds.length > 0) {
    const { data: buildings } = await admin
      .from('buildings')
      .select('id, address, building_type, construction_year, estimated_price_per_sqm')
      .in('id', buildingIds)

    if (buildings) {
      buildingMap = Object.fromEntries(
        buildings.map(b => [b.id, {
          address: b.address,
          building_type: b.building_type,
          construction_year: b.construction_year,
          estimated_price_per_sqm: b.estimated_price_per_sqm,
        }])
      )
    }
  }

  const enriched = (data || []).map(addr => ({
    ...addr,
    building_address: addr.building_id ? buildingMap[addr.building_id]?.address ?? null : null,
    building_type: addr.building_id ? buildingMap[addr.building_id]?.building_type ?? null : null,
    construction_year: addr.building_id ? buildingMap[addr.building_id]?.construction_year ?? null : null,
    estimated_price_per_sqm: addr.building_id ? buildingMap[addr.building_id]?.estimated_price_per_sqm ?? null : null,
  }))

  return NextResponse.json(enriched)
}

// ── POST: add a new address ──
export async function POST(request: NextRequest) {
  const supabase = await getAuthenticatedSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { address } = body as { address?: string }

  if (!address || typeof address !== 'string') {
    return NextResponse.json({ error: 'Osoite puuttuu' }, { status: 400 })
  }

  const sanitized = sanitizeNote(address, 200)
  if (!sanitized) {
    return NextResponse.json({ error: 'Virheellinen osoite' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  // Check address count limit
  const { count } = await admin
    .from('user_addresses')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if ((count ?? 0) >= MAX_ADDRESSES) {
    return NextResponse.json(
      { error: `Voit lisätä enintään ${MAX_ADDRESSES} osoitetta` },
      { status: 400 }
    )
  }

  // Geocode the address using Nominatim
  let lat: number | null = null
  let lng: number | null = null
  let buildingId: string | null = null

  try {
    const results = await searchAddresses(sanitized, undefined, 1)
    if (results.length > 0) {
      lat = results[0].latitude
      lng = results[0].longitude
    }
  } catch (err) {
    console.error('Geocoding error:', err)
    // Continue without coordinates — user can still save the address
  }

  // If geocoded, find nearest building
  if (lat != null && lng != null) {
    const { data: nearestBuildings } = await admin.rpc('find_nearest_building', {
      p_lat: lat,
      p_lng: lng,
      p_max_distance_m: 50,
    })

    if (nearestBuildings && nearestBuildings.length > 0) {
      buildingId = nearestBuildings[0].building_id
    }
  }

  // Insert the address
  const { data: inserted, error } = await admin
    .from('user_addresses')
    .insert({
      user_id: user.id,
      address_text: sanitized,
      building_id: buildingId,
      latitude: lat,
      longitude: lng,
    })
    .select()
    .single()

  if (error) {
    console.error('Insert user address error:', error)
    return NextResponse.json({ error: 'Osoitteen tallentaminen epäonnistui' }, { status: 500 })
  }

  // Enrich with building info
  let buildingInfo = null
  if (buildingId) {
    const { data: building } = await admin
      .from('buildings')
      .select('address, building_type, construction_year, estimated_price_per_sqm')
      .eq('id', buildingId)
      .single()
    buildingInfo = building
  }

  return NextResponse.json({
    ...inserted,
    building_address: buildingInfo?.address ?? null,
    building_type: buildingInfo?.building_type ?? null,
    construction_year: buildingInfo?.construction_year ?? null,
    estimated_price_per_sqm: buildingInfo?.estimated_price_per_sqm ?? null,
  }, { status: 201 })
}

// ── DELETE: remove an address ──
export async function DELETE(request: NextRequest) {
  const supabase = await getAuthenticatedSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const addressId = request.nextUrl.searchParams.get('id')
  if (!isValidUUID(addressId)) {
    return NextResponse.json({ error: 'Virheellinen osoite-ID' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  // Single DELETE with ownership filter — returns deleted row if it existed
  const { data: deleted, error } = await admin
    .from('user_addresses')
    .delete()
    .eq('id', addressId)
    .eq('user_id', user.id)
    .select('id')

  if (error) {
    console.error('Delete user address error:', error)
    return NextResponse.json({ error: 'Osoitteen poistaminen epäonnistui' }, { status: 500 })
  }

  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'Osoitetta ei löytynyt' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
