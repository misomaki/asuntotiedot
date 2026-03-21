/**
 * Building-level price estimation algorithm.
 *
 * Adjusts the area-level base price (from Statistics Finland) by:
 * 1. Building age (construction year)
 * 2. Energy efficiency class (A–G)
 * 3. Proximity to water
 * 4. Floor count
 * 5. Building size (apartment count / total area)
 * 6. Neighborhood correction (market-calibrated)
 *
 * Location premium factors (water, neighborhood) are dampened for old buildings.
 */

/** Omakotitalo fallback multipliers when no direct StatFin OKT data exists.
 *  Validated 2026-03: OKT prices are typically above RT in same area. */
export const OKT_FALLBACK = {
  fromRivitalo: 1.10,
  fromKerrostalo: 0.90,
} as const

export type PropertyType = 'kerrostalo' | 'rivitalo' | 'omakotitalo'

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
  propertyType?: PropertyType
  /** Neighborhood correction factor from market data (defaults to 1.0) */
  neighborhoodFactor?: number
  /** Energy efficiency class A–G (null if unknown) */
  energyClass?: string | null
  /** Number of apartments in the building (null if unknown) */
  apartmentCount?: number | null
  /** Building footprint area in m² (null if unknown) */
  footprintAreaSqm?: number | null
}

export interface PriceEstimationResult {
  estimatedPricePerSqm: number
  basePrice: number
  ageFactor: number
  energyFactor: number
  waterFactor: number
  floorFactor: number
  sizeFactor: number
  neighborhoodFactor: number
}

export function computeAgeFactor(
  constructionYear: number | null,
  referenceYear: number
): number {
  if (constructionYear === null) return 1.0

  const age = referenceYear - constructionYear

  // U-shaped curve: 1960s-70s panel houses (age ~50-60) are cheapest,
  // pre-war buildings (age 80-100+) recover value.
  // Recalibrated 2026-03-21 against 87 Etuovi asking prices.
  // New-build factors boosted to compensate for StatFin base price
  // dilution (new + resale transactions pooled in area averages).
  // Half-correction applied to avoid overfitting to small validation set.
  // Pre-war brackets (≤100, >100) kept unchanged — validation sample
  // biased toward cheap suburban wooden houses (n=2-3), while full
  // Etuovi data shows central pre-war buildings command premiums.
  if (age <= 0) return 1.45    // brand new / under construction
  if (age <= 5) return 1.33    // very new
  if (age <= 10) return 1.22   // recent
  if (age <= 20) return 1.10   // modern
  if (age <= 30) return 0.97   // maturing
  if (age <= 40) return 0.90   // aging (anchor — accurate in validation)
  if (age <= 50) return 0.84   // late 70s panels
  if (age <= 60) return 0.80   // 60s-70s panels (valley — cheapest)
  if (age <= 70) return 0.80   // post-war (anchor — accurate in validation)
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
 * Energy efficiency class factor.
 * Based on Aalto University research: 4.1% premium for A-B vs D-E in Helsinki metro.
 * Sp-Koti and Energiaduo report 5-10% price differences between classes.
 */
export function computeEnergyFactor(energyClass: string | null): number {
  if (energyClass === null) return 1.0
  switch (energyClass.toUpperCase()) {
    case 'A': return 1.08
    case 'B': return 1.05
    case 'C': return 1.02
    case 'D': return 1.00
    case 'E': return 0.97
    case 'F': return 0.94
    case 'G': return 0.90
    default: return 1.00
  }
}

/**
 * Building size factor — smaller buildings command higher €/m².
 *
 * Kerrostalo: by apartment count (fewer apartments = more exclusive).
 * Omakotitalo: by total area (smaller homes = higher €/m², diminishing returns on large).
 * Rivitalo: neutral (size variation is small).
 */
export function computeSizeFactor(
  apartmentCount: number | null,
  footprintAreaSqm: number | null,
  floorCount: number | null,
  propertyType?: PropertyType
): number {
  if (propertyType === 'kerrostalo' && apartmentCount !== null) {
    if (apartmentCount >= 60) return 0.97
    if (apartmentCount >= 30) return 1.00
    if (apartmentCount >= 10) return 1.02
    return 1.04
  }

  if (propertyType === 'omakotitalo' && footprintAreaSqm !== null) {
    const floors = floorCount ?? 1
    const totalArea = footprintAreaSqm * floors
    if (totalArea > 300) return 0.92
    if (totalArea > 200) return 0.96
    if (totalArea > 100) return 1.00
    return 1.03
  }

  return 1.0
}

/**
 * Dampen premium factors for old buildings.
 *
 * Old buildings (age_factor < 0.85, i.e. built before ~1986) don't capture
 * neighborhood or waterfront premiums as strongly as new buildings.
 * This reduces the premium effect gradually for older buildings.
 *
 * - ageFactor >= 0.85: no dampening (returns factor as-is)
 * - ageFactor = 0.70: full 50% dampening (premium halved)
 * - Discounts (factor < 1.0) are NOT dampened
 */
export function dampenPremium(factor: number, ageFactor: number): number {
  if (factor <= 1.0 || ageFactor >= 0.85) return factor
  // Gradual: ageFactor 0.85 → no dampening, 0.70 → full 50% dampening
  const progress = Math.min(1.0, (0.85 - ageFactor) / 0.15)
  const dampening = 0.5 * progress
  return 1.0 + (factor - 1.0) * (1.0 - dampening)
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
  const energyFactor = computeEnergyFactor(input.energyClass ?? null)
  const rawWaterFactor = computeWaterFactor(input.distanceToWaterM)
  const floorFactor = computeFloorFactor(input.floorCount, input.propertyType)
  const sizeFactor = computeSizeFactor(
    input.apartmentCount ?? null,
    input.footprintAreaSqm ?? null,
    input.floorCount,
    input.propertyType
  )
  const rawNeighborhoodFactor = input.neighborhoodFactor ?? 1.0

  // Dampen location premium factors for old buildings
  const waterFactor = dampenPremium(rawWaterFactor, ageFactor)
  const neighborhoodFactor = dampenPremium(rawNeighborhoodFactor, ageFactor)

  const estimatedPricePerSqm = Math.round(
    input.basePrice * ageFactor * energyFactor * waterFactor * floorFactor * sizeFactor * neighborhoodFactor
  )

  return {
    estimatedPricePerSqm,
    basePrice: input.basePrice,
    ageFactor,
    energyFactor,
    waterFactor,
    floorFactor,
    sizeFactor,
    neighborhoodFactor,
  }
}
