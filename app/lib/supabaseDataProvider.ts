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
import {
  computeAgeFactor,
  computeEnergyFactor,
  computeWaterFactor,
  computeFloorFactor,
  computeSizeFactor,
  computeTonttiFactor,
  dampenPremium,
  inferPropertyType,
  calibrationFromRows,
  DEFAULT_CALIBRATION,
  type PriceCalibration,
  type BasePriceSource,
} from './priceEstimation'

/** Base price row from area_base_prices (built by 13-build-area-base-prices.ts) */
interface BasePriceLookup {
  price: number
  source: BasePriceSource
  nOwn: number
  nEffective: number
}

/** price_calibration is tiny and changes only on recalibration — cache it per server process. */
const CALIBRATION_TTL_MS = 10 * 60 * 1000
let calibrationCache: { value: PriceCalibration; loadedAt: number } | null = null
let calibrationInFlight: Promise<PriceCalibration> | null = null

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
    // Fetch all postal code centroids — Finland-wide Voronoi coverage
    const { data: areas, error } = await this.supabase
      .from('areas')
      .select(`
        id,
        area_code,
        name,
        municipality,
        centroid
      `)
      .not('centroid', 'is', null)

    if (error) {
      console.error('Error fetching areas:', error.message)
      return { type: 'FeatureCollection', features: [] }
    }

    // Build reverse map from the areas we already fetched (no extra query needed)
    const areaIdToCode = new Map<string, string>()
    const areaIds: string[] = []
    for (const a of areas ?? []) {
      areaIdToCode.set(a.id, a.area_code)
      areaIds.push(a.id)
    }

    // Fetch all prices for this year+type — filtering by area_id client-side
    // because .in() with 491 UUIDs exceeds HTTP header limits
    const { data: prices, error: priceError } = await this.supabase
      .from('price_estimates')
      .select('area_id, price_per_sqm_avg')
      .eq('year', year)
      .eq('property_type', propertyType)
      .not('price_per_sqm_avg', 'is', null)

    if (priceError) {
      console.error('Error fetching prices:', priceError.message)
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

    // Fetch all area stats in parallel (6 independent queries)
    const [
      { data: prices },
      { data: buildingStats },
      { data: demographics },
      { data: socioeconomics },
      { data: housing },
      { data: employment },
    ] = await Promise.all([
      this.supabase.from('price_estimates').select('*').eq('area_id', area.id).eq('year', year),
      this.supabase.from('building_stats').select('*').eq('area_id', area.id).order('year', { ascending: false }).limit(1).maybeSingle(),
      this.supabase.from('demographic_stats').select('*').eq('area_id', area.id).order('year', { ascending: false }).limit(1).maybeSingle(),
      this.supabase.from('area_socioeconomics').select('*').eq('area_id', area.id).order('year', { ascending: false }).limit(1).maybeSingle(),
      this.supabase.from('area_housing').select('*').eq('area_id', area.id).order('year', { ascending: false }).limit(1).maybeSingle(),
      this.supabase.from('area_employment').select('*').eq('area_id', area.id).order('year', { ascending: false }).limit(1).maybeSingle(),
    ])

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
      socioeconomics: socioeconomics
        ? {
            area_id: area.area_code,
            year: socioeconomics.year,
            income_units_total: socioeconomics.income_units_total,
            income_high: socioeconomics.income_high,
            income_medium: socioeconomics.income_medium,
            income_low: socioeconomics.income_low,
            education_pop_18plus: socioeconomics.education_pop_18plus,
            education_basic: socioeconomics.education_basic,
            education_secondary: socioeconomics.education_secondary,
            education_vocational: socioeconomics.education_vocational,
            education_lower_tertiary: socioeconomics.education_lower_tertiary,
            education_upper_tertiary: socioeconomics.education_upper_tertiary,
            education_university: socioeconomics.education_university,
            employed: socioeconomics.employed,
            unemployed: socioeconomics.unemployed,
            students: socioeconomics.students,
            retirees: socioeconomics.retirees,
          }
        : null,
      housing: housing
        ? {
            area_id: area.area_code,
            year: housing.year,
            dwellings_total: housing.dwellings_total,
            owner_occupied: housing.owner_occupied,
            rented: housing.rented,
            other_tenure: housing.other_tenure,
            families_with_children: housing.families_with_children,
            young_households: housing.young_households,
            pensioner_households: housing.pensioner_households,
            single_parent: housing.single_parent,
            single_person: housing.single_person,
            avg_apartment_size_sqm: housing.avg_apartment_size_sqm != null ? Number(housing.avg_apartment_size_sqm) : null,
            row_houses: housing.row_houses,
            apartment_buildings: housing.apartment_buildings,
            total_dwellings: housing.total_dwellings,
          }
        : null,
      employment: employment
        ? {
            area_id: area.area_code,
            year: employment.year,
            employed_total: employment.employed_total,
            sector_info_comm: employment.sector_info_comm,
            sector_manufacturing: employment.sector_manufacturing,
            sector_construction: employment.sector_construction,
            sector_health_social: employment.sector_health_social,
            sector_education: employment.sector_education,
            sector_wholesale_retail: employment.sector_wholesale_retail,
            sector_public_admin: employment.sector_public_admin,
            sector_finance: employment.sector_finance,
            sector_professional: employment.sector_professional,
            sector_transport: employment.sector_transport,
            sector_accommodation: employment.sector_accommodation,
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    // Query base columns that always exist
    const { data: building, error } = await this.supabase
      .from('buildings')
      .select(
        `id, building_type, construction_year, floor_count,
         footprint_area_sqm, total_area_sqm, address, estimated_price_per_sqm,
         min_distance_to_water_m, area_id,
         energy_class, apartment_count,
         ryhti_main_purpose, is_residential, is_leased_plot,
         min_distance_to_school_m, min_distance_to_kindergarten_m,
         min_distance_to_grocery_m, min_distance_to_transit_m,
         min_distance_to_park_m, min_distance_to_health_m`
      )
      .eq('id', buildingId)
      .single()

    if (error || !building) return null

    const propertyType = inferPropertyType(
      building.building_type,
      building.floor_count,
      building.ryhti_main_purpose,
      building.apartment_count,
      building.footprint_area_sqm ? Number(building.footprint_area_sqm) : null
    )

    // Fetch area info, base price, neighborhood factor and calibration in parallel
    let areaCode = ''
    let areaName = ''
    let municipality: string | null = null
    let basePrice: number | null = null
    let basePriceSource: BasePriceSource | null = null
    let basePriceN: number | null = null
    let neighborhoodFactor = 1.0
    let neighborhoodFactorConfidence: 'high' | 'medium' | 'low' | 'default' = 'default'
    let calibration: PriceCalibration = DEFAULT_CALIBRATION

    if (building.area_id) {
      const [areaResult, basePriceResult, nbhdResult, calib] = await Promise.all([
        this.supabase
          .from('areas')
          .select('area_code, name, municipality')
          .eq('id', building.area_id)
          .single(),
        this.lookupBasePrice(building.area_id, propertyType),
        this.lookupNeighborhoodFactor(building.area_id, propertyType),
        this.loadCalibration(),
      ])

      if (areaResult.data) {
        areaCode = areaResult.data.area_code
        areaName = areaResult.data.name
        municipality = areaResult.data.municipality ?? null
      }
      basePrice = basePriceResult?.price ?? null
      basePriceSource = basePriceResult?.source ?? null
      basePriceN = basePriceResult?.nOwn ?? null
      neighborhoodFactor = nbhdResult.factor
      neighborhoodFactorConfidence = nbhdResult.confidence
      calibration = calib
    }
    const biasFactor = calibration.bias[propertyType]

    // Compute the factors for the breakdown
    const ageFactor = computeAgeFactor(building.construction_year, new Date().getFullYear())
    const energyFactor = computeEnergyFactor(building.energy_class ?? null)
    const waterFactor = computeWaterFactor(
      building.min_distance_to_water_m != null
        ? Number(building.min_distance_to_water_m)
        : null
    )
    const floorFactor = computeFloorFactor(building.floor_count, propertyType)
    const footprint = building.footprint_area_sqm
      ? Number(building.footprint_area_sqm)
      : null
    const totalArea = building.total_area_sqm
      ? Number(building.total_area_sqm)
      : null
    const sizeFactor = computeSizeFactor(
      building.apartment_count ?? null,
      footprint,
      building.floor_count,
      propertyType,
      totalArea
    )

    // Apply premium dampening to match the SQL-stored estimated_price_per_sqm
    const dampenedWaterFactor = dampenPremium(waterFactor, ageFactor)
    const dampenedNeighborhoodFactor = dampenPremium(neighborhoodFactor, ageFactor)
    const tonttiFactor = computeTonttiFactor(building.is_leased_plot, propertyType)

    return {
      id: building.id,
      area_code: areaCode,
      area_name: areaName,
      building_type: building.building_type,
      construction_year: building.construction_year,
      floor_count: building.floor_count,
      footprint_area_sqm: footprint,
      total_area_sqm: totalArea,
      address: building.address,
      estimated_price_per_sqm: building.estimated_price_per_sqm
        ? Number(building.estimated_price_per_sqm)
        : null,
      min_distance_to_water_m: building.min_distance_to_water_m != null
        ? Number(building.min_distance_to_water_m)
        : null,
      energy_class: building.energy_class ?? null,
      apartment_count: building.apartment_count ?? null,
      base_price: basePrice,
      base_price_source: basePriceSource,
      base_price_n: basePriceN,
      bias_factor: biasFactor,
      municipality,
      age_factor: ageFactor,
      energy_factor: energyFactor,
      water_factor: dampenedWaterFactor,
      floor_factor: floorFactor,
      size_factor: sizeFactor,
      neighborhood_factor: dampenedNeighborhoodFactor,
      neighborhood_factor_confidence: neighborhoodFactorConfidence,
      tontti_factor: tonttiFactor,
      ryhti_main_purpose: building.ryhti_main_purpose ?? null,
      is_residential: building.is_residential ?? null,
      is_leased_plot: building.is_leased_plot ?? null,
      min_distance_to_school_m: building.min_distance_to_school_m != null ? Number(building.min_distance_to_school_m) : null,
      min_distance_to_kindergarten_m: building.min_distance_to_kindergarten_m != null ? Number(building.min_distance_to_kindergarten_m) : null,
      min_distance_to_grocery_m: building.min_distance_to_grocery_m != null ? Number(building.min_distance_to_grocery_m) : null,
      min_distance_to_transit_m: building.min_distance_to_transit_m != null ? Number(building.min_distance_to_transit_m) : null,
      min_distance_to_park_m: building.min_distance_to_park_m != null ? Number(building.min_distance_to_park_m) : null,
      min_distance_to_health_m: building.min_distance_to_health_m != null ? Number(building.min_distance_to_health_m) : null,
    }
  }
  /**
   * Base price lookup — one row from area_base_prices.
   *
   * All cascading (multi-year pooling, nearby IDW, municipality parent, type
   * cascade, shrinkage) happens offline in 13-build-area-base-prices.ts, so
   * SQL, this provider and the validation scripts read exactly the same number.
   */
  private async lookupBasePrice(
    areaId: string,
    propertyType: string
  ): Promise<BasePriceLookup | null> {
    const { data } = await this.supabase
      .from('area_base_prices')
      .select('base_price, source, n_own, n_effective')
      .eq('area_id', areaId)
      .eq('property_type', propertyType)
      .maybeSingle()

    if (!data) return null
    return {
      price: Number(data.base_price),
      source: data.source as BasePriceSource,
      nOwn: Number(data.n_own ?? 0),
      nEffective: Number(data.n_effective ?? 0),
    }
  }

  /** Load price_calibration (bias, S-curve) with a process-level cache. */
  private async loadCalibration(): Promise<PriceCalibration> {
    const now = Date.now()
    if (calibrationCache && now - calibrationCache.loadedAt < CALIBRATION_TTL_MS) {
      return calibrationCache.value
    }
    if (calibrationInFlight) return calibrationInFlight

    calibrationInFlight = (async () => {
      try {
        const { data, error } = await this.supabase
          .from('price_calibration')
          .select('key, value')
        if (error || !data) return calibrationCache?.value ?? DEFAULT_CALIBRATION
        const value = calibrationFromRows(data as Array<{ key: string; value: number | string }>)
        calibrationCache = { value, loadedAt: Date.now() }
        return value
      } catch {
        return calibrationCache?.value ?? DEFAULT_CALIBRATION
      } finally {
        calibrationInFlight = null
      }
    })()
    return calibrationInFlight
  }

  /**
   * Look up neighborhood correction factor from market data.
   * Cascade (matches SQL function compute_building_price, migration 040):
   *   1. area + exact type
   *   2. area + 'all'
   *   3. Final: 1.0 (neutral)
   *
   * Factors are already shrunk toward 1.0 by sample size (09-compute-
   * neighborhood-factors.ts), so no sample_count threshold is applied here.
   * No municipality median fallback — with sparse data it creates bias.
   */
  private async lookupNeighborhoodFactor(
    areaId: string,
    propertyType: string
  ): Promise<{ factor: number; confidence: 'high' | 'medium' | 'low' | 'default' }> {
    const { data } = await this.supabase
      .from('neighborhood_factors')
      .select('factor, property_type, sample_count, confidence')
      .eq('area_id', areaId)
      .in('property_type', [propertyType, 'all'])
      .gte('sample_count', 1)

    if (!data?.length) return { factor: 1.0, confidence: 'default' }

    const exact = data.find((r) => r.property_type === propertyType)
    if (exact?.factor) {
      return {
        factor: Number(exact.factor),
        confidence: (exact.confidence as 'high' | 'medium' | 'low') ?? 'medium',
      }
    }

    const universal = data.find((r) => r.property_type === 'all')
    if (universal?.factor) {
      return {
        factor: Number(universal.factor),
        confidence: (universal.confidence as 'high' | 'medium' | 'low') ?? 'medium',
      }
    }

    return { factor: 1.0, confidence: 'default' }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
