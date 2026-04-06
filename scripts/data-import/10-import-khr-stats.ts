/**
 * Script 10: Import OKT transaction statistics from MML Tilastopalvelu REST API.
 *
 * Source: Kiinteistöjen kauppahintarekisteri (KHR)
 * API:    https://khr.maanmittauslaitos.fi/tilastopalvelu/rest/1.1
 * License: CC BY 4.0, free, no authentication required.
 *
 * This covers kiinteistökauppa (real property sales) = omakotitalot on own land.
 * NOT asunto-osakekauppa (apartment shares) — those are in StatFin (script 02).
 *
 * Indicators imported:
 *   Plan area (asemakaava):
 *     2311 = count, 2312 = avg area m², 2313 = median €, 2314 = mean €, 2315 = std dev €
 *   Rural area (haja-asutus):
 *     2501 = count, 2502 = avg area m², 2503 = median €, 2504 = mean €, 2505 = std dev €
 *
 * Usage: npx tsx scripts/data-import/10-import-khr-stats.ts
 */

import { supabase } from './lib/supabaseAdmin'

const KHR_BASE = 'https://khr.maanmittauslaitos.fi/tilastopalvelu/rest/1.1'

/** Indicator IDs for built residential properties */
const INDICATORS = {
  plan: { count: 2311, avgArea: 2312, median: 2313, mean: 2314, stdDev: 2315 },
  rural: { count: 2501, avgArea: 2502, median: 2503, mean: 2504, stdDev: 2505 },
} as const

type LocationType = 'plan' | 'rural'

interface KhrDataPoint {
  indicator: number
  region: number
  year: number
  gender: string
  value: number
}

interface RegionInfo {
  id: number
  code: string
  name: string
}

// ── Helpers ──────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`KHR API error ${response.status}: ${url}`)
  }
  return response.json() as Promise<T>
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Region mapping ───────────────────────────────────────────────────

async function fetchPostalRegions(): Promise<Map<number, RegionInfo>> {
  console.log('Fetching postal code regions from KHR API...')
  const data = await fetchJson<Array<{
    id: number
    code: string
    title: { fi: string }
  }>>(`${KHR_BASE}/categories/Postinumero/regions`)

  const map = new Map<number, RegionInfo>()
  for (const item of data) {
    map.set(item.id, {
      id: item.id,
      code: item.code,
      name: item.title?.fi ?? '',
    })
  }
  console.log(`  ${map.size} postal code regions`)
  return map
}

// ── Fetch indicator data ─────────────────────────────────────────────

async function fetchIndicator(
  indicatorId: number,
  years: number[]
): Promise<KhrDataPoint[]> {
  const yearParam = years.join(',')
  const url = `${KHR_BASE}/indicators/${indicatorId}/data?years=${yearParam}`
  return fetchJson<KhrDataPoint[]>(url)
}

// ── Fetch area IDs from our database ─────────────────────────────────

async function fetchAreaIds(): Promise<Map<string, string>> {
  console.log('Fetching area IDs from database...')
  const { data, error } = await supabase
    .from('areas')
    .select('id, area_code')

  if (error) throw new Error(`Failed to fetch areas: ${error.message}`)

  const map = new Map<string, string>()
  for (const row of data ?? []) {
    map.set(row.area_code, row.id)
  }
  console.log(`  ${map.size} areas in database`)
  return map
}

// ── Main ─────���────────────────────���──────────────────────────────────

async function main() {
  console.log('=== KHR Transaction Stats Import ===\n')

  // 1. Fetch region mapping + our area IDs
  const [regions, areaIds] = await Promise.all([
    fetchPostalRegions(),
    fetchAreaIds(),
  ])

  // 2. Define year range (1990–current year)
  const currentYear = new Date().getFullYear()
  const startYear = 2000 // Practical start — older data has fewer postal codes
  const years = Array.from(
    { length: currentYear - startYear + 1 },
    (_, i) => startYear + i
  )
  console.log(`\nImporting years ${startYear}–${currentYear}`)

  // 3. Fetch all indicators for both location types
  const allRows: Array<{
    area_code: string
    area_name: string
    area_id: string | null
    year: number
    location_type: LocationType
    transaction_count: number | null
    median_price: number | null
    mean_price: number | null
    std_dev_price: number | null
    avg_plot_area_sqm: number | null
  }> = []

  for (const locType of ['plan', 'rural'] as const) {
    const indicators = INDICATORS[locType]
    console.log(`\nFetching ${locType} area data...`)

    // Fetch in year chunks (5 years each) to avoid huge responses
    const CHUNK_SIZE = 5
    const countData: KhrDataPoint[] = []
    const areaData: KhrDataPoint[] = []
    const medianData: KhrDataPoint[] = []
    const meanData: KhrDataPoint[] = []
    const stdDevData: KhrDataPoint[] = []

    for (let c = 0; c < years.length; c += CHUNK_SIZE) {
      const chunk = years.slice(c, c + CHUNK_SIZE)
      const label = `${chunk[0]}–${chunk[chunk.length - 1]}`
      process.stdout.write(`  ${label}...`)

      const [cd, ad, med, mea, sd] = await Promise.all([
        fetchIndicator(indicators.count, chunk),
        fetchIndicator(indicators.avgArea, chunk),
        fetchIndicator(indicators.median, chunk),
        fetchIndicator(indicators.mean, chunk),
        fetchIndicator(indicators.stdDev, chunk),
      ])

      countData.push(...cd)
      areaData.push(...ad)
      medianData.push(...med)
      meanData.push(...mea)
      stdDevData.push(...sd)

      process.stdout.write(` ${med.length} median pts\n`)
      await sleep(300) // Be polite between chunks
    }

    console.log(`  count: ${countData.length}, median: ${medianData.length}, mean: ${meanData.length}`)

    // Index by region+year for fast lookup
    type DataMap = Map<string, number>
    const toMap = (data: KhrDataPoint[]): DataMap => {
      const m = new Map<string, number>()
      for (const d of data) {
        m.set(`${d.region}_${d.year}`, d.value)
      }
      return m
    }

    const countMap = toMap(countData)
    const areaMap = toMap(areaData)
    const medianMap = toMap(medianData)
    const meanMap = toMap(meanData)
    const stdDevMap = toMap(stdDevData)

    // Collect all unique region+year combinations from any indicator
    const keys = new Set<string>()
    for (const d of [...countData, ...medianData, ...meanData]) {
      keys.add(`${d.region}_${d.year}`)
    }

    for (const key of keys) {
      const [regionStr, yearStr] = key.split('_')
      const regionId = parseInt(regionStr, 10)
      const year = parseInt(yearStr, 10)
      const regionInfo = regions.get(regionId)
      if (!regionInfo) continue // Not a postal code region

      const count = countMap.get(key) ?? null
      const median = medianMap.get(key) ?? null
      const mean = meanMap.get(key) ?? null

      // Skip if no price data at all
      if (median == null && mean == null && count == null) continue

      allRows.push({
        area_code: regionInfo.code,
        area_name: regionInfo.name,
        area_id: areaIds.get(regionInfo.code) ?? null,
        year,
        location_type: locType,
        transaction_count: count,
        median_price: median,
        mean_price: mean,
        std_dev_price: stdDevMap.get(key) ?? null,
        avg_plot_area_sqm: areaMap.get(key) ?? null,
      })
    }
  }

  console.log(`\nTotal rows to upsert: ${allRows.length}`)

  // 4. Count coverage stats
  const uniquePostalCodes = new Set(allRows.map(r => r.area_code))
  const matchedToDb = allRows.filter(r => r.area_id != null)
  const uniqueMatched = new Set(matchedToDb.map(r => r.area_code))
  console.log(`Unique postal codes: ${uniquePostalCodes.size}`)
  console.log(`Matched to our areas: ${uniqueMatched.size} / ${uniquePostalCodes.size}`)

  // 5. Batch upsert
  const BATCH_SIZE = 500
  let upserted = 0

  for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
    const batch = allRows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('khr_transaction_stats')
      .upsert(batch, { onConflict: 'area_code,year,location_type' })

    if (error) {
      console.error(`Upsert error at batch ${i}: ${error.message}`)
      // Continue with next batch
      continue
    }

    upserted += batch.length
    if ((i + BATCH_SIZE) % 5000 < BATCH_SIZE) {
      console.log(`  ${upserted} / ${allRows.length} upserted...`)
    }
  }

  console.log(`\nDone! ${upserted} rows upserted.`)

  // 6. Print summary by year (latest 5 years)
  console.log('\n=== Latest data summary ===')
  const recentYears = years.slice(-5)
  for (const y of recentYears) {
    const yearRows = allRows.filter(r => r.year === y)
    const planRows = yearRows.filter(r => r.location_type === 'plan')
    const ruralRows = yearRows.filter(r => r.location_type === 'rural')
    const planCodes = new Set(planRows.map(r => r.area_code))
    const ruralCodes = new Set(ruralRows.map(r => r.area_code))
    const totalTransactions = yearRows.reduce(
      (sum, r) => sum + (r.transaction_count ?? 0), 0
    )
    console.log(
      `${y}: ${planCodes.size} plan + ${ruralCodes.size} rural postal codes, ${totalTransactions.toLocaleString()} transactions`
    )
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
