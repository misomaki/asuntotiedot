/**
 * Hold-out validation of building price estimates against Etuovi asking prices.
 *
 * Uses ONLY the 20 % hold-out split of _etuovi_staging (scripts/lib/holdout.ts)
 * that is never used for neighborhood factors, bias or S-curve calibration,
 * so the numbers are out-of-sample.
 *
 * Modes:
 *   --mode compute  (default) Recompute the estimate in TypeScript from
 *                   area_base_prices + neighborhood_factors + price_calibration
 *                   using estimateBuildingPrice(). When the listing address
 *                   matches a building in our DB, the building's real floor /
 *                   water / size / plot attributes are used; otherwise neutral.
 *                   Lets you evaluate a new calibration WITHOUT recomputing
 *                   270 000 building prices.
 *   --mode stored   Compare asking prices with buildings.estimated_price_per_sqm
 *                   for address-matched listings. This is what users actually
 *                   see — run it BEFORE and AFTER a production recompute.
 *
 * Flags:
 *   --all    Use every listing instead of the hold-out split (diagnostics only;
 *            in-sample for compute mode).
 *   --gate   Exit 1 if the result is worse than reports/latest-<mode>.json
 *            (median |Δ| worse by > 2 pp or |mean Δ| larger by > 3 pp).
 *   --quiet  Skip the per-segment tables on stdout.
 *
 * Output: scripts/validation/reports/holdout-<date>-<mode>.{md,json} and
 *         scripts/validation/reports/latest-<mode>.json
 *
 * Usage: npx tsx scripts/validation/validate-holdout.ts [--mode compute|stored] [--gate]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { getPgClient } from '../data-import/lib/pgClient'
import { isHoldout } from '../lib/holdout'
import {
  estimateBuildingPrice,
  calibrationFromRows,
  inferPropertyType,
  type PropertyType,
  type BasePriceSource,
} from '../../app/lib/priceEstimation'

type Mode = 'compute' | 'stored'

const args = process.argv.slice(2)
const modeArg = args[args.indexOf('--mode') + 1]
const MODE: Mode = args.includes('--mode') && modeArg === 'stored' ? 'stored' : 'compute'
const USE_ALL = args.includes('--all')
const GATE = args.includes('--gate')
const QUIET = args.includes('--quiet')

const REFERENCE_YEAR = 2026
const REPORT_DIR = resolve(__dirname, 'reports')
const GATE_MEDIAN_ABS_PP = 2
const GATE_MEAN_PP = 3
/** Cities with their own Etuovi collection — everything else is "kehyskunta / muu" */
const BIG_CITIES = new Set(['Helsinki', 'Espoo', 'Vantaa', 'Tampere', 'Turku', 'Oulu', 'Jyväskylä', 'Kuopio', 'Lahti'])
const PRICE_BUCKETS: Array<{ label: string; lo: number; hi: number }> = [
  { label: '< 2 000', lo: 0, hi: 2000 },
  { label: '2 000 – 3 000', lo: 2000, hi: 3000 },
  { label: '3 000 – 4 000', lo: 3000, hi: 4000 },
  { label: '4 000 – 6 000', lo: 4000, hi: 6000 },
  { label: '≥ 6 000', lo: 6000, hi: Infinity },
]

interface ListingRow {
  id: string
  address: string | null
  city: string | null
  property_type: PropertyType
  construction_year: number | null
  asking: number
  area_id: string
  area_code: string
  municipality: string
}

interface BuildingRow {
  id: string
  area_id: string
  addr: string
  construction_year: number | null
  floor_count: number | null
  apartment_count: number | null
  footprint_area_sqm: number | null
  total_area_sqm: number | null
  min_distance_to_water_m: number | null
  is_leased_plot: boolean | null
  estimated_price_per_sqm: number | null
  building_type: string | null
  ryhti_main_purpose: string | null
}

interface Evaluated {
  listing: ListingRow
  estimate: number
  deltaPct: number
  baseSource: BasePriceSource | 'stored' | null
  matchedBuilding: boolean
  segment: 'suurkaupunki' | 'kehyskunta/muu'
}

interface Metrics {
  n: number
  meanDelta: number
  medianDelta: number
  medianAbsDelta: number
  within15: number
  stdDev: number
}

function median(values: number[]): number {
  if (values.length === 0) return NaN
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

function metrics(rows: Evaluated[]): Metrics {
  const d = rows.map((r) => r.deltaPct)
  const n = d.length
  if (n === 0) return { n: 0, meanDelta: NaN, medianDelta: NaN, medianAbsDelta: NaN, within15: NaN, stdDev: NaN }
  const mean = d.reduce((a, b) => a + b, 0) / n
  const variance = d.reduce((a, b) => a + (b - mean) ** 2, 0) / n
  return {
    n,
    meanDelta: mean,
    medianDelta: median(d),
    medianAbsDelta: median(d.map(Math.abs)),
    within15: (d.filter((x) => Math.abs(x) <= 15).length / n) * 100,
    stdDev: Math.sqrt(variance),
  }
}

function fmt(v: number, digits = 1): string {
  return Number.isFinite(v) ? v.toFixed(digits) : '—'
}

function metricsRow(label: string, m: Metrics): string {
  return `| ${label} | ${m.n} | ${fmt(m.meanDelta)}% | ${fmt(m.medianDelta)}% | ${fmt(m.medianAbsDelta)}% | ${fmt(m.within15, 0)}% | ${fmt(m.stdDev)} |`
}

const METRICS_HEADER = `| Segment | n | Mean Δ% | Median Δ% | Median \\|Δ%\\| | ±15 % | Std |\n|---|---|---|---|---|---|---|`

/** 'Mestarintie 19 C' → 'mestarintie 19' (building address granularity) */
function normalizeAddress(address: string | null): string | null {
  if (!address) return null
  const m = address.trim().toLowerCase().match(/^(.+?\s+\d+)/)
  return m ? m[1].replace(/\s+/g, ' ') : null
}

async function main() {
  console.log(`=== Hold-out validation — mode: ${MODE}${USE_ALL ? ' (ALL listings)' : ''} ===\n`)
  const client = await getPgClient()
  try {
    // ── Listings ──
    const all = (
      await client.query<ListingRow>(
        `SELECT s.id, s.address, s.city, s.property_type, s.construction_year,
                s.asking_price_per_sqm::float AS asking, s.area_id,
                a.area_code, a.municipality
         FROM _etuovi_staging s
         JOIN areas a ON a.id = s.area_id
         WHERE s.asking_price_per_sqm IS NOT NULL
           AND s.property_type IN ('kerrostalo', 'rivitalo', 'omakotitalo')`
      )
    ).rows
    const listings = USE_ALL ? all : all.filter((l) => isHoldout(l.address, l.city, l.property_type))
    console.log(`Listings: ${all.length} total, ${listings.length} evaluated`)

    // ── Buildings in the listing areas (for address matching) ──
    const areaIds = [...new Set(listings.map((l) => l.area_id))]
    const buildings = (
      await client.query<BuildingRow>(
        `SELECT id, area_id, lower(regexp_replace(address, '\\s+', ' ', 'g')) AS addr,
                construction_year, floor_count, apartment_count,
                footprint_area_sqm::float AS footprint_area_sqm, total_area_sqm::float AS total_area_sqm,
                min_distance_to_water_m::float AS min_distance_to_water_m, is_leased_plot,
                estimated_price_per_sqm::float AS estimated_price_per_sqm, building_type, ryhti_main_purpose
         FROM buildings
         WHERE area_id = ANY($1) AND address IS NOT NULL AND is_residential = true`,
        [areaIds]
      )
    ).rows
    const buildingsByAddr = new Map<string, BuildingRow[]>()
    for (const b of buildings) {
      const key = `${b.area_id}|${b.addr}`
      const list = buildingsByAddr.get(key) ?? []
      list.push(b)
      buildingsByAddr.set(key, list)
    }
    console.log(`Buildings loaded for address matching: ${buildings.length} in ${areaIds.length} areas`)

    const matchBuilding = (l: ListingRow): BuildingRow | null => {
      const addr = normalizeAddress(l.address)
      if (!addr) return null
      const cands = buildingsByAddr.get(`${l.area_id}|${addr}`)
      if (!cands?.length) return null
      const sameType = cands.find(
        (b) => inferPropertyType(b.building_type, b.floor_count, b.ryhti_main_purpose, b.apartment_count, b.footprint_area_sqm) === l.property_type
      )
      return sameType ?? cands[0]
    }

    // ── Model inputs (compute mode only — stored mode must work before migration 040) ──
    type BaseRow = { area_id: string; property_type: PropertyType; base_price: number; source: BasePriceSource; n_own: number }
    let calibration = calibrationFromRows([])
    const base = new Map<string, BaseRow>()
    const nf = new Map<string, number>()
    if (MODE === 'compute') {
      calibration = calibrationFromRows(
        (await client.query<{ key: string; value: string }>('SELECT key, value FROM price_calibration')).rows
      )
      for (const r of (await client.query<BaseRow>(
        'SELECT area_id, property_type, base_price::float AS base_price, source, n_own::float AS n_own FROM area_base_prices'
      )).rows) {
        base.set(`${r.area_id}:${r.property_type}`, r)
      }
      for (const r of (await client.query<{ area_id: string; property_type: string; factor: number }>(
        'SELECT area_id, property_type, factor::float AS factor FROM neighborhood_factors WHERE sample_count >= 1'
      )).rows) {
        nf.set(`${r.area_id}:${r.property_type}`, r.factor)
      }
      if (base.size === 0) throw new Error('area_base_prices is empty — run 13-build-area-base-prices.ts first')
    }

    // ── Evaluate ──
    const evaluated: Evaluated[] = []
    let noBase = 0
    let noStored = 0
    let noYear = 0
    for (const l of listings) {
      const b = matchBuilding(l)
      const segment: Evaluated['segment'] = BIG_CITIES.has(l.municipality) ? 'suurkaupunki' : 'kehyskunta/muu'
      if (MODE === 'stored') {
        if (!b || b.estimated_price_per_sqm == null) {
          noStored++
          continue
        }
        const est = b.estimated_price_per_sqm
        evaluated.push({ listing: l, estimate: est, deltaPct: ((est - l.asking) / l.asking) * 100, baseSource: 'stored', matchedBuilding: true, segment })
        continue
      }
      if (!l.construction_year || l.construction_year === 0) {
        noYear++
        continue
      }
      const bp = base.get(`${l.area_id}:${l.property_type}`)
      if (!bp) {
        noBase++
        continue
      }
      const result = estimateBuildingPrice({
        basePrice: bp.base_price,
        baseSource: bp.source,
        calibration,
        constructionYear: l.construction_year,
        distanceToWaterM: b?.min_distance_to_water_m ?? null,
        floorCount: b?.floor_count ?? null,
        referenceYear: REFERENCE_YEAR,
        propertyType: l.property_type,
        neighborhoodFactor: nf.get(`${l.area_id}:${l.property_type}`) ?? nf.get(`${l.area_id}:all`) ?? 1.0,
        apartmentCount: b?.apartment_count ?? null,
        footprintAreaSqm: b?.footprint_area_sqm ?? null,
        totalAreaSqm: b?.total_area_sqm ?? null,
        isLeasedPlot: b?.is_leased_plot ?? null,
      })
      const est = result.estimatedPricePerSqm
      evaluated.push({ listing: l, estimate: est, deltaPct: ((est - l.asking) / l.asking) * 100, baseSource: bp.source, matchedBuilding: !!b, segment })
    }

    console.log(`Evaluated: ${evaluated.length}` + (MODE === 'stored' ? ` (no address-matched stored price: ${noStored})` : ` (no base price: ${noBase}, no year: ${noYear}, address-matched: ${evaluated.filter((e) => e.matchedBuilding).length})`))

    // ── Metrics ──
    const overall = metrics(evaluated)
    const group = <K extends string>(key: (e: Evaluated) => K): Array<[K, Metrics]> => {
      const m = new Map<K, Evaluated[]>()
      for (const e of evaluated) {
        const k = key(e)
        const list = m.get(k) ?? []
        list.push(e)
        m.set(k, list)
      }
      return [...m.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, v]) => [k, metrics(v)])
    }
    const byType = group((e) => e.listing.property_type)
    const byCity = group((e) => e.listing.municipality)
    const bySegment = group((e) => e.segment)
    const bySource = group((e) => e.baseSource ?? 'none')
    const byBucket = PRICE_BUCKETS.map((b) => [b.label, metrics(evaluated.filter((e) => e.listing.asking >= b.lo && e.listing.asking < b.hi))] as [string, Metrics])
    const byMatch = group((e) => (e.matchedBuilding ? 'address-matched' : 'neutral factors'))

    const date = new Date().toISOString().slice(0, 10)
    let md = `# Hold-out validation — ${date} — mode: ${MODE}${USE_ALL ? ' (all listings)' : ''}\n\n`
    md += `> Positive Δ% = our estimate is HIGHER than the asking price. Hold-out = 20 % of Etuovi listings never used for calibration.\n\n`
    md += `## Overall\n\n${METRICS_HEADER}\n${metricsRow('All', overall)}\n\n`
    const section = (title: string, rows: Array<[string, Metrics]>) =>
      `## ${title}\n\n${METRICS_HEADER}\n${rows.map(([k, m]) => metricsRow(k, m)).join('\n')}\n\n`
    md += section('By property type', byType)
    md += section('By segment', bySegment)
    md += section('By asking-price bucket (€/m²)', byBucket)
    md += section('By base price source', bySource)
    md += section('By building match', byMatch)
    md += section('By municipality (top 25)', byCity.slice(0, 25))

    // Worst 25 for debugging
    const worst = [...evaluated].sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct)).slice(0, 25)
    md += `## Largest errors\n\n| Address | Municipality | Type | Year | Asking | Ours | Δ% | Source |\n|---|---|---|---|---|---|---|---|\n`
    for (const w of worst) {
      md += `| ${w.listing.address ?? '—'} | ${w.listing.municipality} ${w.listing.area_code} | ${w.listing.property_type} | ${w.listing.construction_year ?? '—'} | ${Math.round(w.listing.asking)} | ${Math.round(w.estimate)} | ${w.deltaPct > 0 ? '+' : ''}${w.deltaPct.toFixed(0)}% | ${w.baseSource} |\n`
    }
    md += `\n*Generated by scripts/validation/validate-holdout.ts*\n`

    if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true })
    const suffix = USE_ALL ? `${MODE}-all` : MODE
    const mdPath = resolve(REPORT_DIR, `holdout-${date}-${suffix}.md`)
    const jsonPath = resolve(REPORT_DIR, `holdout-${date}-${suffix}.json`)
    const latestPath = resolve(REPORT_DIR, `latest-${suffix}.json`)
    const payload = {
      date,
      mode: MODE,
      all: USE_ALL,
      overall,
      byType: Object.fromEntries(byType),
      bySegment: Object.fromEntries(bySegment),
      byBucket: Object.fromEntries(byBucket),
      bySource: Object.fromEntries(bySource),
    }
    writeFileSync(mdPath, md)
    writeFileSync(jsonPath, JSON.stringify(payload, null, 2))

    // ── Compare with previous ──
    let previous: typeof payload | null = null
    if (existsSync(latestPath)) {
      try {
        previous = JSON.parse(readFileSync(latestPath, 'utf-8'))
      } catch {
        previous = null
      }
    }
    writeFileSync(latestPath, JSON.stringify(payload, null, 2))

    if (!QUIET) {
      console.log(`\n${METRICS_HEADER}`)
      console.log(metricsRow('All', overall))
      for (const [k, m] of byType) console.log(metricsRow(k, m))
      for (const [k, m] of bySegment) console.log(metricsRow(k, m))
      for (const [k, m] of byBucket) console.log(metricsRow(k, m))
      for (const [k, m] of bySource) console.log(metricsRow(k, m))
    }
    console.log(`\nReport: ${mdPath}`)

    if (previous) {
      const dMedAbs = overall.medianAbsDelta - previous.overall.medianAbsDelta
      const dMean = Math.abs(overall.meanDelta) - Math.abs(previous.overall.meanDelta)
      console.log(`\nvs previous (${previous.date}): median |Δ| ${fmt(previous.overall.medianAbsDelta)}% → ${fmt(overall.medianAbsDelta)}% (${dMedAbs >= 0 ? '+' : ''}${fmt(dMedAbs)} pp), mean Δ ${fmt(previous.overall.meanDelta)}% → ${fmt(overall.meanDelta)}%`)
      if (GATE && (dMedAbs > GATE_MEDIAN_ABS_PP || dMean > GATE_MEAN_PP)) {
        console.error(`\nGATE FAILED: accuracy regressed beyond thresholds (median |Δ| +${GATE_MEDIAN_ABS_PP} pp / |mean Δ| +${GATE_MEAN_PP} pp).`)
        process.exitCode = 1
      } else if (GATE) {
        console.log('Gate passed.')
      }
    } else if (GATE) {
      console.log('\nNo previous report to gate against — baseline recorded.')
    }
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
