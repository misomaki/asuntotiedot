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
  ryhti_main_purpose: string | null
  is_residential: boolean | null
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
