export type PropertyType = 'kerrostalo' | 'rivitalo' | 'omakotitalo'

export interface Area {
  id: string
  area_code: string
  name: string
  municipality: string
}

export interface PriceEstimate {
  area_id: string
  year: number
  quarter: number | null
  price_per_sqm_avg: number | null
  price_per_sqm_median: number | null
  transaction_count: number
  property_type: PropertyType
}

export interface BuildingStats {
  area_id: string
  year: number
  buildings_total: number
  avg_building_year: number
  pct_pre_1960: number
  pct_1960_1980: number
  pct_1980_2000: number
  pct_post_2000: number
  avg_floor_count: number
}

export interface DemographicStats {
  area_id: string
  year: number
  population: number
  median_age: number
  pct_under_18: number
  pct_18_64: number
  pct_over_65: number
  avg_household_size: number
}

export interface AreaWithStats extends Area {
  prices: PriceEstimate[]
  buildings: BuildingStats | null
  demographics: DemographicStats | null
  walkScore: number | null
}

export interface FilterState {
  year: number
  propertyType: PropertyType
  priceRange: [number, number]
}

export interface ViewportState {
  latitude: number
  longitude: number
  zoom: number
}

export interface AreaFeatureProperties {
  area_code: string
  name: string
  municipality: string
  price_per_sqm_avg: number | null
  price_per_sqm_median: number | null
  transaction_count: number
  population: number | null
  walk_score: number | null
}
