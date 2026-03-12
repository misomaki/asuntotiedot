/**
 * Building-level price estimation algorithm.
 *
 * Adjusts the area-level base price (from Statistics Finland) by:
 * 1. Building age (construction year)
 * 2. Proximity to water
 * 3. Floor count
 */

/** Omakotitalo fallback multipliers when no direct StatFin OKT data exists.
 *  Validated 2026-03: OKT prices are typically above RT in same area. */
export const OKT_FALLBACK = {
  fromRivitalo: 1.10,
  fromKerrostalo: 0.90,
} as const

export interface PriceEstimationInput {
  /** Real StatFin €/m² for this postal code + year + property type */
  basePrice: number
  /** Building construction year (null if unknown) */
  constructionYear: number | null
  /** Distance to nearest water body in meters (null if unknown) */
  distanceToWaterM: number | null
  /** Number of floors (null if unknown) */
  floorCount: number | null
  /** Reference year for age calculation */
  referenceYear: number
  /** Property type for type-specific floor factor (optional for backward compat) */
  propertyType?: 'kerrostalo' | 'rivitalo' | 'omakotitalo'
}

export interface PriceEstimationResult {
  estimatedPricePerSqm: number
  basePrice: number
  ageFactor: number
  waterFactor: number
  floorFactor: number
}

export function computeAgeFactor(
  constructionYear: number | null,
  referenceYear: number
): number {
  if (constructionYear === null) return 1.0

  const age = referenceYear - constructionYear

  // U-shaped curve: 1960s-70s panel houses (age ~50-60) are cheapest,
  // pre-war buildings (age 80-100+) recover value.
  // Validated 2026-03 against Etuovi asking prices — new construction
  // premiums increased significantly, age valley softened.
  if (age <= 0) return 1.35    // brand new / under construction
  if (age <= 5) return 1.25    // very new
  if (age <= 10) return 1.15   // recent
  if (age <= 20) return 1.05   // modern
  if (age <= 30) return 0.95   // keep
  if (age <= 40) return 0.90   // aging
  if (age <= 50) return 0.82   // late 70s panels
  if (age <= 60) return 0.78   // 60s-70s panels (valley — cheapest)
  if (age <= 70) return 0.80   // post-war, starting recovery
  if (age <= 80) return 0.85   // 1940s-50s recovery
  if (age <= 100) return 0.90  // pre-war, good value retention
  return 0.92                   // historical, often renovated, character premium
}

export function computeWaterFactor(distanceM: number | null): number {
  if (distanceM === null) return 1.0

  if (distanceM <= 50) return 1.15
  if (distanceM <= 100) return 1.10
  if (distanceM <= 200) return 1.06
  if (distanceM <= 500) return 1.03
  return 1.0
}

export function computeFloorFactor(
  floorCount: number | null,
  propertyType?: 'kerrostalo' | 'rivitalo' | 'omakotitalo'
): number {
  if (floorCount === null) return 1.0

  // Rivitalo: single-story commands ~10% premium over two-story
  // (validated 2026-03 against Etuovi data: yksitasoinen 3,825 vs kaksitasoinen 3,476 €/m²)
  if (propertyType === 'rivitalo') {
    if (floorCount === 1) return 1.05   // yksitasoinen premium
    return 1.0                           // kaksitasoinen baseline
  }

  // Kerrostalo: taller buildings command slight premium
  if (floorCount >= 8) return 1.03
  if (floorCount >= 5) return 1.01
  return 1.0
}

/**
 * Map OSM building type + floor count to Finnish property type.
 */
export function inferPropertyType(
  buildingType: string | null,
  floorCount: number | null
): 'kerrostalo' | 'rivitalo' | 'omakotitalo' {
  if (
    floorCount !== null && floorCount >= 3 ||
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

/**
 * Estimate the price per sqm for a single building.
 */
export function estimateBuildingPrice(
  input: PriceEstimationInput
): PriceEstimationResult {
  const ageFactor = computeAgeFactor(input.constructionYear, input.referenceYear)
  const waterFactor = computeWaterFactor(input.distanceToWaterM)
  const floorFactor = computeFloorFactor(input.floorCount, input.propertyType)

  const estimatedPricePerSqm = Math.round(
    input.basePrice * ageFactor * waterFactor * floorFactor
  )

  return {
    estimatedPricePerSqm,
    basePrice: input.basePrice,
    ageFactor,
    waterFactor,
    floorFactor,
  }
}
