/**
 * SQL ↔ TypeScript parity check for the price algorithm.
 *
 * Takes a random sample of residential buildings, computes the price with
 * the database function compute_building_price() (what 05-compute writes)
 * and with estimateBuildingPrice() (what the BuildingPanel breakdown and the
 * validation scripts use), and reports any mismatch larger than 1 €/m².
 *
 * Both paths read the same tables (area_base_prices, neighborhood_factors,
 * price_calibration), so a mismatch means the factor code has drifted
 * between app/lib/priceEstimation.ts and the latest migration.
 *
 * Usage: npx tsx scripts/validation/check-sql-ts-parity.ts [--n 500] [--year 2026]
 */

import { getPgClient } from '../data-import/lib/pgClient'
import {
  estimateBuildingPrice,
  calibrationFromRows,
  inferPropertyType,
  type BasePriceSource,
  type PropertyType,
} from '../../app/lib/priceEstimation'

const args = process.argv.slice(2)
const N = args.includes('--n') ? parseInt(args[args.indexOf('--n') + 1], 10) : 300
const YEAR = args.includes('--year') ? parseInt(args[args.indexOf('--year') + 1], 10) : 2026

interface Row {
  id: string
  area_id: string
  construction_year: number | null
  min_distance_to_water_m: number | null
  floor_count: number | null
  building_type: string | null
  ryhti_main_purpose: string | null
  apartment_count: number | null
  footprint_area_sqm: number | null
  total_area_sqm: number | null
  is_leased_plot: boolean | null
  sql_price: number | null
}

async function main() {
  const client = await getPgClient()
  try {
    const rows = (
      await client.query<Row>(
        `SELECT b.id, b.area_id, b.construction_year,
                b.min_distance_to_water_m::float AS min_distance_to_water_m,
                b.floor_count, b.building_type, b.ryhti_main_purpose, b.apartment_count,
                b.footprint_area_sqm::float AS footprint_area_sqm, b.total_area_sqm::float AS total_area_sqm,
                b.is_leased_plot,
                compute_building_price(
                  b.area_id, b.construction_year, b.min_distance_to_water_m, b.floor_count,
                  b.building_type, $1, b.ryhti_main_purpose, b.apartment_count,
                  b.footprint_area_sqm, b.total_area_sqm, b.is_leased_plot
                )::float AS sql_price
         FROM buildings b TABLESAMPLE SYSTEM (1)
         WHERE b.is_residential = true AND b.area_id IS NOT NULL
         LIMIT $2`,
        [YEAR, N]
      )
    ).rows

    const calibration = calibrationFromRows(
      (await client.query<{ key: string; value: string }>('SELECT key, value FROM price_calibration')).rows
    )
    const areaIds = [...new Set(rows.map((r) => r.area_id))]
    const base = new Map<string, { base_price: number; source: BasePriceSource }>()
    for (const r of (await client.query<{ area_id: string; property_type: PropertyType; base_price: number; source: BasePriceSource }>(
      'SELECT area_id, property_type, base_price::float AS base_price, source FROM area_base_prices WHERE area_id = ANY($1)', [areaIds]
    )).rows) base.set(`${r.area_id}:${r.property_type}`, r)
    const nf = new Map<string, number>()
    for (const r of (await client.query<{ area_id: string; property_type: string; factor: number }>(
      'SELECT area_id, property_type, factor::float AS factor FROM neighborhood_factors WHERE area_id = ANY($1) AND sample_count >= 1', [areaIds]
    )).rows) nf.set(`${r.area_id}:${r.property_type}`, r.factor)

    let compared = 0
    let mismatches = 0
    let bothNull = 0
    const examples: string[] = []
    for (const r of rows) {
      const pt = inferPropertyType(r.building_type, r.floor_count, r.ryhti_main_purpose, r.apartment_count, r.footprint_area_sqm)
      const bp = base.get(`${r.area_id}:${pt}`)
      if (!bp && r.sql_price == null) {
        bothNull++
        continue
      }
      if (!bp || r.sql_price == null) {
        mismatches++
        examples.push(`${r.id}: base ${bp ? 'present' : 'missing'} but SQL ${r.sql_price}`)
        continue
      }
      const ts = estimateBuildingPrice({
        basePrice: bp.base_price,
        baseSource: bp.source,
        calibration,
        constructionYear: r.construction_year,
        distanceToWaterM: r.min_distance_to_water_m,
        floorCount: r.floor_count,
        referenceYear: YEAR,
        propertyType: pt,
        neighborhoodFactor: nf.get(`${r.area_id}:${pt}`) ?? nf.get(`${r.area_id}:all`) ?? 1.0,
        apartmentCount: r.apartment_count,
        footprintAreaSqm: r.footprint_area_sqm,
        totalAreaSqm: r.total_area_sqm,
        isLeasedPlot: r.is_leased_plot,
      }).estimatedPricePerSqm
      compared++
      if (Math.abs(ts - r.sql_price) > 1) {
        mismatches++
        if (examples.length < 15) {
          examples.push(`${r.id} (${pt}, ${r.construction_year ?? '—'}, floors ${r.floor_count ?? '—'}, apts ${r.apartment_count ?? '—'}, water ${r.min_distance_to_water_m ?? '—'}): SQL ${r.sql_price} vs TS ${ts}`)
        }
      }
    }

    console.log(`Sampled ${rows.length} buildings, compared ${compared}, both-null ${bothNull}, mismatches ${mismatches}`)
    for (const e of examples) console.log('  ' + e)
    if (mismatches > 0) process.exitCode = 1
    else console.log('SQL and TypeScript agree.')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
