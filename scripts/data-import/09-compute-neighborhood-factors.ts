/**
 * Script 09: Compute neighborhood factors from Etuovi listing data.
 *
 * For each postal code area with Etuovi listings in _etuovi_staging:
 *   factor = avg(asking_price) / avg(algorithmic_estimate)
 *
 * The algorithmic estimate uses base_price × age × water × floor
 * (WITHOUT neighborhood factor) to compute what our algorithm
 * would predict for that listing.
 *
 * Stores results in the neighborhood_factors table.
 *
 * Prerequisites: Migration 009 must be run first.
 *                _etuovi_staging must be populated with listings.
 *
 * Usage: npx tsx scripts/data-import/09-compute-neighborhood-factors.ts
 */

import { supabase } from './lib/supabaseAdmin'
import {
  computeAgeFactor,
  computeWaterFactor,
  computeFloorFactor,
  OKT_FALLBACK,
} from '../../app/lib/priceEstimation'

const ESTIMATION_YEAR = 2026  // Reference year for age factor
const FACTOR_MIN = 0.70
const FACTOR_MAX = 1.50

interface EtuoviListing {
  id: string
  postal_code: string
  property_type: string
  construction_year: number | null
  asking_price_per_sqm: number
  area_id: string | null
}

interface AreaPrice {
  area_id: string
  property_type: string
  price: number
}

async function main() {
  console.log('=== Neighborhood Factor Computation ===\n')

  // 1. Fetch all listings with area_id
  const { data: listings, error: listErr } = await supabase
    .from('_etuovi_staging')
    .select('id, postal_code, property_type, construction_year, asking_price_per_sqm, area_id')
    .not('area_id', 'is', null)
    .not('asking_price_per_sqm', 'is', null)

  if (listErr) {
    console.error('Failed to fetch listings:', listErr.message)
    process.exit(1)
  }

  if (!listings || listings.length === 0) {
    console.log('No listings found in _etuovi_staging. Populate the table first.')
    return
  }

  console.log(`Listings with area_id: ${listings.length}`)

  // 2. Fetch all base prices (latest year per area + property type)
  const { data: priceRows, error: priceErr } = await supabase
    .from('price_estimates')
    .select('area_id, property_type, price_per_sqm_avg, price_per_sqm_median, year')
    .not('price_per_sqm_avg', 'is', null)
    .order('year', { ascending: false })

  if (priceErr) {
    console.error('Failed to fetch price estimates:', priceErr.message)
    process.exit(1)
  }

  // Build lookup: area_id+type → latest price
  const priceMap = new Map<string, number>()
  for (const row of priceRows ?? []) {
    const key = `${row.area_id}:${row.property_type}`
    if (!priceMap.has(key)) {
      priceMap.set(key, Number(row.price_per_sqm_median ?? row.price_per_sqm_avg))
    }
  }

  // 3. For each listing, compute what our algorithm would estimate
  type FactorGroup = {
    askingPrices: number[]
    estimatedPrices: number[]
  }

  const groups = new Map<string, FactorGroup>()

  let matched = 0
  let unmatched = 0

  let skippedNoYear = 0

  for (const listing of listings as EtuoviListing[]) {
    if (!listing.area_id || !listing.asking_price_per_sqm) continue

    // Skip listings with unknown construction year — they get age_factor=1.0
    // which inflates the computed neighborhood factor for old buildings
    if (!listing.construction_year || listing.construction_year === 0) {
      skippedNoYear++
      continue
    }

    const pt = listing.property_type || 'kerrostalo'

    // Look up base price (same cascade as the algorithm)
    let basePrice: number | undefined

    if (pt === 'omakotitalo') {
      basePrice = priceMap.get(`${listing.area_id}:omakotitalo`)
      if (!basePrice) {
        const rtPrice = priceMap.get(`${listing.area_id}:rivitalo`)
        if (rtPrice) basePrice = rtPrice * OKT_FALLBACK.fromRivitalo
      }
      if (!basePrice) {
        const ktPrice = priceMap.get(`${listing.area_id}:kerrostalo`)
        if (ktPrice) basePrice = ktPrice * OKT_FALLBACK.fromKerrostalo
      }
    } else {
      basePrice = priceMap.get(`${listing.area_id}:${pt}`)
    }

    if (!basePrice) {
      unmatched++
      continue
    }

    const ageFactor = computeAgeFactor(listing.construction_year, ESTIMATION_YEAR)
    // Water distance unknown for listings — use neutral
    const waterFactor = 1.0
    // Floor count unknown for most listings — use neutral
    const floorFactor = 1.0

    const estimated = basePrice * ageFactor * waterFactor * floorFactor

    // Group by area_id + property_type
    const groupKey = `${listing.area_id}:${pt}`
    let group = groups.get(groupKey)
    if (!group) {
      group = { askingPrices: [], estimatedPrices: [] }
      groups.set(groupKey, group)
    }
    group.askingPrices.push(listing.asking_price_per_sqm)
    group.estimatedPrices.push(estimated)

    // Also add to 'all' group for this area
    const allKey = `${listing.area_id}:all`
    let allGroup = groups.get(allKey)
    if (!allGroup) {
      allGroup = { askingPrices: [], estimatedPrices: [] }
      groups.set(allKey, allGroup)
    }
    allGroup.askingPrices.push(listing.asking_price_per_sqm)
    allGroup.estimatedPrices.push(estimated)

    matched++
  }

  console.log(`Skipped (no year):     ${skippedNoYear}`)
  console.log(`Matched to base price: ${matched}`)
  console.log(`No base price found:   ${unmatched}`)
  console.log(`Factor groups:         ${groups.size}\n`)

  // 4. Compute factors and upsert
  const factors: Array<{
    area_id: string
    property_type: string
    factor: number
    sample_count: number
    confidence: string
  }> = []

  for (const [key, group] of Array.from(groups.entries())) {
    const [areaId, propertyType] = key.split(':')
    const n = group.askingPrices.length
    const avgAsking = group.askingPrices.reduce((a, b) => a + b, 0) / n
    const avgEstimated = group.estimatedPrices.reduce((a, b) => a + b, 0) / n

    if (avgEstimated === 0) continue

    let factor = avgAsking / avgEstimated
    factor = Math.max(FACTOR_MIN, Math.min(FACTOR_MAX, factor))

    let confidence: string
    if (n >= 5) confidence = 'high'
    else if (n >= 3) confidence = 'medium'
    else confidence = 'low'

    factors.push({
      area_id: areaId,
      property_type: propertyType,
      factor: Math.round(factor * 100) / 100,  // Round to 2 decimals
      sample_count: n,
      confidence,
    })
  }

  console.log(`Upserting ${factors.length} neighborhood factors...\n`)

  // Upsert in batches
  const BATCH_SIZE = 100
  for (let i = 0; i < factors.length; i += BATCH_SIZE) {
    const batch = factors.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('neighborhood_factors')
      .upsert(batch, { onConflict: 'area_id,property_type' })

    if (error) {
      console.error(`Upsert batch failed:`, error.message)
    }
  }

  // 5. Summary
  const highConf = factors.filter(f => f.confidence === 'high').length
  const medConf = factors.filter(f => f.confidence === 'medium').length
  const lowConf = factors.filter(f => f.confidence === 'low').length

  const typedFactors = factors.filter(f => f.property_type !== 'all')
  const avgFactor = typedFactors.length > 0
    ? typedFactors.reduce((a, b) => a + b.factor, 0) / typedFactors.length
    : 1.0
  const minFactor = typedFactors.length > 0
    ? Math.min(...typedFactors.map(f => f.factor))
    : 1.0
  const maxFactor = typedFactors.length > 0
    ? Math.max(...typedFactors.map(f => f.factor))
    : 1.0

  console.log('=== Summary ===')
  console.log(`Total factors:   ${factors.length}`)
  console.log(`  High (≥5):     ${highConf}`)
  console.log(`  Medium (3-4):  ${medConf}`)
  console.log(`  Low (1-2):     ${lowConf}`)
  console.log(`Factor range:    ${minFactor.toFixed(2)} – ${maxFactor.toFixed(2)}`)
  console.log(`Average factor:  ${avgFactor.toFixed(2)}`)

  // Show top/bottom factors
  const sorted = typedFactors.sort((a, b) => b.factor - a.factor)

  console.log('\nTop 10 premium areas:')
  for (const f of sorted.slice(0, 10)) {
    // Look up area name
    const { data: area } = await supabase
      .from('areas')
      .select('name, municipality')
      .eq('id', f.area_id)
      .single()
    const name = area ? `${area.name} (${area.municipality})` : f.area_id
    console.log(`  ${name} [${f.property_type}]: ×${f.factor.toFixed(2)} (n=${f.sample_count})`)
  }

  console.log('\nBottom 10 discounted areas:')
  for (const f of sorted.slice(-10).reverse()) {
    const { data: area } = await supabase
      .from('areas')
      .select('name, municipality')
      .eq('id', f.area_id)
      .single()
    const name = area ? `${area.name} (${area.municipality})` : f.area_id
    console.log(`  ${name} [${f.property_type}]: ×${f.factor.toFixed(2)} (n=${f.sample_count})`)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
