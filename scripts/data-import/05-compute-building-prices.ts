/**
 * Script 05: Compute estimated prices for all buildings.
 *
 * Calls the PostGIS function compute_all_building_prices() which uses
 * compute_building_price() to calculate per-building price estimates
 * based on area prices, building age, water proximity, and floor count.
 *
 * Prerequisites: Scripts 01-04 must be run first.
 *
 * Usage: npx tsx scripts/data-import/05-compute-building-prices.ts
 */

import { supabase } from './lib/supabaseAdmin'

const ESTIMATION_YEAR = 2024
const BATCH_SIZE = 1000

async function main() {
  console.log('=== Building Price Computation ===\n')
  console.log(`Estimation year: ${ESTIMATION_YEAR}`)

  // Check current state (use estimated count to avoid timeout on large tables)
  const { count: totalBuildings } = await supabase
    .from('buildings')
    .select('id', { count: 'estimated', head: true })

  const { count: withArea } = await supabase
    .from('buildings')
    .select('id', { count: 'estimated', head: true })
    .not('area_id', 'is', null)

  const { count: needsEstimate } = await supabase
    .from('buildings')
    .select('id', { count: 'estimated', head: true })
    .not('area_id', 'is', null)
    .is('estimation_year', null)

  const { count: alreadyEstimated } = await supabase
    .from('buildings')
    .select('id', { count: 'estimated', head: true })
    .not('estimation_year', 'is', null)

  console.log(`Total buildings:        ${totalBuildings}`)
  console.log(`With area assignment:   ${withArea}`)
  console.log(`Already estimated:      ${alreadyEstimated}`)
  console.log(`Needing estimation:     ${needsEstimate}`)

  // Don't bail on null count — it means the query timed out, not 0 rows.
  if (needsEstimate === 0) {
    console.log('\nAll buildings already have price estimates.')
    return
  }

  console.log(`\nComputing prices in batches of ${BATCH_SIZE}...\n`)

  let totalProcessed = 0
  let batchNum = 0

  while (true) {
    batchNum++

    const { data, error } = await supabase.rpc('compute_all_building_prices', {
      p_year: ESTIMATION_YEAR,
      p_limit: BATCH_SIZE,
    })

    if (error) {
      console.error('RPC compute_all_building_prices failed:', error.message)
      console.log('\nFallback: Run this SQL in the Supabase SQL editor:\n')
      console.log(`UPDATE buildings
SET
  estimated_price_per_sqm = compute_building_price(
    area_id, construction_year, min_distance_to_water_m,
    floor_count, building_type, ${ESTIMATION_YEAR}
  ),
  estimation_year = ${ESTIMATION_YEAR}
WHERE area_id IS NOT NULL
  AND estimation_year IS NULL;`)
      break
    }

    const batchCount = typeof data === 'number' ? data : 0

    if (batchCount === 0) break

    totalProcessed += batchCount

    if (batchNum % 5 === 0 || batchCount < BATCH_SIZE) {
      const pct = Math.round((totalProcessed / needsEstimate) * 100)
      console.log(
        `  Batch ${batchNum}: +${batchCount} (total: ${totalProcessed}/${needsEstimate}, ${pct}%)`
      )
    }
  }

  // Summary
  const { count: estimated } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('estimated_price_per_sqm', 'is', null)

  const { count: noPrice } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('area_id', 'is', null)
    .is('estimated_price_per_sqm', null)

  console.log(`\n=== Complete ===`)
  console.log(`Buildings with price estimate: ${estimated}`)
  console.log(`Buildings without estimate:    ${noPrice} (no base price data for their area/type)`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
