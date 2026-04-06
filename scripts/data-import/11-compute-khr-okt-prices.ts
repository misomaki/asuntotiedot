/**
 * Script 11: Compute OKT base prices from KHR transaction data.
 *
 * Derives OKT EUR/m² by combining:
 *   - KHR median total transaction prices (from khr_transaction_stats)
 *   - Average OKT living area per postal code (from buildings table)
 *
 * Formula: price_per_sqm = khr_median_price / avg_okt_living_area
 *
 * Results are inserted into price_estimates with property_type='omakotitalo',
 * replacing the current crude fallback (rivitalo × 1.10 or kerrostalo × 0.90).
 *
 * Prerequisites: Scripts 10 (KHR stats import) must be run first.
 *
 * Usage: npx tsx scripts/data-import/11-compute-khr-okt-prices.ts
 */

import { supabase } from './lib/supabaseAdmin'

/** Minimum OKT buildings in a postal code to trust the avg living area */
const MIN_BUILDINGS = 5
/** Sanity bounds for derived EUR/m² */
const MIN_PRICE_PER_SQM = 500
const MAX_PRICE_PER_SQM = 15000
/** Minimum KHR transactions to trust the median price */
const MIN_TRANSACTIONS = 3
/** OKT = apartment_count = 1, living area between 50-500 m² */
const MIN_LIVING_AREA = 50
const MAX_LIVING_AREA = 500

interface AreaOktStats {
  areaCode: string
  areaId: string
  avgLivingArea: number
  buildingCount: number
}

interface KhrRow {
  area_code: string
  area_id: string | null
  year: number
  location_type: string
  median_price: number | null
  transaction_count: number | null
}

// ── Step 1: Compute avg OKT living area per postal code ──────────────

async function computeOktLivingAreas(): Promise<Map<string, AreaOktStats>> {
  console.log('Computing avg OKT living area per postal code...')

  // Fetch area code mapping
  const { data: areas, error: areaError } = await supabase
    .from('areas')
    .select('id, area_code')

  if (areaError) throw new Error(`Failed to fetch areas: ${areaError.message}`)

  const codeById = new Map<string, string>()
  const idByCode = new Map<string, string>()
  for (const a of areas ?? []) {
    codeById.set(a.id, a.area_code)
    idByCode.set(a.area_code, a.id)
  }

  // Paginate through OKT buildings (apartment_count = 1)
  const PAGE_SIZE = 1000
  const areaAgg = new Map<string, { sum: number; count: number }>()
  let offset = 0
  let totalFetched = 0

  while (true) {
    const { data } = await supabase
      .from('buildings')
      .select('area_id, total_area_sqm')
      .eq('apartment_count', 1)
      .eq('is_residential', true)
      .not('area_id', 'is', null)
      .not('total_area_sqm', 'is', null)
      .gt('total_area_sqm', MIN_LIVING_AREA)
      .lt('total_area_sqm', MAX_LIVING_AREA)
      .range(offset, offset + PAGE_SIZE - 1)

    if (!data || data.length === 0) break
    totalFetched += data.length

    for (const b of data) {
      const code = codeById.get(b.area_id)
      if (!code) continue
      const existing = areaAgg.get(code) ?? { sum: 0, count: 0 }
      existing.sum += b.total_area_sqm
      existing.count++
      areaAgg.set(code, existing)
    }

    offset += PAGE_SIZE
    if (totalFetched % 50000 < PAGE_SIZE) {
      process.stdout.write(`  ${totalFetched} buildings...`)
    }
    if (data.length < PAGE_SIZE) break
  }

  console.log(`\n  ${totalFetched} OKT buildings fetched`)

  // Filter to areas with enough buildings
  const result = new Map<string, AreaOktStats>()
  for (const [code, agg] of areaAgg) {
    if (agg.count >= MIN_BUILDINGS) {
      result.set(code, {
        areaCode: code,
        areaId: idByCode.get(code) ?? '',
        avgLivingArea: agg.sum / agg.count,
        buildingCount: agg.count,
      })
    }
  }

  console.log(`  ${result.size} postal codes with ≥${MIN_BUILDINGS} OKT buildings`)
  return result
}

// ── Step 2: Fetch KHR median prices ──────────────────────────────────

async function fetchKhrPrices(): Promise<KhrRow[]> {
  console.log('\nFetching KHR transaction stats...')

  const PAGE_SIZE = 1000
  const allRows: KhrRow[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('khr_transaction_stats')
      .select('area_code, area_id, year, location_type, median_price, transaction_count')
      .not('median_price', 'is', null)
      .gte('transaction_count', MIN_TRANSACTIONS)
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(`Failed to fetch KHR stats: ${error.message}`)
    if (!data || data.length === 0) break

    allRows.push(...data)
    offset += PAGE_SIZE
    if (data.length < PAGE_SIZE) break
  }

  console.log(`  ${allRows.length} KHR rows with ≥${MIN_TRANSACTIONS} transactions`)
  return allRows
}

// ── Step 3: Compute EUR/m² and upsert ────────────────────────────────

async function main() {
  console.log('=== KHR-Derived OKT Base Prices ===\n')

  const oktAreas = await computeOktLivingAreas()
  const khrRows = await fetchKhrPrices()

  // Group KHR rows: for each postal code + year, prefer 'plan' over 'rural'
  // (plan = asemakaava-alueet = urban, more comparable to our areas)
  const khrByCodeYear = new Map<string, KhrRow>()
  for (const row of khrRows) {
    const key = `${row.area_code}_${row.year}`
    const existing = khrByCodeYear.get(key)
    // Prefer plan area; if both exist, plan wins
    if (!existing || (row.location_type === 'plan' && existing.location_type === 'rural')) {
      khrByCodeYear.set(key, row)
    }
  }

  console.log(`\nUnique postal code + year combinations: ${khrByCodeYear.size}`)

  // Compute EUR/m²
  const priceRows: Array<{
    area_id: string
    year: number
    quarter: null
    property_type: 'omakotitalo'
    price_per_sqm_avg: number
    price_per_sqm_median: number
    transaction_count: number
  }> = []

  let skippedNoArea = 0
  let skippedRange = 0

  for (const [, khr] of khrByCodeYear) {
    const oktStats = oktAreas.get(khr.area_code)
    if (!oktStats) {
      skippedNoArea++
      continue
    }

    const pricePerSqm = Math.round(khr.median_price! / oktStats.avgLivingArea)

    if (pricePerSqm < MIN_PRICE_PER_SQM || pricePerSqm > MAX_PRICE_PER_SQM) {
      skippedRange++
      continue
    }

    priceRows.push({
      area_id: oktStats.areaId,
      year: khr.year,
      quarter: null,
      property_type: 'omakotitalo',
      price_per_sqm_avg: pricePerSqm,
      price_per_sqm_median: pricePerSqm,
      transaction_count: khr.transaction_count ?? 0,
    })
  }

  console.log(`\nDerived OKT EUR/m² rows: ${priceRows.length}`)
  console.log(`Skipped (no OKT area data): ${skippedNoArea}`)
  console.log(`Skipped (out of range ${MIN_PRICE_PER_SQM}-${MAX_PRICE_PER_SQM}): ${skippedRange}`)

  // Stats
  const prices = priceRows.map(r => r.price_per_sqm_avg)
  prices.sort((a, b) => a - b)
  if (prices.length > 0) {
    const avg = prices.reduce((s, v) => s + v, 0) / prices.length
    const median = prices[Math.floor(prices.length / 2)]
    console.log(`\nPrice distribution:`)
    console.log(`  avg: ${avg.toFixed(0)} EUR/m²`)
    console.log(`  median: ${median} EUR/m²`)
    console.log(`  p10: ${prices[Math.floor(prices.length * 0.1)]} EUR/m²`)
    console.log(`  p90: ${prices[Math.floor(prices.length * 0.9)]} EUR/m²`)
  }

  // Unique areas
  const uniqueAreas = new Set(priceRows.map(r => r.area_id))
  const latestYear = Math.max(...priceRows.map(r => r.year))
  const latestYearRows = priceRows.filter(r => r.year === latestYear)
  console.log(`\nUnique postal codes: ${uniqueAreas.size}`)
  console.log(`Latest year (${latestYear}): ${latestYearRows.length} rows`)

  // Upsert into price_estimates
  console.log(`\nUpserting into price_estimates...`)
  const BATCH_SIZE = 200
  let upserted = 0

  for (let i = 0; i < priceRows.length; i += BATCH_SIZE) {
    const batch = priceRows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('price_estimates')
      .upsert(batch, { onConflict: 'area_id,year,quarter,property_type' })

    if (error) {
      console.error(`Upsert error at batch ${i}: ${error.message}`)
      continue
    }

    upserted += batch.length
    if ((i + BATCH_SIZE) % 2000 < BATCH_SIZE) {
      console.log(`  ${upserted} / ${priceRows.length}...`)
    }
  }

  console.log(`\nDone! ${upserted} OKT price rows upserted into price_estimates.`)
  console.log(`\nNext steps:`)
  console.log(`  1. Reset building prices: UPDATE buildings SET estimation_year = NULL;`)
  console.log(`  2. Recompute: npx tsx scripts/data-import/05-compute-building-prices.ts`)
  console.log(`  3. Increment TILE_VERSION in MapContainer.tsx`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
