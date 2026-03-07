/**
 * Script 05: Compute estimated prices for all buildings.
 *
 * Uses the SQL function compute_building_price() to calculate
 * per-building price estimates based on area prices, building age,
 * water proximity, and floor count.
 *
 * Prerequisites: Scripts 01-04 must be run first.
 *
 * Usage: npx tsx scripts/data-import/05-compute-building-prices.ts
 */

import { supabase } from './lib/supabaseAdmin'

const ESTIMATION_YEAR = 2024

async function computePrices() {
  console.log(`Computing building price estimates for year ${ESTIMATION_YEAR}...\n`)

  // Check how many buildings need estimation
  const { count: totalCount } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('area_id', 'is', null)

  console.log(`Total buildings with area assignment: ${totalCount}`)

  const { count: needsEstimate } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('area_id', 'is', null)
    .is('estimated_price_per_sqm', null)

  console.log(`Buildings needing price estimate: ${needsEstimate}`)

  if (!needsEstimate || needsEstimate === 0) {
    console.log('All buildings already have estimates.')
    return
  }

  // Use the SQL function to batch compute prices
  // This is more efficient than doing it row by row from TypeScript
  console.log('\nRunning batch price computation via SQL...')
  console.log(
    'Execute this SQL in the Supabase SQL editor:\n\n' +
      `UPDATE buildings\n` +
      `SET\n` +
      `  estimated_price_per_sqm = compute_building_price(\n` +
      `    area_id, construction_year, min_distance_to_water_m,\n` +
      `    floor_count, building_type, ${ESTIMATION_YEAR}\n` +
      `  ),\n` +
      `  estimation_year = ${ESTIMATION_YEAR}\n` +
      `WHERE area_id IS NOT NULL\n` +
      `  AND estimated_price_per_sqm IS NULL;`
  )

  // Also try running it directly via RPC
  console.log('\nAttempting to run via Supabase...')

  // Process in batches to avoid timeout
  const BATCH_SIZE = 1000
  let processed = 0

  // Fetch buildings that need estimation
  let hasMore = true

  while (hasMore) {
    const { data: buildings, error } = await supabase
      .from('buildings')
      .select('id, area_id, construction_year, min_distance_to_water_m, floor_count, building_type')
      .not('area_id', 'is', null)
      .is('estimated_price_per_sqm', null)
      .limit(BATCH_SIZE)

    if (error) {
      console.error('Error fetching buildings:', error.message)
      break
    }

    if (!buildings || buildings.length === 0) {
      hasMore = false
      break
    }

    // For each building, compute price in TypeScript and update
    // (Fallback if the SQL function approach doesn't work via REST)
    for (const b of buildings) {
      // Fetch the base price for this area
      const { data: priceData } = await supabase
        .from('price_estimates')
        .select('price_per_sqm_avg, price_per_sqm_median')
        .eq('area_id', b.area_id)
        .eq('year', ESTIMATION_YEAR)
        .eq('property_type', inferPropertyType(b.building_type, b.floor_count))
        .single()

      if (!priceData || !priceData.price_per_sqm_avg) continue

      const basePrice = priceData.price_per_sqm_median ?? priceData.price_per_sqm_avg
      const ageFactor = computeAgeFactor(b.construction_year, ESTIMATION_YEAR)
      const waterFactor = computeWaterFactor(b.min_distance_to_water_m)
      const floorFactor = computeFloorFactor(b.floor_count)

      const estimatedPrice = Math.round(
        basePrice * ageFactor * waterFactor * floorFactor
      )

      await supabase
        .from('buildings')
        .update({
          estimated_price_per_sqm: estimatedPrice,
          estimation_year: ESTIMATION_YEAR,
        })
        .eq('id', b.id)
    }

    processed += buildings.length
    console.log(`  Processed ${processed} buildings...`)

    if (buildings.length < BATCH_SIZE) {
      hasMore = false
    }
  }

  console.log(`\nCompleted: ${processed} buildings processed`)
}

function inferPropertyType(
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

function computeAgeFactor(constructionYear: number | null, refYear: number): number {
  if (constructionYear === null) return 1.0
  const age = refYear - constructionYear
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

function computeWaterFactor(distanceM: number | null): number {
  if (distanceM === null) return 1.0
  if (distanceM <= 50) return 1.15
  if (distanceM <= 100) return 1.10
  if (distanceM <= 200) return 1.06
  if (distanceM <= 500) return 1.03
  return 1.0
}

function computeFloorFactor(floorCount: number | null): number {
  if (floorCount === null) return 1.0
  if (floorCount >= 8) return 1.03
  if (floorCount >= 5) return 1.01
  return 1.0
}

async function main() {
  console.log('=== Building Price Computation ===\n')
  await computePrices()
  console.log('\n=== Complete ===')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
