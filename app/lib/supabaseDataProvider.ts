/**
 * Supabase-backed data provider.
 *
 * Queries real Statistics Finland data from Supabase + PostGIS.
 * Uses the Voronoi generator with real postal-code-level prices as anchors.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  DataProvider,
  GeoJSONFeatureCollection,
  AreaSearchResult,
} from './dataProvider'
import type {
  PropertyType,
  PriceEstimate,
  AreaWithStats,
} from '@/app/types'
import { generateVoronoiGeoJSON, type VoronoiAnchor } from './voronoiGenerator'

export class SupabaseDataProvider implements DataProvider {
  private supabase: SupabaseClient

  constructor() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      throw new Error(
        'SupabaseDataProvider requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
      )
    }

    this.supabase = createClient(url, key, {
      auth: { persistSession: false },
    })
  }

  async getAreasGeoJSON(
    year: number,
    propertyType: PropertyType
  ): Promise<GeoJSONFeatureCollection> {
    // Fetch postal code centroids + prices
    const { data: areas, error } = await this.supabase
      .from('areas')
      .select(`
        area_code,
        name,
        municipality,
        centroid
      `)

    if (error) {
      console.error('Error fetching areas:', error.message)
      return { type: 'FeatureCollection', features: [] }
    }

    // Fetch prices for all areas for this year + property type
    const { data: prices, error: priceError } = await this.supabase
      .from('price_estimates')
      .select('area_id, price_per_sqm_avg')
      .eq('year', year)
      .eq('property_type', propertyType)
      .not('price_per_sqm_avg', 'is', null)

    if (priceError) {
      console.error('Error fetching prices:', priceError.message)
    }

    // Fetch area IDs for mapping
    const { data: areaIds } = await this.supabase
      .from('areas')
      .select('id, area_code')

    const areaIdToCode = new Map<string, string>()
    for (const a of areaIds ?? []) {
      areaIdToCode.set(a.id, a.area_code)
    }

    // Build price lookup by area_code
    const priceByCode = new Map<string, number>()
    for (const p of prices ?? []) {
      const code = areaIdToCode.get(p.area_id)
      if (code && p.price_per_sqm_avg) {
        priceByCode.set(code, Number(p.price_per_sqm_avg))
      }
    }

    // Build Voronoi anchors from areas that have prices and centroids
    const anchors: VoronoiAnchor[] = []
    for (const area of areas ?? []) {
      const price = priceByCode.get(area.area_code)
      if (!price || !area.centroid) continue

      // Parse centroid from PostGIS format
      const centroid = parseCentroid(area.centroid)
      if (!centroid) continue

      anchors.push({
        area_code: area.area_code,
        name: area.name,
        municipality: area.municipality,
        center: centroid,
        price,
      })
    }

    // Generate Voronoi tessellation with real prices
    return generateVoronoiGeoJSON(anchors) as GeoJSONFeatureCollection
  }

  async getAreaDetails(
    areaCode: string,
    year: number
  ): Promise<AreaWithStats | null> {
    // Fetch area
    const { data: area, error } = await this.supabase
      .from('areas')
      .select('id, area_code, name, municipality')
      .eq('area_code', areaCode)
      .single()

    if (error || !area) return null

    // Fetch prices for this area + year (all property types)
    const { data: prices } = await this.supabase
      .from('price_estimates')
      .select('*')
      .eq('area_id', area.id)
      .eq('year', year)

    // Fetch building stats (latest available)
    const { data: buildingStats } = await this.supabase
      .from('building_stats')
      .select('*')
      .eq('area_id', area.id)
      .order('year', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Fetch demographics (latest available)
    const { data: demographics } = await this.supabase
      .from('demographic_stats')
      .select('*')
      .eq('area_id', area.id)
      .order('year', { ascending: false })
      .limit(1)
      .maybeSingle()

    return {
      id: area.id,
      area_code: area.area_code,
      name: area.name,
      municipality: area.municipality,
      prices: (prices ?? []).map(mapPriceEstimate),
      buildings: buildingStats
        ? {
            area_id: area.area_code,
            year: buildingStats.year,
            buildings_total: buildingStats.buildings_total ?? 0,
            avg_building_year: buildingStats.avg_building_year ?? 0,
            pct_pre_1960: Number(buildingStats.pct_pre_1960 ?? 0),
            pct_1960_1980: Number(buildingStats.pct_1960_1980 ?? 0),
            pct_1980_2000: Number(buildingStats.pct_1980_2000 ?? 0),
            pct_post_2000: Number(buildingStats.pct_post_2000 ?? 0),
            avg_floor_count: Number(buildingStats.avg_floor_count ?? 0),
          }
        : null,
      demographics: demographics
        ? {
            area_id: area.area_code,
            year: demographics.year,
            population: demographics.population ?? 0,
            median_age: Number(demographics.median_age ?? 0),
            pct_under_18: Number(demographics.pct_under_18 ?? 0),
            pct_18_64: Number(demographics.pct_18_64 ?? 0),
            pct_over_65: Number(demographics.pct_over_65 ?? 0),
            avg_household_size: Number(demographics.avg_household_size ?? 0),
          }
        : null,
      walkScore: null,
    }
  }

  async getPriceTrend(
    areaCode: string,
    propertyType: PropertyType
  ): Promise<PriceEstimate[]> {
    const { data: area } = await this.supabase
      .from('areas')
      .select('id')
      .eq('area_code', areaCode)
      .single()

    if (!area) return []

    const { data } = await this.supabase
      .from('price_estimates')
      .select('*')
      .eq('area_id', area.id)
      .eq('property_type', propertyType)
      .not('price_per_sqm_avg', 'is', null)
      .order('year', { ascending: true })

    return (data ?? []).map(mapPriceEstimate)
  }

  async searchAreas(query: string): Promise<AreaSearchResult[]> {
    const { data } = await this.supabase
      .from('areas')
      .select('area_code, name, municipality')
      .or(`area_code.ilike.%${query}%,name.ilike.%${query}%`)
      .limit(20)

    return (data ?? []).map((d) => ({
      area_code: d.area_code,
      name: d.name,
      municipality: d.municipality,
    }))
  }

  /**
   * Fetch building outlines within a bounding box (for map layer at high zoom).
   */
  async getBuildingsGeoJSON(
    bounds: [number, number, number, number],
    year: number
  ): Promise<GeoJSONFeatureCollection> {
    const [west, south, east, north] = bounds

    // Use PostGIS envelope query
    const { data, error } = await this.supabase.rpc('get_buildings_in_bbox', {
      min_lng: west,
      min_lat: south,
      max_lng: east,
      max_lat: north,
      limit_count: 5000,
    })

    if (error) {
      console.error('Error fetching buildings:', error.message)

      // Fallback: direct query without RPC
      const { data: buildings } = await this.supabase
        .from('buildings')
        .select(
          'id, geometry, building_type, construction_year, floor_count, address, estimated_price_per_sqm, area_id'
        )
        .not('estimated_price_per_sqm', 'is', null)
        .limit(5000)

      if (!buildings) return { type: 'FeatureCollection', features: [] }

      return {
        type: 'FeatureCollection',
        features: buildings.map((b) => ({
          type: 'Feature' as const,
          properties: {
            id: b.id,
            building_type: b.building_type,
            construction_year: b.construction_year,
            floor_count: b.floor_count,
            address: b.address,
            estimated_price_per_sqm: Number(b.estimated_price_per_sqm),
          },
          geometry: typeof b.geometry === 'string'
            ? JSON.parse(b.geometry)
            : b.geometry,
        })),
      }
    }

    return {
      type: 'FeatureCollection',
      features: (data ?? []).map(
        (b: Record<string, unknown>) => ({
          type: 'Feature' as const,
          properties: {
            id: b.id,
            building_type: b.building_type,
            construction_year: b.construction_year,
            floor_count: b.floor_count,
            address: b.address,
            estimated_price_per_sqm: Number(b.estimated_price_per_sqm),
          },
          geometry: typeof b.geometry === 'string'
            ? JSON.parse(b.geometry as string)
            : b.geometry,
        })
      ),
    }
  }

  /**
   * Fetch details for a single building including price estimation breakdown.
   */
  async getBuildingDetails(
    buildingId: string
  ): Promise<Record<string, unknown> | null> {
    const { data: building, error } = await this.supabase
      .from('buildings')
      .select(
        `id, building_type, construction_year, floor_count,
         footprint_area_sqm, address, estimated_price_per_sqm,
         min_distance_to_water_m, area_id`
      )
      .eq('id', buildingId)
      .single()

    if (error || !building) return null

    // Fetch area info
    let areaCode = ''
    let areaName = ''
    let basePrice: number | null = null

    if (building.area_id) {
      const { data: area } = await this.supabase
        .from('areas')
        .select('area_code, name')
        .eq('id', building.area_id)
        .single()

      if (area) {
        areaCode = area.area_code
        areaName = area.name
      }

      // Get the base price used for this building's estimation
      const propertyType = inferPropertyTypeFromBuilding(
        building.building_type,
        building.floor_count
      )

      const { data: priceData } = await this.supabase
        .from('price_estimates')
        .select('price_per_sqm_avg, price_per_sqm_median')
        .eq('area_id', building.area_id)
        .eq('property_type', propertyType)
        .order('year', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (priceData) {
        basePrice = Number(
          priceData.price_per_sqm_median ?? priceData.price_per_sqm_avg
        )
      }
    }

    // Compute the factors for the breakdown
    const ageFactor = computeAgeFactorLocal(building.construction_year)
    const waterFactor = computeWaterFactorLocal(
      building.min_distance_to_water_m
        ? Number(building.min_distance_to_water_m)
        : null
    )
    const floorFactor = computeFloorFactorLocal(building.floor_count)

    return {
      id: building.id,
      area_code: areaCode,
      area_name: areaName,
      building_type: building.building_type,
      construction_year: building.construction_year,
      floor_count: building.floor_count,
      footprint_area_sqm: building.footprint_area_sqm
        ? Number(building.footprint_area_sqm)
        : null,
      address: building.address,
      estimated_price_per_sqm: building.estimated_price_per_sqm
        ? Number(building.estimated_price_per_sqm)
        : null,
      min_distance_to_water_m: building.min_distance_to_water_m
        ? Number(building.min_distance_to_water_m)
        : null,
      base_price: basePrice,
      age_factor: ageFactor,
      water_factor: waterFactor,
      floor_factor: floorFactor,
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inferPropertyTypeFromBuilding(
  buildingType: string | null,
  floorCount: number | null
): string {
  if (
    (floorCount !== null && floorCount >= 3) ||
    buildingType === 'apartments' ||
    buildingType === 'residential'
  ) {
    return 'kerrostalo'
  }
  if (
    floorCount === 2 ||
    buildingType === 'terrace' ||
    buildingType === 'semidetached_house'
  ) {
    return 'rivitalo'
  }
  return 'omakotitalo'
}

function computeAgeFactorLocal(constructionYear: number | null): number {
  if (constructionYear === null) return 1.0
  const age = new Date().getFullYear() - constructionYear
  if (age <= 0) return 1.15
  if (age <= 5) return 1.10
  if (age <= 10) return 1.05
  if (age <= 20) return 1.00
  if (age <= 30) return 0.97
  if (age <= 40) return 0.94
  if (age <= 50) return 0.90
  if (age <= 70) return 0.87
  if (age <= 100) return 0.85
  return 0.83
}

function computeWaterFactorLocal(distanceM: number | null): number {
  if (distanceM === null) return 1.0
  if (distanceM <= 50) return 1.15
  if (distanceM <= 100) return 1.10
  if (distanceM <= 200) return 1.06
  if (distanceM <= 500) return 1.03
  return 1.0
}

function computeFloorFactorLocal(floorCount: number | null): number {
  if (floorCount === null) return 1.0
  if (floorCount >= 8) return 1.03
  if (floorCount >= 5) return 1.01
  return 1.0
}

/**
 * Parse PostGIS centroid (returned as GeoJSON or WKT) to [lng, lat].
 */
function parseCentroid(
  centroid: unknown
): [number, number] | null {
  if (!centroid) return null

  // GeoJSON format: { type: "Point", coordinates: [lng, lat] }
  if (typeof centroid === 'object' && centroid !== null) {
    const obj = centroid as Record<string, unknown>
    if (obj.type === 'Point' && Array.isArray(obj.coordinates)) {
      const [lng, lat] = obj.coordinates as number[]
      return [lng, lat]
    }
  }

  // String format (WKT): "POINT(lng lat)"
  if (typeof centroid === 'string') {
    const match = centroid.match(/POINT\(([^ ]+) ([^ ]+)\)/)
    if (match) {
      return [parseFloat(match[1]), parseFloat(match[2])]
    }
  }

  return null
}

/**
 * Map a database price row to the PriceEstimate type.
 */
function mapPriceEstimate(row: Record<string, unknown>): PriceEstimate {
  return {
    area_id: String(row.area_id ?? ''),
    year: Number(row.year),
    quarter: row.quarter as number | null,
    price_per_sqm_avg: row.price_per_sqm_avg
      ? Number(row.price_per_sqm_avg)
      : null,
    price_per_sqm_median: row.price_per_sqm_median
      ? Number(row.price_per_sqm_median)
      : null,
    transaction_count: Number(row.transaction_count ?? 0),
    property_type: String(row.property_type) as PropertyType,
  }
}
