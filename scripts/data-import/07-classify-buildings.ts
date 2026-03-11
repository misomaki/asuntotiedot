/**
 * Script 07: Classify buildings as residential vs non-residential.
 *
 * Uses a 3-tier classification system:
 *   1. Ryhti main_purpose code (highest authority) — '01xx' = residential
 *   2. OSM building_type denylist — garages, sheds, offices, etc.
 *   3. Footprint area heuristic — < 30 m² = auxiliary building
 *
 * Non-residential buildings are excluded from price estimation.
 *
 * Prerequisites:
 *   - Scripts 01-06 must be run first
 *   - Run supabase/migrations/007_building_classification.sql in SQL Editor
 *
 * After this script, re-run script 05 to recalculate prices (skipping non-residential):
 *   npx tsx scripts/data-import/05-compute-building-prices.ts
 *
 * Usage: npx tsx scripts/data-import/07-classify-buildings.ts
 */

import { supabase } from './lib/supabaseAdmin'

// ---------------------------------------------------------------------------
// Step 1: Match Ryhti main_purpose → buildings
// ---------------------------------------------------------------------------

async function matchRyhtiPurpose(): Promise<number> {
  console.log('\nStep 1: Matching Ryhti main_purpose to buildings...')

  // Count buildings needing purpose
  const { count } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('area_id', 'is', null)
    .is('ryhti_main_purpose', null)

  console.log(`Buildings without ryhti_main_purpose: ${count}`)

  if (!count || count === 0) return 0

  let totalMatched = 0
  let batchNum = 0

  while (true) {
    batchNum++

    const { data, error } = await supabase.rpc('match_ryhti_purpose_batch', {
      p_limit: 500,
    })

    if (error) {
      console.error('RPC match_ryhti_purpose_batch failed:', error.message)
      break
    }

    const batchCount = typeof data === 'number' ? data : 0
    if (batchCount === 0) break

    totalMatched += batchCount

    if (batchNum % 20 === 0 || batchCount < 500) {
      const pct = Math.round((totalMatched / count) * 100)
      console.log(
        `  Batch ${batchNum}: +${batchCount} (total: ${totalMatched}/${count}, ${pct}%)`
      )
    }
  }

  console.log(`Matched ryhti_main_purpose for ${totalMatched} buildings`)
  return totalMatched
}

// ---------------------------------------------------------------------------
// Step 2: Compute is_residential classification
// ---------------------------------------------------------------------------

async function computeIsResidential(): Promise<number> {
  console.log('\nStep 2: Computing is_residential classification...')

  const { count } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('area_id', 'is', null)
    .is('is_residential', null)

  console.log(`Buildings without is_residential: ${count}`)

  if (!count || count === 0) return 0

  let totalClassified = 0
  let batchNum = 0

  while (true) {
    batchNum++

    const { data, error } = await supabase.rpc('compute_is_residential_batch', {
      p_limit: 5000,
    })

    if (error) {
      console.error('RPC compute_is_residential_batch failed:', error.message)
      break
    }

    const batchCount = typeof data === 'number' ? data : 0
    if (batchCount === 0) break

    totalClassified += batchCount

    if (batchNum % 10 === 0 || batchCount < 5000) {
      const pct = Math.round((totalClassified / count) * 100)
      console.log(
        `  Batch ${batchNum}: +${batchCount} (total: ${totalClassified}/${count}, ${pct}%)`
      )
    }
  }

  console.log(`Classified ${totalClassified} buildings`)
  return totalClassified
}

// ---------------------------------------------------------------------------
// Step 3: Reset non-residential buildings that had a price
// ---------------------------------------------------------------------------

async function resetNonResidentialPrices(): Promise<number> {
  console.log('\nStep 3: Resetting prices on non-residential buildings...')

  // Count non-residential with prices
  const { count } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .eq('is_residential', false)
    .not('estimated_price_per_sqm', 'is', null)

  console.log(`Non-residential buildings with prices: ${count}`)

  if (!count || count === 0) return 0

  // Reset estimation_year so price computation will mark them as processed (no price)
  const { error } = await supabase
    .from('buildings')
    .update({ estimation_year: null, estimated_price_per_sqm: null })
    .eq('is_residential', false)
    .not('estimated_price_per_sqm', 'is', null)

  if (error) {
    console.error('Failed to reset non-residential prices:', error.message)
    return 0
  }

  console.log(`Reset ${count} non-residential buildings`)
  return count
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Building Classification: Residential vs Non-Residential ===\n')

  const purposeMatches = await matchRyhtiPurpose()
  const classified = await computeIsResidential()
  const priceResets = await resetNonResidentialPrices()

  // Summary stats — run all counts in parallel
  const [
    { count: totalBuildings },
    { count: residential },
    { count: nonResidential },
    { count: withPurpose },
    { count: needsEstimation },
  ] = await Promise.all([
    supabase.from('buildings').select('id', { count: 'exact', head: true }).not('area_id', 'is', null),
    supabase.from('buildings').select('id', { count: 'exact', head: true }).not('area_id', 'is', null).eq('is_residential', true),
    supabase.from('buildings').select('id', { count: 'exact', head: true }).not('area_id', 'is', null).eq('is_residential', false),
    supabase.from('buildings').select('id', { count: 'exact', head: true }).not('area_id', 'is', null).not('ryhti_main_purpose', 'is', null),
    supabase.from('buildings').select('id', { count: 'exact', head: true }).not('area_id', 'is', null).is('estimation_year', null),
  ])

  console.log(`\n=== Classification complete ===`)
  console.log(`Ryhti purposes matched:      ${purposeMatches}`)
  console.log(`Buildings classified:         ${classified}`)
  console.log(`Non-residential prices reset: ${priceResets}`)
  console.log(``)
  console.log(`--- Summary ---`)
  console.log(`Total buildings (with area):  ${totalBuildings}`)
  console.log(`With Ryhti purpose:           ${withPurpose} (${Math.round(((withPurpose ?? 0) / (totalBuildings ?? 1)) * 100)}%)`)
  console.log(`Residential:                  ${residential} (${Math.round(((residential ?? 0) / (totalBuildings ?? 1)) * 100)}%)`)
  console.log(`Non-residential:              ${nonResidential} (${Math.round(((nonResidential ?? 0) / (totalBuildings ?? 1)) * 100)}%)`)
  console.log(`Needing re-estimation:        ${needsEstimation}`)
  console.log(`\nRe-run script 05 to recalculate prices (non-residential will be skipped).`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
