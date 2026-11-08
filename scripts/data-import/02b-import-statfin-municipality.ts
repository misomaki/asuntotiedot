/**
 * Script 02b: Import municipality-level prices and price indices from StatFin.
 *
 *   13mx — Vanhojen osakeasuntojen neliöhinnat kunnittain (301 kuntaa, →2023)
 *          → municipality_prices (source = 'statfin_13mx', KT + RT)
 *   13mq — Vanhojen osakeasuntojen hintaindeksi (2020=100), vuositasolla,
 *          87 aluetta (kunnat, maakunnat, koko maa) → price_index
 *
 * These feed 13-build-area-base-prices.ts: 13mx is the municipality-level
 * parent price for KT/RT shrinkage, 13mq deflates older observations to
 * the latest year.
 *
 * Prerequisites: Migration 040.
 * Usage: npx tsx scripts/data-import/02b-import-statfin-municipality.ts
 */

import { supabase } from './lib/supabaseAdmin'
import { sleep } from './lib/pxwebClient'
import { fetchTableMeta, variableByText, queryTable } from './lib/statfinHelpers'

const METRIC_PRICE = 'keskihinta_aritm_nw'
const METRIC_COUNT = 'lkm_julk20'
const INDEX_METRIC = 'ketj_P_QA_T'
/** 13mx Talotyyppi codes */
const TYPE_MAP: Record<string, 'rivitalo' | 'kerrostalo'> = { '1': 'rivitalo', '3': 'kerrostalo' }
/** How many trailing years of 13mx to import */
const YEARS_BACK = 10

async function importMunicipalityPrices(): Promise<number> {
  console.log('── 13mx: municipality prices ──')
  const meta = await fetchTableMeta('13mx')
  const vYear = variableByText(meta, 'Vuosi')
  const vKunta = variableByText(meta, 'Kunta')
  const vType = variableByText(meta, 'Talotyyppi')
  const vInfo = variableByText(meta, 'Tiedot')

  const years = vYear.values.slice(-YEARS_BACK)
  const nameByCode = new Map<string, string>()
  vKunta.values.forEach((code, i) => nameByCode.set(code, vKunta.valueTexts[i]))

  console.log(`  ${vKunta.values.length} municipalities × ${years.length} years (${years[0]}–${years[years.length - 1]})`)

  const rows = await queryTable('13mx', [
    { code: vYear.code, values: years },
    { code: vKunta.code, values: vKunta.values },
    { code: vType.code, values: Object.keys(TYPE_MAP) },
    { code: vInfo.code, values: [METRIC_PRICE, METRIC_COUNT] },
  ])

  // Pivot metric rows into price + count per (kunta, year, type)
  const cells = new Map<string, { price: number | null; count: number | null }>()
  for (const r of rows) {
    const key = `${r[vKunta.code]}|${r[vYear.code]}|${r[vType.code]}`
    const cell = cells.get(key) ?? { price: null, count: null }
    const value = r.value as number | null
    if (r[vInfo.code] === METRIC_PRICE) cell.price = value
    else if (r[vInfo.code] === METRIC_COUNT) cell.count = value != null ? Math.round(value) : null
    cells.set(key, cell)
  }

  const records: Array<{
    municipality_code: string
    municipality: string
    year: number
    property_type: string
    price_per_sqm: number
    transaction_count: number | null
    source: 'statfin_13mx'
  }> = []

  for (const [key, cell] of cells) {
    if (cell.price == null || cell.price <= 0) continue
    const [code, yearStr, typeCode] = key.split('|')
    records.push({
      municipality_code: code,
      municipality: nameByCode.get(code) ?? code,
      year: parseInt(yearStr, 10),
      property_type: TYPE_MAP[typeCode],
      price_per_sqm: Math.round(cell.price),
      transaction_count: cell.count,
      source: 'statfin_13mx',
    })
  }

  console.log(`  ${records.length} price records with data`)

  let upserted = 0
  for (let i = 0; i < records.length; i += 500) {
    const batch = records.slice(i, i + 500)
    const { error } = await supabase
      .from('municipality_prices')
      .upsert(batch, { onConflict: 'municipality_code,year,property_type,source' })
    if (error) {
      console.error(`  Upsert error at ${i}: ${error.message}`)
      continue
    }
    upserted += batch.length
  }
  console.log(`  Upserted ${upserted} rows`)

  const latestYear = Math.max(...records.map((r) => r.year))
  const latest = records.filter((r) => r.year === latestYear)
  console.log(`  Latest year ${latestYear}: ${new Set(latest.map((r) => r.municipality_code)).size} municipalities`)
  return upserted
}

async function importPriceIndex(): Promise<number> {
  console.log('\n── 13mq: price index (2020=100) ──')
  const meta = await fetchTableMeta('13mq')
  const vYear = variableByText(meta, 'Vuosi')
  const vArea = variableByText(meta, 'Alue')
  const vType = variableByText(meta, 'Talotyyppi')
  const vRooms = variableByText(meta, 'Huoneluku')
  const vInfo = variableByText(meta, 'Tiedot')

  const nameByCode = new Map<string, string>()
  vArea.values.forEach((code, i) => nameByCode.set(code, vArea.valueTexts[i]))

  const rows = await queryTable('13mq', [
    { code: vYear.code, values: vYear.values },
    { code: vArea.code, values: vArea.values },
    { code: vType.code, values: Object.keys(TYPE_MAP) },
    { code: vRooms.code, values: ['00'] },
    { code: vInfo.code, values: [INDEX_METRIC] },
  ])

  const records: Array<{
    area_code: string
    area_name: string
    year: number
    property_type: string
    index_value: number
  }> = []

  for (const r of rows) {
    const value = r.value as number | null
    if (value == null || value <= 0) continue
    const code = String(r[vArea.code])
    records.push({
      area_code: code,
      area_name: nameByCode.get(code) ?? code,
      year: parseInt(String(r[vYear.code]), 10),
      property_type: TYPE_MAP[String(r[vType.code])],
      index_value: value,
    })
  }

  console.log(`  ${records.length} index values (${vArea.values.length} areas × ${vYear.values.length} years × 2 types)`)

  let upserted = 0
  for (let i = 0; i < records.length; i += 500) {
    const batch = records.slice(i, i + 500)
    const { error } = await supabase
      .from('price_index')
      .upsert(batch, { onConflict: 'area_code,year,property_type' })
    if (error) {
      console.error(`  Upsert error at ${i}: ${error.message}`)
      continue
    }
    upserted += batch.length
  }
  console.log(`  Upserted ${upserted} rows`)
  return upserted
}

async function main() {
  console.log('=== StatFin municipality prices + index import ===\n')
  const a = await importMunicipalityPrices()
  await sleep(500)
  const b = await importPriceIndex()
  console.log(`\nDone: ${a} municipality price rows, ${b} index rows.`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
