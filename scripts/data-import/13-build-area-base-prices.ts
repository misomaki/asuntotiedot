/**
 * Script 13: Build area_base_prices — the single source of truth for
 * €/m² base prices per postal code + property type.
 *
 * Replaces the "latest year, exact match → nearby IDW → municipality median"
 * cascade that lived in three places (SQL, TS provider, validation) with one
 * shrinkage-pooled estimate:
 *
 *   p_own    = Σ w_y · p_y · deflate_y / Σ w_y        (3 latest years, w_y = n_y · 0.6^(L−y))
 *   p_parent = nearby IDW (Σ n ≥ 10)  →  municipality (StatFin 13mx / KHR kunta)  →  type cascade
 *   base     = (n_own · p_own + k · p_parent) / (n_own + k)
 *
 * so an area with 80 transactions keeps its own price while an area with 4
 * transactions leans two thirds on its neighbours. Prior weights k live in
 * price_calibration (shrink.k.<type>): KT 10, RT 8, OKT 6.
 *
 * Reads : price_estimates, municipality_prices, price_index, areas, price_calibration
 * Writes: area_base_prices (full rebuild)
 *
 * Usage:
 *   npx tsx scripts/data-import/13-build-area-base-prices.ts            # build + write
 *   npx tsx scripts/data-import/13-build-area-base-prices.ts --dry-run  # report only
 */

import { getPgClient, bulkInsert } from './lib/pgClient'
import { fetchKuntaToMaakunta } from './lib/statfinHelpers'
import type { BasePriceSource, PropertyType } from '../../app/lib/priceEstimation'

const DRY_RUN = process.argv.includes('--dry-run')

/** Year decay for pooling: weight = n × DECAY^(L − year) */
const YEAR_DECAY = 0.6
/** How many years back from L to pool (L, L−1, L−2) */
const YEARS_BACK = 2
/** L = latest year with at least this many areas reporting (excludes partial current year) */
const MIN_AREAS_FOR_LATEST_YEAR = 20
/** Nearby parent: search radius, max neighbours, min distance, min pooled n */
const NEARBY_RADIUS_KM = 15
const NEARBY_MAX = 8
const NEARBY_MIN_DISTANCE_KM = 0.5
const NEARBY_MIN_N = 10
/** Municipality median fallback: min n_own per area and min areas */
const MUNI_MEDIAN_MIN_N = 5
const MUNI_MEDIAN_MIN_AREAS = 2
/** Own data needed to stand alone when no parent exists */
const STANDALONE_MIN_N = 3
/** Type cascades (synced with OKT_FALLBACK + RT fallback in priceEstimation.ts / migration 040) */
const CASCADE: Record<PropertyType, Array<{ from: PropertyType; factor: number }>> = {
  kerrostalo: [],
  rivitalo: [{ from: 'kerrostalo', factor: 0.85 }],
  omakotitalo: [
    { from: 'rivitalo', factor: 1.0 },
    { from: 'kerrostalo', factor: 0.75 },
  ],
}
/** OKT guard relative to the same area's RT base */
const OKT_RT_RATIO_MIN = 0.75
const OKT_RT_RATIO_MAX = 1.4
/** Sanity bounds */
const MIN_BASE = 300
const MAX_BASE = 15000

const TYPES: PropertyType[] = ['kerrostalo', 'rivitalo', 'omakotitalo']

interface Area {
  id: string
  area_code: string
  name: string
  municipality: string
  municipality_code: string | null
  lng: number | null
  lat: number | null
}

interface PriceRow {
  area_id: string
  property_type: PropertyType
  year: number
  price: number
  n: number
}

interface OwnEstimate {
  p: number
  n: number
  years: number[]
  rows: Array<{ year: number; price: number; n: number; weight: number; deflate: number }>
}

interface Result {
  area_id: string
  property_type: PropertyType
  base_price: number
  source: BasePriceSource
  n_own: number
  p_own: number | null
  n_effective: number
  p_parent: number | null
  parent_source: string | null
  years_used: number[]
  details: Record<string, unknown>
}

function haversineKm(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

async function main() {
  console.log(`=== Build area_base_prices ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`)
  const client = await getPgClient()

  try {
    // ── Load inputs ─────────────────────────────────────────────────
    const areas = (
      await client.query<Area>(
        `SELECT id, area_code, name, municipality, municipality_code,
                ST_X(centroid) AS lng, ST_Y(centroid) AS lat
         FROM areas`
      )
    ).rows
    const areaById = new Map(areas.map((a) => [a.id, a]))
    console.log(`Areas: ${areas.length}`)

    // DISTINCT ON: UNIQUE(area_id, year, quarter, property_type) did not stop
    // duplicates while quarter IS NULL (fixed in migration 041), so older
    // imports left duplicate yearly rows. Keep the most recently updated one.
    const priceRows = (
      await client.query<PriceRow>(
        `SELECT DISTINCT ON (area_id, property_type, year)
                area_id, property_type, year,
                COALESCE(price_per_sqm_median, price_per_sqm_avg)::float AS price,
                COALESCE(transaction_count, 0)::int AS n
         FROM price_estimates
         WHERE price_per_sqm_avg IS NOT NULL AND quarter IS NULL
         ORDER BY area_id, property_type, year, updated_at DESC NULLS LAST`
      )
    ).rows
    console.log(`price_estimates rows: ${priceRows.length}`)

    const calib = new Map<string, number>()
    for (const r of (await client.query<{ key: string; value: string }>('SELECT key, value FROM price_calibration')).rows) {
      calib.set(r.key, Number(r.value))
    }
    const kFor = (t: PropertyType) => calib.get(`shrink.k.${t}`) ?? { kerrostalo: 10, rivitalo: 8, omakotitalo: 6 }[t]

    const muniPrices = (
      await client.query<{ municipality_code: string; property_type: PropertyType; year: number; price: number; n: number | null; source: string }>(
        `SELECT municipality_code, property_type, year, price_per_sqm::float AS price, transaction_count AS n, source
         FROM municipality_prices`
      )
    ).rows
    console.log(`municipality_prices rows: ${muniPrices.length}`)

    const indexRows = (
      await client.query<{ area_code: string; property_type: 'kerrostalo' | 'rivitalo'; year: number; index_value: number }>(
        `SELECT area_code, property_type, year, index_value::float AS index_value FROM price_index`
      )
    ).rows
    const indexMap = new Map<string, number>() // `${code}|${type}|${year}`
    const indexCodes = new Set<string>()
    for (const r of indexRows) {
      indexMap.set(`${r.area_code}|${r.property_type}|${r.year}`, r.index_value)
      indexCodes.add(r.area_code)
    }
    console.log(`price_index rows: ${indexRows.length} (${indexCodes.size} areas)`)

    const kuntaToMaakunta = indexRows.length > 0 ? await fetchKuntaToMaakunta() : new Map<string, string>()
    console.log(`kunta→maakunta mappings: ${kuntaToMaakunta.size}`)

    // ── Helpers ──────────────────────────────────────────────────────
    /** Index series code for a municipality: own code → maakunta → national */
    function indexCodeFor(municipalityCode: string | null): string {
      if (municipalityCode && indexCodes.has(municipalityCode)) return municipalityCode
      if (municipalityCode === '235' && indexCodes.has('049')) return '049' // Kauniainen → Espoo-Kauniainen
      const mk = municipalityCode ? kuntaToMaakunta.get(municipalityCode) : undefined
      if (mk && indexCodes.has(mk)) return mk
      return 'ksu'
    }

    /** Deflation multiplier bringing a `year` observation to year `L` */
    function deflate(municipalityCode: string | null, type: PropertyType, year: number, L: number): number {
      if (year >= L) return 1.0
      const idxType = type === 'kerrostalo' ? 'kerrostalo' : 'rivitalo'
      const code = indexCodeFor(municipalityCode)
      const iL = indexMap.get(`${code}|${idxType}|${L}`) ?? indexMap.get(`ksu|${idxType}|${L}`)
      const iY = indexMap.get(`${code}|${idxType}|${year}`) ?? indexMap.get(`ksu|${idxType}|${year}`)
      if (!iL || !iY) return 1.0
      return iL / iY
    }

    // Group price rows by type → area
    const rowsByTypeArea = new Map<PropertyType, Map<string, PriceRow[]>>()
    for (const t of TYPES) rowsByTypeArea.set(t, new Map())
    for (const r of priceRows) {
      const byArea = rowsByTypeArea.get(r.property_type)
      if (!byArea) continue
      const list = byArea.get(r.area_id) ?? []
      list.push(r)
      byArea.set(r.area_id, list)
    }

    /** Latest "full" year per type: the newest year reported by ≥ MIN_AREAS areas */
    function latestYearFor(type: PropertyType): number {
      const counts = new Map<number, number>()
      for (const r of priceRows) {
        if (r.property_type !== type || r.n <= 0) continue
        counts.set(r.year, (counts.get(r.year) ?? 0) + 1)
      }
      const lastFullYear = new Date().getFullYear() - 1 // current calendar year is always partial
      const years = [...counts.entries()]
        .filter(([y, c]) => c >= MIN_AREAS_FOR_LATEST_YEAR && y <= lastFullYear)
        .map(([y]) => y)
      return years.length ? Math.max(...years) : lastFullYear
    }

    const results: Result[] = []
    const baseByTypeArea = new Map<PropertyType, Map<string, Result>>()
    const previousLatest = new Map<string, number>() // `${area}|${type}` → old "latest year" price

    for (const t of TYPES) {
      const L = latestYearFor(t)
      const k = kFor(t)
      const byArea = rowsByTypeArea.get(t)!
      console.log(`\n── ${t}: L=${L}, k=${k} ──`)

      // 1. Own pooled estimates
      const own = new Map<string, OwnEstimate>()
      for (const [areaId, rows] of byArea) {
        const area = areaById.get(areaId)
        if (!area) continue
        const latestRow = [...rows].sort((a, b) => b.year - a.year)[0]
        previousLatest.set(`${areaId}|${t}`, latestRow.price)

        const used = rows.filter((r) => r.n > 0 && r.year >= L - YEARS_BACK)
        if (used.length === 0) continue
        let sw = 0
        let swp = 0
        const detail: OwnEstimate['rows'] = []
        for (const r of used) {
          const effYear = Math.min(r.year, L) // partial current year counts as L
          const w = r.n * Math.pow(YEAR_DECAY, L - effYear)
          const d = deflate(area.municipality_code, t, r.year, L)
          sw += w
          swp += w * r.price * d
          detail.push({ year: r.year, price: r.price, n: r.n, weight: round2(w), deflate: round2(d) })
        }
        if (sw <= 0) continue
        own.set(areaId, { p: swp / sw, n: sw, years: used.map((r) => r.year).sort(), rows: detail })
      }
      console.log(`  areas with own data: ${own.size}`)

      // 2. Municipality-level parents
      const muniParent = new Map<string, { price: number; source: string; n: number }>() // by municipality_code
      const muniRowsForType = muniPrices.filter((m) => m.property_type === t)
      const byMuni = new Map<string, typeof muniRowsForType>()
      for (const m of muniRowsForType) {
        const list = byMuni.get(m.municipality_code) ?? []
        list.push(m)
        byMuni.set(m.municipality_code, list)
      }
      for (const [code, list] of byMuni) {
        // Pool the 3 latest years, n-weighted, deflated to L
        const latest = Math.max(...list.map((m) => m.year))
        const pool = list.filter((m) => m.year >= latest - YEARS_BACK && m.year <= L + 1)
        let sw = 0
        let swp = 0
        for (const m of pool) {
          const n = m.n ?? 5
          const w = n * Math.pow(YEAR_DECAY, Math.max(0, Math.min(L, latest) - Math.min(m.year, L)))
          sw += w
          swp += w * m.price * deflate(code, t, m.year, L)
        }
        if (sw > 0) {
          const src = pool[0].source === 'khr_kunta' ? 'municipality_khr' : 'municipality_statfin'
          muniParent.set(code, { price: swp / sw, source: src, n: sw })
        }
      }
      // Fallback: median of own estimates within municipality
      const ownByMuni = new Map<string, number[]>()
      for (const [areaId, o] of own) {
        const a = areaById.get(areaId)!
        if (o.n < MUNI_MEDIAN_MIN_N) continue
        const key = a.municipality_code ?? a.municipality
        const list = ownByMuni.get(key) ?? []
        list.push(o.p)
        ownByMuni.set(key, list)
      }

      // 3. Per-area assembly
      const typeResults = new Map<string, Result>()
      const areasWithCentroid = areas.filter((a) => a.lng != null && a.lat != null)
      const ownAreasWithCentroid = areasWithCentroid.filter((a) => own.has(a.id))

      for (const area of areas) {
        const o = own.get(area.id)
        const nOwn = o?.n ?? 0
        const pOwn = o?.p ?? null

        // parent 1: nearby (weight n/d² so close neighbours beat large far-away areas)
        let parent: { price: number; source: string; detail: unknown } | null = null
        let nearbyParent: { price: number; detail: unknown } | null = null
        if (area.lng != null && area.lat != null) {
          const cands: Array<{ id: string; d: number; n: number; p: number }> = []
          for (const other of ownAreasWithCentroid) {
            if (other.id === area.id) continue
            const d = haversineKm(area.lng, area.lat, other.lng!, other.lat!)
            if (d > NEARBY_RADIUS_KM) continue
            const oo = own.get(other.id)!
            cands.push({ id: other.id, d, n: oo.n, p: oo.p })
          }
          cands.sort((a, b) => a.d - b.d)
          const top = cands.slice(0, NEARBY_MAX)
          const sumN = top.reduce((s, c) => s + c.n, 0)
          if (top.length >= 2 && sumN >= NEARBY_MIN_N) {
            let sw = 0
            let swp = 0
            for (const c of top) {
              const d = Math.max(c.d, NEARBY_MIN_DISTANCE_KM)
              const w = c.n / (d * d)
              sw += w
              swp += w * c.p
            }
            nearbyParent = {
              price: swp / sw,
              detail: top.map((c) => ({ area: areaById.get(c.id)?.area_code, km: round2(c.d), n: round2(c.n), p: Math.round(c.p) })),
            }
          }
        }

        // parent 2: municipality (StatFin 13mx / KHR kunta / median of own areas)
        let muniParentForArea: { price: number; source: string; detail: unknown } | null = null
        {
          const mp = area.municipality_code ? muniParent.get(area.municipality_code) : undefined
          if (mp) {
            muniParentForArea = { price: mp.price, source: mp.source, detail: { n: round2(mp.n) } }
          } else {
            const list = ownByMuni.get(area.municipality_code ?? area.municipality)
            if (list && list.length >= MUNI_MEDIAN_MIN_AREAS) {
              muniParentForArea = { price: median(list), source: 'municipality_median', detail: { areas: list.length } }
            }
          }
        }

        // Combine: both → 50/50 blend (neighbours carry local gradient, municipality carries level)
        if (nearbyParent && muniParentForArea) {
          parent = {
            price: 0.5 * nearbyParent.price + 0.5 * muniParentForArea.price,
            source: 'nearby',
            detail: { nearby: nearbyParent.detail, nearby_price: Math.round(nearbyParent.price), municipality: muniParentForArea.detail, municipality_price: Math.round(muniParentForArea.price), municipality_source: muniParentForArea.source },
          }
        } else if (nearbyParent) {
          parent = { price: nearbyParent.price, source: 'nearby', detail: nearbyParent.detail }
        } else if (muniParentForArea) {
          parent = muniParentForArea
        }

        // parent 3: type cascade (uses already-built bases for this area)
        if (!parent) {
          for (const c of CASCADE[t]) {
            const from = baseByTypeArea.get(c.from)?.get(area.id)
            if (from) {
              parent = { price: from.base_price * c.factor, source: `cascade_${c.from}`, detail: { factor: c.factor, from: from.base_price } }
              break
            }
          }
        }

        // 4. Shrinkage
        let base: number | null = null
        let source: BasePriceSource | null = null
        let nEff = nOwn
        if (pOwn != null && parent) {
          base = (nOwn * pOwn + k * parent.price) / (nOwn + k)
          nEff = nOwn + k
          source = nOwn >= 3 * k ? 'area' : 'shrunk'
        } else if (pOwn != null && nOwn >= STANDALONE_MIN_N) {
          base = pOwn
          source = nOwn >= 3 * k ? 'area' : 'shrunk'
        } else if (parent) {
          base = parent.price
          nEff = k
          source = parent.source === 'nearby' ? 'nearby' : parent.source.startsWith('cascade') ? 'cascade' : 'municipality'
        }
        if (base == null || source == null) continue

        // 5. OKT guard against RT base in the same area
        let guard: Record<string, unknown> | undefined
        if (t === 'omakotitalo') {
          const rt = baseByTypeArea.get('rivitalo')?.get(area.id)
          if (rt) {
            const lo = rt.base_price * OKT_RT_RATIO_MIN
            const hi = rt.base_price * OKT_RT_RATIO_MAX
            const clamped = Math.min(hi, Math.max(lo, base))
            if (clamped !== base) {
              guard = { rt_base: rt.base_price, before: Math.round(base), after: Math.round(clamped) }
              base = clamped
            }
          }
        }

        if (base < MIN_BASE || base > MAX_BASE) continue

        const result: Result = {
          area_id: area.id,
          property_type: t,
          base_price: Math.round(base),
          source,
          n_own: round2(nOwn),
          p_own: pOwn != null ? Math.round(pOwn) : null,
          n_effective: round2(nEff),
          p_parent: parent ? Math.round(parent.price) : null,
          parent_source: parent?.source ?? null,
          years_used: o?.years ?? [],
          details: {
            L,
            k,
            own: o?.rows ?? [],
            parent: parent?.detail ?? null,
            index_code: indexCodeFor(area.municipality_code),
            ...(guard ? { okt_guard: guard } : {}),
          },
        }
        typeResults.set(area.id, result)
        results.push(result)
      }
      baseByTypeArea.set(t, typeResults)

      // Per-type summary
      const dist: Record<string, number> = {}
      for (const r of typeResults.values()) dist[r.source] = (dist[r.source] ?? 0) + 1
      console.log(`  base prices: ${typeResults.size}  sources: ${JSON.stringify(dist)}`)
    }

    // ── Global summary ───────────────────────────────────────────────
    console.log('\n=== Summary ===')
    console.log(`Total (area, type) rows: ${results.length}`)

    // OKT / RT ratio distribution
    const ratios: number[] = []
    for (const r of baseByTypeArea.get('omakotitalo')!.values()) {
      const rt = baseByTypeArea.get('rivitalo')!.get(r.area_id)
      if (rt) ratios.push(r.base_price / rt.base_price)
    }
    if (ratios.length) {
      const s = ratios.sort((a, b) => a - b)
      console.log(`OKT/RT ratio (n=${s.length}): min ${s[0].toFixed(2)}, p10 ${s[Math.floor(s.length * 0.1)].toFixed(2)}, median ${s[Math.floor(s.length / 2)].toFixed(2)}, p90 ${s[Math.floor(s.length * 0.9)].toFixed(2)}, max ${s[s.length - 1].toFixed(2)}`)
    }

    // Biggest changes vs previous "latest year" price
    const changes = results
      .filter((r) => previousLatest.has(`${r.area_id}|${r.property_type}`))
      .map((r) => {
        const prev = previousLatest.get(`${r.area_id}|${r.property_type}`)!
        return { r, prev, ratio: r.base_price / prev }
      })
      .sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)))
    console.log('\nTop 20 changes vs previous latest-year price:')
    for (const c of changes.slice(0, 20)) {
      const a = areaById.get(c.r.area_id)!
      console.log(`  ${a.area_code} ${a.name} (${a.municipality}) ${c.r.property_type.padEnd(11)} ${Math.round(c.prev)} → ${c.r.base_price} (${c.r.source}, n_own ${c.r.n_own}) ×${c.ratio.toFixed(2)}`)
    }

    // Coverage for a few sparse municipalities
    const watch = ['Nokia', 'Kangasala', 'Laukaa', 'Liminka', 'Hämeenkyrö', 'Pirkkala', 'Kaarina']
    console.log('\nCoverage in sparse municipalities:')
    for (const m of watch) {
      const ids = areas.filter((a) => a.municipality === m).map((a) => a.id)
      const parts = TYPES.map((t) => {
        const got = ids.filter((id) => baseByTypeArea.get(t)!.has(id)).length
        return `${t.slice(0, 3).toUpperCase()} ${got}/${ids.length}`
      })
      console.log(`  ${m.padEnd(12)} ${parts.join('  ')}`)
    }

    if (DRY_RUN) {
      console.log('\nDry run — nothing written.')
      return
    }

    // ── Write ────────────────────────────────────────────────────────
    console.log('\nWriting area_base_prices...')
    await client.query('BEGIN')
    await client.query('DELETE FROM area_base_prices')
    const inserted = await bulkInsert(
      client,
      'area_base_prices',
      ['area_id', 'property_type', 'base_price', 'source', 'n_own', 'p_own', 'n_effective', 'p_parent', 'parent_source', 'years_used', 'details'],
      results.map((r) => ({ ...r, details: JSON.stringify(r.details) }))
    )
    await client.query('COMMIT')
    console.log(`Inserted ${inserted} rows into area_base_prices.`)
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
