/**
 * Script 11: Compute OKT base prices from KHR transaction data.
 *
 * Derives OKT EUR/m² by combining:
 *   - KHR median total transaction prices (khr_transaction_stats)
 *   - MEDIAN OKT living area per postal code (buildings.total_area_sqm from Ryhti)
 *
 * Formula: price_per_sqm = khr_median_price / median_okt_living_area
 *
 * Outputs:
 *   1. price_estimates (property_type='omakotitalo'), one row per postal code
 *      + year. Existing OKT rows are DELETED first so stale single-year rows
 *      from older runs (2000–2016) cannot resurface as "latest year".
 *   2. municipality_prices (property_type='omakotitalo', source='khr_kunta'),
 *      one row per municipality + year, from KHR KUNTA-level rows divided by
 *      the municipality median living area. Used as the OKT parent price in
 *      13-build-area-base-prices.ts.
 *
 * Shrinkage / multi-year pooling is NOT done here — that is the job of
 * 13-build-area-base-prices.ts. This script only produces clean yearly inputs.
 *
 * Prerequisites: Scripts 00 (municipality codes) and 10 (KHR import, incl. KUNTA).
 *
 * Usage: npx tsx scripts/data-import/11-compute-khr-okt-prices.ts
 */

import { supabase } from './lib/supabaseAdmin'
import { getPgClient } from './lib/pgClient'

/** Minimum OKT buildings in a postal code to trust the median living area */
const MIN_BUILDINGS = 5
/** Minimum OKT buildings in a municipality to trust its median living area */
const MIN_MUNICIPALITY_BUILDINGS = 20
/** Sanity bounds for derived EUR/m² */
const MIN_PRICE_PER_SQM = 400
const MAX_PRICE_PER_SQM = 15000
/** Minimum KHR transactions to keep a yearly median */
const MIN_TRANSACTIONS = 3
/** OKT = apartment_count = 1, living area between 50-500 m² */
const MIN_LIVING_AREA = 50
const MAX_LIVING_AREA = 500
/** Only recent years matter for base prices (older rows add noise) */
const MIN_YEAR = 2018

interface AreaRef {
  id: string
  area_code: string
  municipality: string
  municipality_code: string | null
}

interface KhrRow {
  area_code: string
  area_id: string | null
  year: number
  location_type: 'plan' | 'rural'
  region_type: 'postal' | 'municipality'
  area_name: string | null
  median_price: number | null
  transaction_count: number | null
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// ── Step 1: median OKT living area per postal code and municipality ──

async function computeLivingAreas(areas: AreaRef[]): Promise<{
  byArea: Map<string, { median: number; count: number }>
  byMunicipality: Map<string, { median: number; count: number }>
}> {
  console.log('Computing median OKT living area per postal code / municipality...')

  const areaById = new Map(areas.map((a) => [a.id, a]))
  const perArea = new Map<string, number[]>()
  const perMunicipality = new Map<string, number[]>()

  const PAGE_SIZE = 1000
  let offset = 0
  let totalFetched = 0

  while (true) {
    const { data, error } = await supabase
      .from('buildings')
      .select('area_id, total_area_sqm')
      .eq('apartment_count', 1)
      .eq('is_residential', true)
      .not('area_id', 'is', null)
      .not('total_area_sqm', 'is', null)
      .gt('total_area_sqm', MIN_LIVING_AREA)
      .lt('total_area_sqm', MAX_LIVING_AREA)
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(`Failed to fetch buildings: ${error.message}`)
    if (!data || data.length === 0) break
    totalFetched += data.length

    for (const b of data) {
      const area = areaById.get(b.area_id)
      if (!area) continue
      const v = Number(b.total_area_sqm)
      const list = perArea.get(area.id) ?? []
      list.push(v)
      perArea.set(area.id, list)
      if (area.municipality_code) {
        const ml = perMunicipality.get(area.municipality_code) ?? []
        ml.push(v)
        perMunicipality.set(area.municipality_code, ml)
      }
    }

    offset += PAGE_SIZE
    if (totalFetched % 50000 < PAGE_SIZE) process.stdout.write(`  ${totalFetched} buildings...\n`)
    if (data.length < PAGE_SIZE) break
  }

  console.log(`  ${totalFetched} OKT buildings with Ryhti living area`)

  const byArea = new Map<string, { median: number; count: number }>()
  for (const [areaId, list] of perArea) {
    if (list.length >= MIN_BUILDINGS) byArea.set(areaId, { median: median(list), count: list.length })
  }
  const byMunicipality = new Map<string, { median: number; count: number }>()
  for (const [code, list] of perMunicipality) {
    if (list.length >= MIN_MUNICIPALITY_BUILDINGS) {
      byMunicipality.set(code, { median: median(list), count: list.length })
    }
  }

  console.log(`  ${byArea.size} postal codes with ≥${MIN_BUILDINGS} OKT buildings`)
  console.log(`  ${byMunicipality.size} municipalities with ≥${MIN_MUNICIPALITY_BUILDINGS} OKT buildings`)
  return { byArea, byMunicipality }
}

// ── Step 2: KHR yearly medians ───────────────────────────────────────

async function fetchKhrRows(): Promise<KhrRow[]> {
  console.log('\nFetching KHR transaction stats...')
  const PAGE_SIZE = 1000
  const rows: KhrRow[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('khr_transaction_stats')
      .select('area_code, area_id, area_name, year, location_type, region_type, median_price, transaction_count')
      .not('median_price', 'is', null)
      .gte('transaction_count', MIN_TRANSACTIONS)
      .gte('year', MIN_YEAR)
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(`Failed to fetch KHR stats: ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...(data as KhrRow[]))
    offset += PAGE_SIZE
    if (data.length < PAGE_SIZE) break
  }

  console.log(`  ${rows.length} KHR rows (year ≥ ${MIN_YEAR}, n ≥ ${MIN_TRANSACTIONS})`)
  return rows
}

/** Per (code, year) keep the plan-area row; fall back to rural. */
function preferPlan(rows: KhrRow[]): Map<string, KhrRow> {
  const out = new Map<string, KhrRow>()
  for (const row of rows) {
    const key = `${row.area_code}_${row.year}`
    const existing = out.get(key)
    if (!existing || (row.location_type === 'plan' && existing.location_type === 'rural')) {
      out.set(key, row)
    }
  }
  return out
}

// ── Step 3: derive €/m² and write ────────────────────────────────────

async function main() {
  console.log('=== KHR-Derived OKT Base Prices ===\n')

  // All 3 000+ areas — the Supabase REST client caps responses at 1 000 rows, so use pg
  const pgc = await getPgClient()
  const areas = (await pgc.query<AreaRef>('SELECT id, area_code, municipality, municipality_code FROM areas')).rows
  await pgc.end()
  console.log(`Areas: ${areas.length}`)
  const areaByCode = new Map(areas.map((a) => [a.area_code, a]))

  const { byArea, byMunicipality } = await computeLivingAreas(areas)
  const khrRows = await fetchKhrRows()

  // ── Postal-code level → price_estimates ──
  const postal = preferPlan(khrRows.filter((r) => r.region_type === 'postal'))
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

  for (const khr of postal.values()) {
    const area = areaByCode.get(khr.area_code)
    const living = area ? byArea.get(area.id) : undefined
    if (!area || !living) {
      skippedNoArea++
      continue
    }
    const pricePerSqm = Math.round(khr.median_price! / living.median)
    if (pricePerSqm < MIN_PRICE_PER_SQM || pricePerSqm > MAX_PRICE_PER_SQM) {
      skippedRange++
      continue
    }
    priceRows.push({
      area_id: area.id,
      year: khr.year,
      quarter: null,
      property_type: 'omakotitalo',
      price_per_sqm_avg: pricePerSqm,
      price_per_sqm_median: pricePerSqm,
      transaction_count: khr.transaction_count ?? 0,
    })
  }

  console.log(`\nPostal-code OKT €/m² rows: ${priceRows.length}`)
  console.log(`  skipped (no area / too few OKT buildings): ${skippedNoArea}`)
  console.log(`  skipped (outside ${MIN_PRICE_PER_SQM}–${MAX_PRICE_PER_SQM}): ${skippedRange}`)
  console.log(`  unique postal codes: ${new Set(priceRows.map((r) => r.area_id)).size}`)

  // ── Municipality level → municipality_prices ──
  const muni = preferPlan(khrRows.filter((r) => r.region_type === 'municipality'))
  const muniRows: Array<{
    municipality_code: string
    municipality: string
    year: number
    property_type: 'omakotitalo'
    price_per_sqm: number
    transaction_count: number | null
    source: 'khr_kunta'
  }> = []
  let muniSkipped = 0
  for (const khr of muni.values()) {
    const living = byMunicipality.get(khr.area_code)
    if (!living) {
      muniSkipped++
      continue
    }
    const pricePerSqm = Math.round(khr.median_price! / living.median)
    if (pricePerSqm < MIN_PRICE_PER_SQM || pricePerSqm > MAX_PRICE_PER_SQM) continue
    muniRows.push({
      municipality_code: khr.area_code,
      municipality: khr.area_name ?? khr.area_code,
      year: khr.year,
      property_type: 'omakotitalo',
      price_per_sqm: pricePerSqm,
      transaction_count: khr.transaction_count,
      source: 'khr_kunta',
    })
  }
  console.log(`\nMunicipality OKT €/m² rows: ${muniRows.length} (${new Set(muniRows.map((r) => r.municipality_code)).size} municipalities)`)
  console.log(`  skipped (no OKT living-area data in our buildings): ${muniSkipped}`)

  // ── Write ──
  console.log('\nDeleting old OKT rows from price_estimates...')
  const { error: delErr } = await supabase
    .from('price_estimates')
    .delete()
    .eq('property_type', 'omakotitalo')
  if (delErr) throw new Error(`Delete failed: ${delErr.message}`)

  let upserted = 0
  for (let i = 0; i < priceRows.length; i += 200) {
    const batch = priceRows.slice(i, i + 200)
    const { error } = await supabase
      .from('price_estimates')
      .upsert(batch, { onConflict: 'area_id,year,quarter,property_type' })
    if (error) {
      console.error(`  price_estimates upsert error at ${i}: ${error.message}`)
      continue
    }
    upserted += batch.length
  }
  console.log(`  ${upserted} OKT rows written to price_estimates`)

  const { error: muniDelErr } = await supabase
    .from('municipality_prices')
    .delete()
    .eq('source', 'khr_kunta')
  if (muniDelErr) throw new Error(`municipality_prices delete failed: ${muniDelErr.message}`)

  let muniUpserted = 0
  for (let i = 0; i < muniRows.length; i += 200) {
    const batch = muniRows.slice(i, i + 200)
    const { error } = await supabase
      .from('municipality_prices')
      .upsert(batch, { onConflict: 'municipality_code,year,property_type,source' })
    if (error) {
      console.error(`  municipality_prices upsert error at ${i}: ${error.message}`)
      continue
    }
    muniUpserted += batch.length
  }
  console.log(`  ${muniUpserted} OKT rows written to municipality_prices`)

  // ── Distribution summary ──
  const prices = priceRows.map((r) => r.price_per_sqm_avg).sort((a, b) => a - b)
  if (prices.length > 0) {
    console.log(`\nPostal-code OKT €/m² distribution: p10 ${prices[Math.floor(prices.length * 0.1)]}, median ${prices[Math.floor(prices.length / 2)]}, p90 ${prices[Math.floor(prices.length * 0.9)]}`)
  }

  console.log('\nNext: npx tsx scripts/data-import/13-build-area-base-prices.ts')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
