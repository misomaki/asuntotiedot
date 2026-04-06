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

/** Socioeconomic indicators: income, education, employment status */
export interface AreaSocioeconomics {
  area_id: string
  year: number
  // Income distribution
  income_units_total: number | null
  income_high: number | null
  income_medium: number | null
  income_low: number | null
  // Education (18+ population)
  education_pop_18plus: number | null
  education_basic: number | null
  education_secondary: number | null
  education_vocational: number | null
  education_lower_tertiary: number | null
  education_upper_tertiary: number | null
  education_university: number | null
  // Employment status
  employed: number | null
  unemployed: number | null
  students: number | null
  retirees: number | null
}

/** Housing composition: tenure, family types, building stock */
export interface AreaHousing {
  area_id: string
  year: number
  // Tenure
  dwellings_total: number | null
  owner_occupied: number | null
  rented: number | null
  other_tenure: number | null
  // Family types
  families_with_children: number | null
  young_households: number | null
  pensioner_households: number | null
  single_parent: number | null
  single_person: number | null
  // Building stock
  avg_apartment_size_sqm: number | null
  row_houses: number | null
  apartment_buildings: number | null
  total_dwellings: number | null
}

/** Employment by sector (NACE classification) */
export interface AreaEmployment {
  area_id: string
  year: number
  employed_total: number | null
  sector_info_comm: number | null
  sector_manufacturing: number | null
  sector_construction: number | null
  sector_health_social: number | null
  sector_education: number | null
  sector_wholesale_retail: number | null
  sector_public_admin: number | null
  sector_finance: number | null
  sector_professional: number | null
  sector_transport: number | null
  sector_accommodation: number | null
}

export interface AreaWithStats extends Area {
  prices: PriceEstimate[]
  buildings: BuildingStats | null
  demographics: DemographicStats | null
  socioeconomics: AreaSocioeconomics | null
  housing: AreaHousing | null
  employment: AreaEmployment | null
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

/** Individual building with estimated price */
export interface BuildingWithPrice {
  id: string
  area_code: string
  area_name: string
  building_type: string | null
  construction_year: number | null
  floor_count: number | null
  footprint_area_sqm: number | null
  total_area_sqm: number | null
  address: string | null
  estimated_price_per_sqm: number | null
  min_distance_to_water_m: number | null
  energy_class: string | null
  apartment_count: number | null
  base_price: number | null
  age_factor: number
  energy_factor: number
  water_factor: number
  floor_factor: number
  size_factor: number
  neighborhood_factor: number
  neighborhood_factor_confidence: 'high' | 'medium' | 'low' | 'default'
  tontti_factor: number
  ryhti_main_purpose: string | null
  is_residential: boolean | null
  is_leased_plot: boolean | null
  // Amenity distances (meters)
  min_distance_to_school_m: number | null
  min_distance_to_kindergarten_m: number | null
  min_distance_to_grocery_m: number | null
  min_distance_to_transit_m: number | null
  min_distance_to_park_m: number | null
  min_distance_to_health_m: number | null
}

/** Properties on a building GeoJSON feature */
export interface BuildingFeatureProperties {
  id: string
  building_type: string | null
  construction_year: number | null
  floor_count: number | null
  address: string | null
  estimated_price_per_sqm: number | null
}

// ── Marketplace signals (Phase 1) ──

/** Aggregate signal counts for a building (public, no user details) */
export interface BuildingSignals {
  interest_count: number
  sell_intent_count: number
  has_sell_intent: boolean
}

/** Room count options for buyer interest */
export type RoomCount = '1' | '2' | '3' | '4' | '5+'

/** A buyer's interest signal on a specific building */
export interface BuildingInterest {
  id: string
  user_id: string
  building_id: string
  room_count: RoomCount | null
  min_sqm: number | null
  max_sqm: number | null
  max_price_per_sqm: number | null
  note: string | null
  created_at: string
  expires_at: string
}

/** A seller's intent signal on a specific building */
export interface BuildingSellIntent {
  id: string
  user_id: string
  building_id: string
  asking_price_per_sqm: number | null
  property_type: string | null
  note: string | null
  created_at: string
  expires_at: string
}

// ── User Addresses ──

/** A user-registered address linked to a building */
export interface UserAddress {
  id: string
  user_id: string
  address_text: string
  building_id: string | null
  latitude: number | null
  longitude: number | null
  created_at: string
  // Joined building info (from API)
  building_address?: string | null
  building_type?: string | null
  construction_year?: number | null
  estimated_price_per_sqm?: number | null
}

// ── AI Property Search ──

/** Structured filters parsed from natural language query */
export interface AISearchFilters {
  area_codes?: string[]
  municipality?: string
  property_type?: PropertyType
  room_count?: string
  min_sqm?: number
  max_sqm?: number
  max_price_per_sqm?: number
  min_price_per_sqm?: number
  min_construction_year?: number
  max_construction_year?: number
  max_distance_to_transit_m?: number
  max_distance_to_school_m?: number
  max_distance_to_kindergarten_m?: number
  max_distance_to_grocery_m?: number
  max_distance_to_park_m?: number
  max_distance_to_water_m?: number
  max_floor_count?: number
  min_floor_count?: number
  sort_by?: 'price_asc' | 'price_desc' | 'year_desc' | 'year_asc'
}

/** A building result from AI search */
export interface AISearchResult {
  id: string
  address: string | null
  area_code: string
  area_name: string
  municipality: string
  estimated_price_per_sqm: number | null
  construction_year: number | null
  floor_count: number | null
  apartment_count: number | null
  footprint_area_sqm: number | null
  lat: number
  lng: number
}

/** Response from the search endpoint */
export interface AISearchResponse {
  total: number
  buildings: AISearchResult[]
  clusters: Array<{
    lat: number
    lng: number
    count: number
    avg_price: number
  }>
}

/** User's own signals (for /omat-ilmoitukset page) */
export interface UserSignalWithBuilding {
  id: string
  building_id: string
  address: string | null
  area_name: string | null
  area_code: string | null
  estimated_price_per_sqm: number | null
  created_at: string
  expires_at: string
  type: 'interest' | 'sell_intent'
  room_count?: RoomCount | null
  min_sqm?: number | null
  max_sqm?: number | null
  max_price_per_sqm?: number | null
  asking_price_per_sqm?: number | null
  note: string | null
}
