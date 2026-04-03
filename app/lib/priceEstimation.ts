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
 * 7. Plot ownership type (vuokratontti discount)
 *
 * Location premium factors (water, neighborhood) are dampened for old buildings.
 */

/** Omakotitalo fallback multipliers when no direct StatFin OKT data exists.
 *  Validated 2026-03: OKT prices are typically above RT in same area. */
export const OKT_FALLBACK = {
  fromRivitalo: 1.00,
  fromKerrostalo: 0.75,
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
  /** Whether building sits on a municipality-owned leased plot (vuokratontti) */
  isLeasedPlot?: boolean | null
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
  tonttiFactor: number
}

export function computeAgeFactor(
  constructionYear: number | null,
  referenceYear: number
): number {
  if (constructionYear === null) return 1.0

  const age = referenceYear - constructionYear

  // U-shaped curve: 1960s-70s panel houses (age ~50-60) are cheapest,
  // pre-war buildings (age 80-100+) recover value.
  // Recalibrated 2026-04-01 against 87 Etuovi asking prices + 535 staging listings.
  // New-build factors boosted with 60% correction (validation shows -15% bias
  // for ≤5yr, -12% for 6-10yr, -11% for 11-20yr). Conservative correction
  // because much of the under-estimation also comes from missing neighborhood factors.
  // Middle brackets (21-40yr) anchored at near-zero validation error.
  if (age <= 0) return 1.55    // brand new / under construction
  if (age <= 5) return 1.47    // very new
  if (age <= 10) return 1.32   // recent
  if (age <= 20) return 1.18   // modern
  if (age <= 30) return 1.00   // maturing (was 0.97, ideal 1.00)
  if (age <= 40) return 0.90   // aging (anchor — accurate in validation)
  if (age <= 50) return 0.86   // late 70s panels (was 0.84, slight lift)
  if (age <= 60) return 0.82   // 60s-70s panels (valley — cheapest, was 0.80)
  if (age <= 70) return 0.80   // post-war (anchor — accurate in validation)
  if (age <= 80) return 0.85   // 1940s-50s recovery
  if (age <= 100) return 0.88  // pre-war (was 0.90, slight correction for over-estimation)
  return 0.88                   // historical (was 0.92, old bracket showed +9% over-estimation)
}

export function computeWaterFactor(distanceM: number | null): number {
  if (distanceM === null) return 1.0

  // Recalibrated 2026-03-21: Finnish waterfront properties command
  // 25-40% premiums. Original 1.15 max was too conservative.
  // Only lakes >1ha and sea count (ponds/rivers filtered in migration 013).
  if (distanceM <= 10) return 1.35   // on the shore — own waterfront
  if (distanceM <= 20) return 1.28   // direct waterfront — dock access
  if (distanceM <= 50) return 1.20   // waterfront row — clear views
  if (distanceM <= 100) return 1.13  // near waterfront — likely views
  if (distanceM <= 200) return 1.07  // short walk to water
  if (distanceM <= 500) return 1.03  // neighborhood amenity
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
 * Leased plot (vuokratontti) discount factor.
 * Buildings on municipality-owned leased land sell for less because
 * buyers must pay ongoing ground rent. Applied to KT and RT only —
 * OKT excluded pending validation data.
 * Value 0.92 = conservative estimate based on Finnish market research
 * (5-15% discount range, using lower bound). Recalibrate when we have
 * Etuovi detail page data with holdingType field.
 */
export const TONTTI_FACTOR_LEASED = 0.92

export function computeTonttiFactor(
  isLeasedPlot: boolean | null | undefined,
  propertyType: PropertyType | undefined
): number {
  if (!isLeasedPlot) return 1.0
  if (propertyType === 'omakotitalo') return 1.0
  return TONTTI_FACTOR_LEASED
}

/**
 * Map building metadata to Finnish property type.
 *
 * Priority:
 * 1. Ryhti main_purpose (authoritative, ~85% coverage)
 * 2. Explicit OSM building types
 * 3. Floor count heuristic
 * 4. Default: omakotitalo
 */
export function inferPropertyType(
  buildingType: string | null,
  floorCount: number | null,
  ryhtiMainPurpose?: string | null
): 'kerrostalo' | 'rivitalo' | 'omakotitalo' {
  // 1. Ryhti main_purpose — authoritative building registry
  if (ryhtiMainPurpose) {
    if (ryhtiMainPurpose === '0110') return 'omakotitalo'
    if (['0111', '0112', '0120'].includes(ryhtiMainPurpose)) return 'rivitalo'
    if (ryhtiMainPurpose.startsWith('01')) return 'kerrostalo'
  }

  // 2. Explicit OSM building types
  if (buildingType === 'apartments') return 'kerrostalo'
  if (buildingType === 'terrace' || buildingType === 'semidetached_house') return 'rivitalo'
  if (buildingType === 'detached' || buildingType === 'house') return 'omakotitalo'

  // 3. Floor count heuristic
  if (floorCount !== null && floorCount >= 3) return 'kerrostalo'
  if (floorCount === 2) return 'rivitalo'

  // 4. Default — most Finnish buildings without metadata are small houses
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

  // Water proximity is a permanent physical attribute (views, dock, beach) —
  // does not depreciate with building age, so no dampening applied.
  const waterFactor = rawWaterFactor
  // Dampen neighborhood premium for old buildings (market sentiment effect)
  const neighborhoodFactor = dampenPremium(rawNeighborhoodFactor, ageFactor)
  // Leased plot discount (vuokratontti)
  const tonttiFactor = computeTonttiFactor(input.isLeasedPlot, input.propertyType)

  const estimatedPricePerSqm = Math.round(
    input.basePrice * ageFactor * energyFactor * waterFactor * floorFactor * sizeFactor * neighborhoodFactor * tonttiFactor
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
    tonttiFactor,
  }
}

// ---------------------------------------------------------------------------
// Confidence-adaptive price range
// ---------------------------------------------------------------------------

const roundTo50 = (v: number) => Math.round(v / 50) * 50

export interface PriceRange {
  /** Lower bound, rounded to nearest 50 */
  low: number
  /** Upper bound, rounded to nearest 50 */
  high: number
  /** Margin percentage, e.g. 0.12 for ±12% */
  marginPct: number
}

/**
 * Compute a confidence-adaptive price range around a point estimate.
 *
 * Base margin: ±20% (worst case — no metadata).
 * Narrowing:
 *   - Has neighborhood factor (≠ 1.0): −8pp → ±12%
 *   - Has construction year:           −2pp
 *   - Has energy class:                −1pp
 * Minimum margin: ±8%.
 * Bounds rounded to nearest 50 for clean display.
 */
export function computePriceRange(
  price: number,
  opts?: {
    neighborhoodFactor?: number
    hasConstructionYear?: boolean
    hasEnergyClass?: boolean
  }
): PriceRange {
  let margin = 0.20

  if (opts?.neighborhoodFactor != null && opts.neighborhoodFactor !== 1.0) {
    margin -= 0.08
  }
  if (opts?.hasConstructionYear) {
    margin -= 0.02
  }
  if (opts?.hasEnergyClass) {
    margin -= 0.01
  }

  margin = Math.max(0.08, margin)

  return {
    low: roundTo50(price * (1 - margin)),
    high: roundTo50(price * (1 + margin)),
    marginPct: margin,
  }
}
