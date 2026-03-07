/**
 * Building-level price estimation algorithm.
 *
 * Adjusts the area-level base price (from Statistics Finland) by:
 * 1. Building age (construction year)
 * 2. Proximity to water
 * 3. Floor count
 */

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

export function computeWaterFactor(distanceM: number | null): number {
  if (distanceM === null) return 1.0

  if (distanceM <= 50) return 1.15
  if (distanceM <= 100) return 1.10
  if (distanceM <= 200) return 1.06
  if (distanceM <= 500) return 1.03
  return 1.0
}

export function computeFloorFactor(floorCount: number | null): number {
  if (floorCount === null) return 1.0

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
  const floorFactor = computeFloorFactor(input.floorCount)

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
