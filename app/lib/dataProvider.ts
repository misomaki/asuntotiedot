/**
 * Data provider abstraction layer.
 *
 * Defines a DataProvider interface that can be backed by mock data or a real
 * database (e.g. Supabase). The active implementation is returned by
 * getDataProvider().
 */

import type {
  PropertyType,
  PriceEstimate,
  BuildingStats,
  DemographicStats,
  AreaWithStats,
} from '@/app/types'

import {
  getVoronoiGeoJSON,
  AREA_DEFINITIONS,
  MOCK_PRICES,
  MOCK_BUILDINGS,
  MOCK_DEMOGRAPHICS,
  MOCK_WALK_SCORES,
} from './mockData'

// ---------------------------------------------------------------------------
// GeoJSON types
// ---------------------------------------------------------------------------

export interface GeoJSONFeature {
  type: 'Feature'
  geometry: { type: string; coordinates: number[][][] }
  properties: Record<string, unknown>
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
}

// ---------------------------------------------------------------------------
// Search result type
// ---------------------------------------------------------------------------

export interface AreaSearchResult {
  area_code: string
  name: string
  municipality: string
}

// ---------------------------------------------------------------------------
// DataProvider interface
// ---------------------------------------------------------------------------

export interface DataProvider {
  /** Return all areas as GeoJSON with price data merged into feature properties. */
  getAreasGeoJSON(
    year: number,
    propertyType: PropertyType,
  ): Promise<GeoJSONFeatureCollection>

  /** Return full stats for a single area, or null if not found. */
  getAreaDetails(
    areaCode: string,
    year: number,
  ): Promise<AreaWithStats | null>

  /** Return the price trend for an area and property type, sorted by year. */
  getPriceTrend(
    areaCode: string,
    propertyType: PropertyType,
  ): Promise<PriceEstimate[]>

  /** Search areas by name or area code (case-insensitive). */
  searchAreas(query: string): Promise<AreaSearchResult[]>
}

// ---------------------------------------------------------------------------
// MockDataProvider
// ---------------------------------------------------------------------------

class MockDataProvider implements DataProvider {
  async getAreasGeoJSON(
    year: number,
    propertyType: PropertyType,
  ): Promise<GeoJSONFeatureCollection> {
    // Get Voronoi-tessellated GeoJSON with IDW-interpolated prices
    const voronoi = getVoronoiGeoJSON(year, propertyType)

    return {
      type: 'FeatureCollection',
      features: voronoi.features.map((f) => ({
        type: 'Feature' as const,
        geometry: f.geometry,
        properties: f.properties as unknown as Record<string, unknown>,
      })),
    }
  }

  async getAreaDetails(
    areaCode: string,
    year: number,
  ): Promise<AreaWithStats | null> {
    // Look up the original anchor area definition
    const area = AREA_DEFINITIONS.find((a) => a.area_code === areaCode)
    if (!area) return null

    // Gather prices for all property types for the given year
    const prices: PriceEstimate[] = MOCK_PRICES.filter(
      (p) => p.area_id === areaCode && p.year === year,
    )

    // Building stats for this area
    const buildings: BuildingStats | null =
      MOCK_BUILDINGS.find((b) => b.area_id === areaCode) ?? null

    // Demographics for this area
    const demographics: DemographicStats | null =
      MOCK_DEMOGRAPHICS.find((d) => d.area_id === areaCode) ?? null

    // Walk score
    const walkScore: number | null = MOCK_WALK_SCORES[areaCode] ?? null

    return {
      id: areaCode,
      area_code: areaCode,
      name: area.name,
      municipality: area.municipality,
      prices,
      buildings,
      demographics,
      socioeconomics: null,
      housing: null,
      employment: null,
      walkScore,
    }
  }

  async getPriceTrend(
    areaCode: string,
    propertyType: PropertyType,
  ): Promise<PriceEstimate[]> {
    return MOCK_PRICES
      .filter(
        (p) => p.area_id === areaCode && p.property_type === propertyType,
      )
      .sort((a, b) => a.year - b.year)
  }

  async searchAreas(query: string): Promise<AreaSearchResult[]> {
    const lowerQuery = query.toLowerCase()

    return AREA_DEFINITIONS
      .filter((area) =>
        area.area_code.toLowerCase().includes(lowerQuery) ||
        area.name.toLowerCase().includes(lowerQuery),
      )
      .map((area) => ({
        area_code: area.area_code,
        name: area.name,
        municipality: area.municipality,
      }))
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let providerInstance: DataProvider | null = null

/**
 * Returns the active DataProvider instance.
 * Auto-detects Supabase when environment variables are set;
 * falls back to MockDataProvider otherwise.
 */
export function getDataProvider(): DataProvider {
  if (!providerInstance) {
    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      // Dynamic import to avoid loading Supabase client when not needed
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SupabaseDataProvider } = require('./supabaseDataProvider')
      providerInstance = new SupabaseDataProvider()
      console.log('Using SupabaseDataProvider (real data)')
    } else {
      providerInstance = new MockDataProvider()
      console.log('Using MockDataProvider (mock data)')
    }
  }
  return providerInstance!
}
