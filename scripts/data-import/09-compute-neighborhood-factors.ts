/**
 * Script 09: Compute global bias + neighborhood factors from Etuovi listings.
 *
 * Training data = _etuovi_staging rows with area_id, EXCLUDING the 20 %
 * hold-out split (scripts/lib/holdout.ts) so validation stays out-of-sample.
 *
 * Step 1 — global bias per property type → price_calibration bias.<type>
 *   bias = median( asking / (base × age) )
 *   The average asking/estimate ratio used to live inside the neighborhood
 *   factors (avg 1.08–1.19), so every area WITHOUT Etuovi data was under-
 *   estimated by ~10–15 %. Moving it into the base level fixes kehyskunnat.
 *
 * Step 2 — neighborhood factor per (area, type) and (area, 'all')
 *   raw    = avg(asking) / (bias × avg(base × age))
 *   factor = 1 + (raw − 1) × n / (n + SHRINK_N)        (shrunk toward 1.0)
 *   clamped to [0.50, 1.50]; all n ≥ 1 are stored — shrinkage handles
 *   reliability, so lookups no longer filter on sample_count.
 *
 * Base prices come from area_base_prices (13-build-area-base-prices.ts).
 *
 * Usage: npx tsx scripts/data-import/09-compute-neighborhood-factors.ts
 */

import { getPgClient, bulkInsert } from './lib/pgClient'
import { isHoldout } from '../lib/holdout'
import { computeAgeFactor, type PropertyType } from '../../app/lib/priceEstimation'

const ESTIMATION_YEAR = 2026
const FACTOR_MIN = 0.5
const FACTOR_MAX = 1.5
/** Pseudo-count pulling factors toward 1.0: n/(n+5) → 1 listing keeps 17 % of its deviation, 5 keep 50 %, 20 keep 80 % */
const SHRINK_N = 5
/** Bias sanity bounds */
const BIAS_MIN = 0.85
const BIAS_MAX = 1.25

const TYPES: PropertyType[] = ['kerrostalo', 'rivitalo', 'omakotitalo']

interface Listing {
  address: string | null
  city: string | null
  property_type: PropertyType
  construction_year: number | null
  asking_price_per_sqm: number
  area_id: string
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

async function main() {
  console.log('=== Neighborhood Factor Computation ===\n')
  const client = await getPgClient()

  try {
    const allListings = (
      await client.query<Listing>(
        `SELECT address, city, property_type, construction_year,
                asking_price_per_sqm::float AS asking_price_per_sqm, area_id
         FROM _etuovi_staging
         WHERE area_id IS NOT NULL
           AND asking_price_per_sqm IS NOT NULL
           AND property_type IN ('kerrostalo', 'rivitalo', 'omakotitalo')`
      )
    ).rows
    const holdout = allListings.filter((l) => isHoldout(l.address, l.city, l.property_type))
    const listings = allListings.filter((l) => !isHoldout(l.address, l.city, l.property_type))
    console.log(`Listings with area_id: ${allListings.length} (training ${listings.length}, hold-out ${holdout.length} excluded)`)

    const baseRows = (
      await client.query<{ area_id: string; property_type: PropertyType; base_price: number }>(
        `SELECT area_id, property_type, base_price::float AS base_price FROM area_base_prices`
      )
    ).rows
    const base = new Map(baseRows.map((r) => [`${r.area_id}:${r.property_type}`, r.base_price]))
    if (base.size === 0) {
      throw new Error('area_base_prices is empty — run 13-build-area-base-prices.ts first')
    }
    console.log(`Base prices: ${base.size}`)

    // ── Per-listing baseline estimate (base × age, no bias, no nbhd) ──
    type Obs = { listing: Listing; estimate: number }
    const observations: Obs[] = []
    let skippedNoYear = 0
    let skippedNoBase = 0
    for (const l of listings) {
      if (!l.construction_year || l.construction_year === 0) {
        skippedNoYear++
        continue
      }
      const b = base.get(`${l.area_id}:${l.property_type}`)
      if (!b) {
        skippedNoBase++
        continue
      }
      const age = computeAgeFactor(l.construction_year, ESTIMATION_YEAR)
      observations.push({ listing: l, estimate: b * age })
    }
    console.log(`Usable observations: ${observations.length} (skipped: no year ${skippedNoYear}, no base ${skippedNoBase})`)

    // ── Step 1: global bias per type ──
    const bias: Record<PropertyType, number> = { kerrostalo: 1, rivitalo: 1, omakotitalo: 1 }
    console.log('\nGlobal bias (median asking / estimate):')
    for (const t of TYPES) {
      const ratios = observations.filter((o) => o.listing.property_type === t).map((o) => o.listing.asking_price_per_sqm / o.estimate)
      if (ratios.length < 30) {
        console.log(`  ${t.padEnd(11)} n=${ratios.length} — too few, keeping 1.00`)
        continue
      }
      const raw = median(ratios)
      bias[t] = Math.round(Math.min(BIAS_MAX, Math.max(BIAS_MIN, raw)) * 1000) / 1000
      console.log(`  ${t.padEnd(11)} n=${ratios.length} median ${raw.toFixed(3)} → bias ${bias[t].toFixed(3)}`)
    }

    // ── Step 2: per-area factors (relative to bias-corrected estimate) ──
    type Group = { asking: number[]; estimated: number[] }
    const groups = new Map<string, Group>()
    const add = (key: string, asking: number, estimated: number) => {
      const g = groups.get(key) ?? { asking: [], estimated: [] }
      g.asking.push(asking)
      g.estimated.push(estimated)
      groups.set(key, g)
    }
    for (const o of observations) {
      const corrected = o.estimate * bias[o.listing.property_type]
      add(`${o.listing.area_id}:${o.listing.property_type}`, o.listing.asking_price_per_sqm, corrected)
      add(`${o.listing.area_id}:all`, o.listing.asking_price_per_sqm, corrected)
    }

    const factors: Array<{
      area_id: string
      property_type: string
      factor: number
      sample_count: number
      confidence: string
    }> = []
    for (const [key, g] of groups) {
      const [areaId, propertyType] = key.split(':')
      const n = g.asking.length
      const avgAsking = g.asking.reduce((a, b) => a + b, 0) / n
      const avgEst = g.estimated.reduce((a, b) => a + b, 0) / n
      if (avgEst <= 0) continue
      const raw = Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, avgAsking / avgEst))
      const shrunk = 1 + (raw - 1) * (n / (n + SHRINK_N))
      factors.push({
        area_id: areaId,
        property_type: propertyType,
        factor: Math.round(shrunk * 1000) / 1000,
        sample_count: n,
        confidence: n >= 5 ? 'high' : n >= 3 ? 'medium' : 'low',
      })
    }

    // ── Write ──
    console.log(`\nWriting ${factors.length} neighborhood factors + ${TYPES.length} bias constants...`)
    await client.query('BEGIN')
    for (const t of TYPES) {
      await client.query(
        `INSERT INTO price_calibration (key, value, note, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, note = EXCLUDED.note, updated_at = NOW()`,
        [`bias.${t}`, bias[t], `Median asking/estimate on ${observations.filter((o) => o.listing.property_type === t).length} training listings (09-compute-neighborhood-factors, ${new Date().toISOString().slice(0, 10)})`]
      )
    }
    await client.query('DELETE FROM neighborhood_factors')
    await bulkInsert(client, 'neighborhood_factors', ['area_id', 'property_type', 'factor', 'sample_count', 'confidence'], factors)
    await client.query('COMMIT')

    // ── Summary ──
    const typed = factors.filter((f) => f.property_type !== 'all')
    const byConf = { high: 0, medium: 0, low: 0 }
    for (const f of factors) byConf[f.confidence as keyof typeof byConf]++
    const avg = typed.reduce((a, b) => a + b.factor, 0) / Math.max(1, typed.length)
    console.log('\n=== Summary ===')
    console.log(`Factors: ${factors.length} (high ${byConf.high}, medium ${byConf.medium}, low ${byConf.low})`)
    console.log(`Typed factor range ${Math.min(...typed.map((f) => f.factor)).toFixed(2)} – ${Math.max(...typed.map((f) => f.factor)).toFixed(2)}, mean ${avg.toFixed(3)} (should be ≈ 1.00 now that bias is in the base)`)

    const names = new Map<string, string>()
    for (const r of (await client.query<{ id: string; name: string; municipality: string }>('SELECT id, name, municipality FROM areas')).rows) {
      names.set(r.id, `${r.name} (${r.municipality})`)
    }
    const sorted = [...typed].sort((a, b) => b.factor - a.factor)
    console.log('\nTop 10 premium areas:')
    for (const f of sorted.slice(0, 10)) console.log(`  ${names.get(f.area_id)} [${f.property_type}]: ×${f.factor.toFixed(2)} (n=${f.sample_count})`)
    console.log('\nBottom 10 discounted areas:')
    for (const f of sorted.slice(-10).reverse()) console.log(`  ${names.get(f.area_id)} [${f.property_type}]: ×${f.factor.toFixed(2)} (n=${f.sample_count})`)
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
