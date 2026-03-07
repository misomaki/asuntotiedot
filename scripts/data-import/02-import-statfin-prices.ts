/**
 * Script 02: Import real housing prices from Statistics Finland PxWeb API.
 *
 * Queries table statfin_ashi_pxt_13mu for postal code prices by year and
 * building type. Inserts into the `price_estimates` table.
 *
 * Building types from PxWeb:
 *   1 = Kerrostalo yksiöt
 *   2 = Kerrostalo kaksiot
 *   3 = Kerrostalo kolmiot+
 *   5 = Rivitalot yhteensä
 *
 * Kerrostalo subtypes (1,2,3) are combined into a weighted average
 * by transaction count, stored as property_type='kerrostalo'.
 * Type 5 is stored as property_type='rivitalo'.
 *
 * Usage: npx tsx scripts/data-import/02-import-statfin-prices.ts
 */

import { supabase } from './lib/supabaseAdmin'
import {
  queryPxWeb,
  parseJsonStat2,
  sleep,
  type PxWebQuery,
} from './lib/pxwebClient'
import { PXWEB_BASE_URL, CITIES } from './config'

/** Metric codes in PxWeb */
const METRIC_PRICE = 'keskihinta_aritm_nw'
const METRIC_COUNT = 'lkm_julk20'

async function fetchPostalCodes(): Promise<Map<string, string>> {
  console.log('Fetching area IDs from database...')

  const { data, error } = await supabase
    .from('areas')
    .select('id, area_code')

  if (error) throw new Error(`Failed to fetch areas: ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error('No areas in database. Run 01-import-paavo-areas.ts first.')
  }

  const map = new Map<string, string>()
  for (const row of data) {
    map.set(row.area_code, row.id)
  }

  console.log(`Found ${map.size} areas in database`)
  return map
}

async function fetchMetadata(): Promise<{
  postalCodes: string[]
  years: string[]
  buildingTypes: string[]
  metrics: string[]
}> {
  console.log('Fetching PxWeb table metadata...')

  const response = await fetch(PXWEB_BASE_URL)
  if (!response.ok) {
    throw new Error(`PxWeb metadata error: ${response.status}`)
  }

  const metadata = await response.json()
  const result: Record<string, string[]> = {}

  for (const variable of metadata.variables) {
    result[variable.code] = variable.values
    console.log(
      `  ${variable.code}: ${variable.values.length} values (${variable.text})`
    )
  }

  return {
    postalCodes: result['Postinumero'] ?? [],
    years: result['Vuosi'] ?? [],
    buildingTypes: result['Talotyyppi'] ?? [],
    metrics: result['Tiedot'] ?? [],
  }
}

interface CellData {
  postalCode: string
  year: number
  typeCode: string
  price: number | null
  count: number | null
}

async function importPricesForCity(
  cityName: string,
  postalCodes: string[],
  areaIdMap: Map<string, string>,
  years: string[],
  buildingTypes: string[],
  metrics: string[]
) {
  // Filter to postal codes that exist in our database
  const validPostalCodes = postalCodes.filter((pc) => areaIdMap.has(pc))
  if (validPostalCodes.length === 0) {
    console.log(`  No matching postal codes for ${cityName}, skipping`)
    return 0
  }

  console.log(
    `\n  Querying ${cityName}: ${validPostalCodes.length} postal codes × ${years.length} years × ${buildingTypes.length} types`
  )

  // PxWeb has a 100k cell limit. Split if necessary.
  const cellEstimate =
    validPostalCodes.length * years.length * buildingTypes.length * metrics.length

  let allCells: CellData[] = []

  if (cellEstimate > 90000) {
    // Split by years
    const halfYears = Math.ceil(years.length / 2)
    const yearChunks = [years.slice(0, halfYears), years.slice(halfYears)]

    for (const yearChunk of yearChunks) {
      const cells = await queryCity(
        validPostalCodes,
        yearChunk,
        buildingTypes,
        metrics
      )
      allCells = allCells.concat(cells)
      await sleep(500) // rate limit
    }
  } else {
    allCells = await queryCity(
      validPostalCodes,
      years,
      buildingTypes,
      metrics
    )
  }

  console.log(`  Parsed ${allCells.length} raw cells`)

  // Compute weighted averages for kerrostalo and direct values for rivitalo
  const priceRecords: Array<{
    areaId: string
    year: number
    propertyType: string
    priceAvg: number
    transactionCount: number
  }> = []

  // Group cells by postalCode + year
  const grouped = new Map<string, CellData[]>()
  for (const cell of allCells) {
    const key = `${cell.postalCode}-${cell.year}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(cell)
  }

  for (const [, cells] of grouped) {
    const postalCode = cells[0].postalCode
    const year = cells[0].year
    const areaId = areaIdMap.get(postalCode)
    if (!areaId) continue

    // Kerrostalo: weighted average of subtypes 1, 2, 3
    const ktCells = cells.filter(
      (c) => ['1', '2', '3'].includes(c.typeCode) && c.price !== null
    )
    if (ktCells.length > 0) {
      let totalWeightedPrice = 0
      let totalCount = 0
      for (const c of ktCells) {
        const count = c.count ?? 1
        totalWeightedPrice += (c.price ?? 0) * count
        totalCount += count
      }
      if (totalCount > 0) {
        priceRecords.push({
          areaId,
          year,
          propertyType: 'kerrostalo',
          priceAvg: Math.round(totalWeightedPrice / totalCount),
          transactionCount: totalCount,
        })
      }
    }

    // Rivitalo: direct from type 5
    const rtCell = cells.find(
      (c) => c.typeCode === '5' && c.price !== null
    )
    if (rtCell) {
      priceRecords.push({
        areaId,
        year,
        propertyType: 'rivitalo',
        priceAvg: Math.round(rtCell.price!),
        transactionCount: rtCell.count ?? 0,
      })
    }
  }

  // Insert into database in batches
  let inserted = 0

  for (let i = 0; i < priceRecords.length; i += 100) {
    const batch = priceRecords.slice(i, i + 100)

    const rows = batch.map((e) => ({
      area_id: e.areaId,
      year: e.year,
      quarter: null,
      property_type: e.propertyType,
      price_per_sqm_avg: e.priceAvg,
      price_per_sqm_median: null,
      transaction_count: e.transactionCount,
    }))

    const { error } = await supabase
      .from('price_estimates')
      .upsert(rows, {
        onConflict: 'area_id,year,quarter,property_type',
      })

    if (error) {
      console.error(`  Error inserting batch: ${error.message}`)
    } else {
      inserted += rows.length
    }
  }

  console.log(`  Inserted ${inserted} price records for ${cityName}`)
  return inserted
}

async function queryCity(
  postalCodes: string[],
  years: string[],
  buildingTypes: string[],
  metrics: string[]
): Promise<CellData[]> {
  const query: PxWebQuery = {
    query: [
      {
        code: 'Postinumero',
        selection: { filter: 'item', values: postalCodes },
      },
      {
        code: 'Talotyyppi',
        selection: { filter: 'item', values: buildingTypes },
      },
      {
        code: 'Vuosi',
        selection: { filter: 'item', values: years },
      },
      {
        code: 'Tiedot',
        selection: { filter: 'item', values: metrics },
      },
    ],
    response: { format: 'json-stat2' },
  }

  const data = await queryPxWeb(PXWEB_BASE_URL, query)
  const rows = parseJsonStat2(data)

  // Parse into CellData
  const cellMap = new Map<
    string,
    { price: number | null; count: number | null }
  >()

  for (const row of rows) {
    const postalCode = row['Postinumero'] as string
    const year = row['Vuosi'] as string
    const typeCode = row['Talotyyppi'] as string
    const metricCode = row['Tiedot'] as string
    const value = row.value as number | null

    const key = `${postalCode}-${year}-${typeCode}`

    if (!cellMap.has(key)) {
      cellMap.set(key, { price: null, count: null })
    }

    const entry = cellMap.get(key)!

    if (metricCode === METRIC_PRICE) {
      entry.price = value
    } else if (metricCode === METRIC_COUNT) {
      entry.count = value !== null ? Math.round(value) : null
    }
  }

  const cells: CellData[] = []
  for (const [key, val] of cellMap) {
    const [postalCode, yearStr, typeCode] = key.split('-')
    cells.push({
      postalCode,
      year: parseInt(yearStr, 10),
      typeCode,
      price: val.price,
      count: val.count,
    })
  }

  return cells
}

async function main() {
  console.log('=== StatFin Price Import ===\n')

  const areaIdMap = await fetchPostalCodes()
  const metadata = await fetchMetadata()

  // Use all 4 building types: 1,2,3 (kerrostalo subtypes), 5 (rivitalo)
  const allTypes = metadata.buildingTypes
  console.log(`\nUsing building types: ${allTypes.join(', ')}`)
  console.log(`Years: ${metadata.years[0]} - ${metadata.years[metadata.years.length - 1]}`)

  let totalInserted = 0

  for (const city of CITIES) {
    // Filter postal codes for this city
    const cityPostalCodes = metadata.postalCodes.filter((pc) =>
      city.postalPrefixes.some((prefix) => pc.startsWith(prefix))
    )

    if (cityPostalCodes.length === 0) {
      console.log(`\nNo postal codes found for ${city.name} in PxWeb data`)
      continue
    }

    console.log(`\n${city.name}: ${cityPostalCodes.length} postal codes available`)

    const inserted = await importPricesForCity(
      city.name,
      cityPostalCodes,
      areaIdMap,
      metadata.years,
      allTypes,
      metadata.metrics
    )

    totalInserted += inserted

    // Respect rate limits
    await sleep(500)
  }

  console.log(`\n=== Import complete: ${totalInserted} total price records ===`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
