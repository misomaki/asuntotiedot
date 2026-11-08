/**
 * Calibrate the price-range correction (S-curve) from training data.
 *
 * For every non-hold-out Etuovi listing with a direct ('area' / 'shrunk')
 * base price we compute
 *   raw      = base × bias × age × neighborhood(dampened)
 *   residual = asking / raw
 * and take the median residual per raw-price bucket. The medians become the
 * S-curve knots in price_calibration (scurve.1500 … scurve.8000), clamped to
 * [0.90, 1.10]. Buckets with fewer than MIN_N listings keep their current value.
 *
 * Fallback-source listings are excluded: the S-curve is skipped for them
 * below 2 000 €/m² anyway and they would only add noise.
 *
 * Usage:
 *   npx tsx scripts/validation/calibrate-scurve.ts          # print proposal
 *   npx tsx scripts/validation/calibrate-scurve.ts --apply  # write to price_calibration
 */

import { getPgClient } from '../data-import/lib/pgClient'
import { isHoldout } from '../lib/holdout'
import {
  computeAgeFactor,
  dampenPremium,
  calibrationFromRows,
  type PropertyType,
  type BasePriceSource,
} from '../../app/lib/priceEstimation'

const APPLY = process.argv.includes('--apply')
const ESTIMATION_YEAR = 2026
const MIN_N = 15
const KNOT_MIN = 0.9
const KNOT_MAX = 1.1

/** Raw-price buckets → knot they calibrate */
const BUCKETS: Array<{ key: string; label: string; lo: number; hi: number }> = [
  { key: 'scurve.1500', label: '< 1 750', lo: 0, hi: 1750 },
  { key: 'scurve.2000', label: '1 750 – 3 000', lo: 1750, hi: 3000 },
  { key: 'scurve.4000', label: '3 000 – 5 000', lo: 3000, hi: 5000 },
  { key: 'scurve.6000', label: '5 000 – 7 000', lo: 5000, hi: 7000 },
  { key: 'scurve.8000', label: '≥ 7 000', lo: 7000, hi: Infinity },
]

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

async function main() {
  console.log(`=== S-curve calibration ${APPLY ? '(APPLY)' : '(proposal only)'} ===\n`)
  const client = await getPgClient()
  try {
    const calibRows = (await client.query<{ key: string; value: string }>('SELECT key, value FROM price_calibration')).rows
    const calibration = calibrationFromRows(calibRows)
    const current = new Map(calibRows.map((r) => [r.key, Number(r.value)]))

    const listings = (
      await client.query<{
        address: string | null
        city: string | null
        property_type: PropertyType
        construction_year: number | null
        asking: number
        area_id: string
        base_price: number | null
        source: BasePriceSource | null
        nf_exact: number | null
        nf_all: number | null
      }>(
        `SELECT s.address, s.city, s.property_type, s.construction_year,
                s.asking_price_per_sqm::float AS asking, s.area_id,
                b.base_price::float AS base_price, b.source,
                (SELECT factor::float FROM neighborhood_factors nf WHERE nf.area_id = s.area_id AND nf.property_type = s.property_type) AS nf_exact,
                (SELECT factor::float FROM neighborhood_factors nf WHERE nf.area_id = s.area_id AND nf.property_type = 'all') AS nf_all
         FROM _etuovi_staging s
         LEFT JOIN area_base_prices b ON b.area_id = s.area_id AND b.property_type = s.property_type
         WHERE s.area_id IS NOT NULL
           AND s.asking_price_per_sqm IS NOT NULL
           AND s.construction_year IS NOT NULL AND s.construction_year > 0
           AND s.property_type IN ('kerrostalo', 'rivitalo', 'omakotitalo')`
      )
    ).rows

    const residuals: Array<{ raw: number; r: number }> = []
    let excludedHoldout = 0
    let excludedFallback = 0
    for (const l of listings) {
      if (isHoldout(l.address, l.city, l.property_type)) {
        excludedHoldout++
        continue
      }
      if (l.base_price == null || l.source == null) continue
      if (l.source !== 'area' && l.source !== 'shrunk') {
        excludedFallback++
        continue
      }
      const age = computeAgeFactor(l.construction_year, ESTIMATION_YEAR)
      const nbhd = dampenPremium(l.nf_exact ?? l.nf_all ?? 1.0, age)
      const raw = l.base_price * calibration.bias[l.property_type] * age * nbhd
      residuals.push({ raw, r: l.asking / raw })
    }
    console.log(`Training residuals: ${residuals.length} (excluded hold-out ${excludedHoldout}, fallback-source ${excludedFallback})\n`)

    console.log('| Raw €/m² bucket  |    n | median residual | current | proposed |')
    console.log('|------------------|------|-----------------|---------|----------|')
    const proposal = new Map<string, number>()
    for (const b of BUCKETS) {
      const rs = residuals.filter((x) => x.raw >= b.lo && x.raw < b.hi).map((x) => x.r)
      const cur = current.get(b.key) ?? 1
      let proposed = cur
      let med: number | null = null
      if (rs.length >= MIN_N) {
        med = median(rs)
        proposed = Math.round(Math.min(KNOT_MAX, Math.max(KNOT_MIN, med)) * 1000) / 1000
      }
      proposal.set(b.key, proposed)
      console.log(`| ${b.label.padEnd(16)} | ${String(rs.length).padStart(4)} | ${(med != null ? med.toFixed(3) : '—').padStart(15)} | ${cur.toFixed(3).padStart(7)} | ${proposed.toFixed(3).padStart(8)} |`)
    }

    if (!APPLY) {
      console.log('\nRun with --apply to write these knots to price_calibration.')
      return
    }

    await client.query('BEGIN')
    for (const [key, value] of proposal) {
      await client.query(
        `INSERT INTO price_calibration (key, value, note, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, note = EXCLUDED.note, updated_at = NOW()`,
        [key, value, `Median residual on ${residuals.length} training listings (calibrate-scurve, ${new Date().toISOString().slice(0, 10)})`]
      )
    }
    await client.query('COMMIT')
    console.log('\nApplied. Remember: the TS DEFAULT_CALIBRATION is only a fallback — the provider reads price_calibration at runtime.')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
