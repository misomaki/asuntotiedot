/**
 * POST /api/marketplace/search
 *
 * Server-side building search using structured filters.
 * Returns matching buildings with location data for map display.
 *
 * Performance: resolves area_ids first (small table), then queries buildings
 * by area_id (indexed) without expensive join. Uses estimated count.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/app/lib/supabaseClient'
import type { AISearchFilters, AISearchResult } from '@/app/types'

export async function POST(request: NextRequest) {
  try {
    const { filters, limit = 200, offset = 0 } = await request.json() as {
      filters: AISearchFilters
      limit?: number
      offset?: number
    }

    if (!filters || typeof filters !== 'object') {
      return NextResponse.json({ error: 'Missing filters' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Step 1: Resolve area_ids from area filters (fast — areas table is small, ~400 rows)
    let areaIds: string[] | null = null
    const areaLookup = new Map<string, { area_code: string; name: string; municipality: string }>()

    if (filters.area_codes?.length || filters.municipality) {
      let areaQuery = supabase
        .from('areas')
        .select('id, area_code, name, municipality')

      if (filters.area_codes?.length) {
        areaQuery = areaQuery.in('area_code', filters.area_codes)
      }
      if (filters.municipality) {
        areaQuery = areaQuery.ilike('municipality', filters.municipality)
      }

      const { data: areas, error: areaError } = await areaQuery

      if (areaError) {
        console.error('Area lookup error:', areaError.message)
        return NextResponse.json(
          { error: `Area lookup failed: ${areaError.message}` },
          { status: 500 }
        )
      }

      if (!areas || areas.length === 0) {
        // No matching areas — return empty results immediately
        return NextResponse.json({ total: 0, buildings: [], clusters: [] })
      }

      areaIds = areas.map(a => a.id as string)
      for (const a of areas) {
        areaLookup.set(a.id as string, {
          area_code: a.area_code as string,
          name: a.name as string,
          municipality: a.municipality as string,
        })
      }
    }

    // Step 2: Query buildings directly (no join — uses area_id index)
    let query = supabase
      .from('buildings')
      .select(
        'id, address, estimated_price_per_sqm, construction_year, floor_count, apartment_count, footprint_area_sqm, centroid, area_id',
        { count: 'estimated' }
      )
      .eq('is_residential', true)
      .not('estimated_price_per_sqm', 'is', null)

    // Filter by pre-resolved area_ids
    if (areaIds) {
      query = query.in('area_id', areaIds)
    }

    // Price filters
    if (filters.max_price_per_sqm != null) {
      query = query.lte('estimated_price_per_sqm', filters.max_price_per_sqm)
    }
    if (filters.min_price_per_sqm != null) {
      query = query.gte('estimated_price_per_sqm', filters.min_price_per_sqm)
    }

    // Construction year
    if (filters.min_construction_year != null) {
      query = query.gte('construction_year', filters.min_construction_year)
    }
    if (filters.max_construction_year != null) {
      query = query.lte('construction_year', filters.max_construction_year)
    }

    // Floor count
    if (filters.min_floor_count != null) {
      query = query.gte('floor_count', filters.min_floor_count)
    }
    if (filters.max_floor_count != null) {
      query = query.lte('floor_count', filters.max_floor_count)
    }

    // Amenity distances
    if (filters.max_distance_to_transit_m != null) {
      query = query.lte('min_distance_to_transit_m', filters.max_distance_to_transit_m)
    }
    if (filters.max_distance_to_school_m != null) {
      query = query.lte('min_distance_to_school_m', filters.max_distance_to_school_m)
    }
    if (filters.max_distance_to_kindergarten_m != null) {
      query = query.lte('min_distance_to_kindergarten_m', filters.max_distance_to_kindergarten_m)
    }
    if (filters.max_distance_to_grocery_m != null) {
      query = query.lte('min_distance_to_grocery_m', filters.max_distance_to_grocery_m)
    }
    if (filters.max_distance_to_park_m != null) {
      query = query.lte('min_distance_to_park_m', filters.max_distance_to_park_m)
    }
    if (filters.max_distance_to_water_m != null) {
      query = query.lte('min_distance_to_water_m', filters.max_distance_to_water_m)
    }

    // Property type filter via building characteristics
    if (filters.property_type === 'omakotitalo') {
      query = query.lte('apartment_count', 2)
    } else if (filters.property_type === 'rivitalo') {
      query = query.gte('apartment_count', 3).lte('apartment_count', 20)
    } else if (filters.property_type === 'kerrostalo') {
      query = query.gte('apartment_count', 6)
    }

    // Sorting
    const sortMap: Record<string, { column: string; ascending: boolean }> = {
      price_asc: { column: 'estimated_price_per_sqm', ascending: true },
      price_desc: { column: 'estimated_price_per_sqm', ascending: false },
      year_desc: { column: 'construction_year', ascending: false },
      year_asc: { column: 'construction_year', ascending: true },
    }
    const sort = sortMap[filters.sort_by ?? 'price_asc'] ?? sortMap.price_asc
    query = query.order(sort.column, { ascending: sort.ascending, nullsFirst: false })

    // Pagination
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      console.error('Building search error:', error.message, error.details, error.hint)
      return NextResponse.json(
        { error: `Search failed: ${error.message}` },
        { status: 500 }
      )
    }

    const total = count ?? data?.length ?? 0

    // If we didn't pre-fetch area info (no area filter), fetch it now for the result set
    if (!areaIds && data?.length) {
      const resultAreaIds = [...new Set(data.map(r => r.area_id as string).filter(Boolean))]
      if (resultAreaIds.length > 0) {
        const { data: areas } = await supabase
          .from('areas')
          .select('id, area_code, name, municipality')
          .in('id', resultAreaIds)
        for (const a of areas ?? []) {
          areaLookup.set(a.id as string, {
            area_code: a.area_code as string,
            name: a.name as string,
            municipality: a.municipality as string,
          })
        }
      }
    }

    // Map results
    const buildings: AISearchResult[] = (data ?? []).map(row => {
      const area = areaLookup.get(row.area_id as string)
      const centroid = row.centroid as { coordinates?: [number, number] } | string | null

      let lng = 0, lat = 0
      if (centroid) {
        if (typeof centroid === 'string') {
          try {
            const parsed = JSON.parse(centroid) as { coordinates: [number, number] }
            lng = parsed.coordinates[0]
            lat = parsed.coordinates[1]
          } catch { /* ignore */ }
        } else if (centroid.coordinates) {
          lng = centroid.coordinates[0]
          lat = centroid.coordinates[1]
        }
      }

      return {
        id: row.id as string,
        address: row.address as string | null,
        area_code: area?.area_code ?? '',
        area_name: area?.name ?? '',
        municipality: area?.municipality ?? '',
        estimated_price_per_sqm: row.estimated_price_per_sqm != null
          ? Number(row.estimated_price_per_sqm)
          : null,
        construction_year: row.construction_year as number | null,
        floor_count: row.floor_count as number | null,
        apartment_count: row.apartment_count as number | null,
        footprint_area_sqm: row.footprint_area_sqm != null
          ? Number(row.footprint_area_sqm)
          : null,
        lat,
        lng,
      }
    })

    // Generate clusters by grouping nearby buildings (simple grid-based clustering)
    const clusterGrid = new Map<string, { sumLat: number; sumLng: number; sumPrice: number; count: number }>()
    const GRID_SIZE = 0.01 // ~1km grid cells

    for (const b of buildings) {
      if (!b.lat || !b.lng) continue
      const key = `${Math.round(b.lat / GRID_SIZE)}_${Math.round(b.lng / GRID_SIZE)}`
      const cell = clusterGrid.get(key) ?? { sumLat: 0, sumLng: 0, sumPrice: 0, count: 0 }
      cell.sumLat += b.lat
      cell.sumLng += b.lng
      cell.sumPrice += b.estimated_price_per_sqm ?? 0
      cell.count += 1
      clusterGrid.set(key, cell)
    }

    const clusters = Array.from(clusterGrid.values()).map(cell => ({
      lat: cell.sumLat / cell.count,
      lng: cell.sumLng / cell.count,
      count: cell.count,
      avg_price: cell.count > 0 ? Math.round(cell.sumPrice / cell.count) : 0,
    }))

    return NextResponse.json(
      { total, buildings, clusters },
      { headers: { 'Cache-Control': 'private, s-maxage=60' } }
    )
  } catch (err) {
    console.error('Search route error:', err)
    return NextResponse.json(
      { error: `Search error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
