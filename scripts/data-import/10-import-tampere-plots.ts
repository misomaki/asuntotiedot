/**
 * Script 10: Import Tampere municipality-owned plot polygons.
 *
 * Fetches plots from Tampere Open Data WFS
 * (kiinteistot:KIINTEISTOT_ALUE_JULKINEN_GSVIEW)
 * filtered to municipality-owned (OMISTAJALAJI LIKE '10%') tontit.
 * Stores polygon geometries in _tampere_municipal_plots staging table,
 * then runs spatial join to mark buildings as is_leased_plot.
 *
 * Prerequisites:
 *   - Migration 024_leased_plot.sql deployed
 *   - Scripts 01-07 completed (buildings must exist)
 *
 * Usage: npx tsx scripts/data-import/10-import-tampere-plots.ts
 */

import { supabase } from './lib/supabaseAdmin'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WFS_BASE =
  'https://geodata.tampere.fi/geoserver/ows' +
  '?service=WFS&version=2.0.0&request=GetFeature' +
  '&typeName=kiinteistot:KIINTEISTOT_ALUE_JULKINEN_GSVIEW' +
  '&outputFormat=application/json&srsName=EPSG:4326' +
  "&CQL_FILTER=OMISTAJALAJI%20LIKE%20'10%25'%20AND%20LAJI%3D'Tontti'"

const PAGE_SIZE = 500
const INSERT_BATCH = 100
const MATCH_BATCH = 500

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WfsFeature {
  type: 'Feature'
  id: string
  properties: {
    KIINTEISTOTUNNUS?: string
    OMISTAJALAJI?: string
    LAJI?: string
    KOKON_ALA?: number
    [key: string]: unknown
  }
  geometry: {
    type: 'Polygon' | 'MultiPolygon'
    coordinates: number[][][] | number[][][][]
  } | null
}

interface WfsResponse {
  type: 'FeatureCollection'
  totalFeatures?: number
  numberMatched?: number
  numberReturned?: number
  features: WfsFeature[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toMultiPolygon(
  geom: WfsFeature['geometry']
): { type: 'MultiPolygon'; coordinates: number[][][][] } | null {
  if (!geom) return null
  if (geom.type === 'MultiPolygon') {
    return geom as { type: 'MultiPolygon'; coordinates: number[][][][] }
  }
  if (geom.type === 'Polygon') {
    return {
      type: 'MultiPolygon',
      coordinates: [geom.coordinates as number[][][]],
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// WFS fetch with retry
// ---------------------------------------------------------------------------

async function fetchPlotPage(startIndex: number): Promise<WfsResponse> {
  const url = `${WFS_BASE}&startIndex=${startIndex}&count=${PAGE_SIZE}`

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url)

      if (res.status === 429 || res.status === 503) {
        const wait = 10000 * attempt
        console.log(`  Rate limited (${res.status}), waiting ${wait / 1000}s...`)
        await sleep(wait)
        continue
      }

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`WFS error ${res.status}: ${text.slice(0, 300)}`)
      }

      return (await res.json()) as WfsResponse
    } catch (err) {
      if (attempt === 3) throw err
      console.log(`  Fetch error (attempt ${attempt}/3): ${(err as Error).message}`)
      await sleep(5000 * attempt)
    }
  }
  throw new Error('WFS fetch failed after 3 attempts')
}

// ---------------------------------------------------------------------------
// Staging insert
// ---------------------------------------------------------------------------

async function insertPlotBatch(
  rows: Array<{ plot_id: string; geometry: object }>
): Promise<number> {
  const { error } = await supabase
    .from('_tampere_municipal_plots')
    .insert(rows)

  if (error) {
    console.error(`  Insert error: ${error.message}`)
    return 0
  }
  return rows.length
}

// ---------------------------------------------------------------------------
// Spatial join loop
// ---------------------------------------------------------------------------

async function runSpatialJoin(): Promise<number> {
  console.log('\nRunning spatial join (mark_leased_plots_batch)...')
  let totalMarked = 0
  let batchNum = 0

  while (true) {
    batchNum++
    const { data, error } = await supabase.rpc('mark_leased_plots_batch', {
      p_limit: MATCH_BATCH,
    })

    if (error) {
      console.error(`RPC error: ${error.message}`)
      break
    }

    const count = typeof data === 'number' ? data : 0
    if (count === 0) break

    totalMarked += count
    if (batchNum % 5 === 0 || count < MATCH_BATCH) {
      console.log(`  Batch ${batchNum}: +${count} (total: ${totalMarked})`)
    }
  }

  return totalMarked
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Tampere Municipal Plot Import ===\n')

  // Step 1: Clear staging table
  console.log('Clearing staging table...')
  const { error: delErr } = await supabase
    .from('_tampere_municipal_plots')
    .delete()
    .gte('id', '00000000-0000-0000-0000-000000000000')

  if (delErr) {
    console.error('Failed to clear staging:', delErr.message)
    console.error('Make sure migration 024 has been run.')
    process.exit(1)
  }

  // Step 2: Fetch all plot pages from WFS
  let startIndex = 0
  let pageNum = 0
  let totalFetched = 0
  let totalInserted = 0
  let totalAvailable = 0
  const pendingBatch: Array<{ plot_id: string; geometry: object }> = []

  console.log('Fetching Tampere municipal plots from WFS...')

  while (true) {
    pageNum++
    const data = await fetchPlotPage(startIndex)
    const features = data.features ?? []

    if (pageNum === 1) {
      totalAvailable = data.totalFeatures ?? data.numberMatched ?? 0
      console.log(`Total features available: ${totalAvailable}`)
    }

    if (features.length === 0) break

    for (const feature of features) {
      const multiGeom = toMultiPolygon(feature.geometry)
      if (!multiGeom) continue

      const plotId =
        feature.properties?.KIINTEISTOTUNNUS ??
        feature.id ??
        `plot-${totalFetched}`

      pendingBatch.push({
        plot_id: plotId,
        geometry: multiGeom,
      })
      totalFetched++

      if (pendingBatch.length >= INSERT_BATCH) {
        const inserted = await insertPlotBatch([...pendingBatch])
        totalInserted += inserted
        pendingBatch.length = 0
      }
    }

    const pct =
      totalAvailable > 0
        ? ` (${Math.round(((startIndex + features.length) / totalAvailable) * 100)}%)`
        : ''
    console.log(`  Page ${pageNum}: ${features.length} features${pct}`)

    if (features.length < PAGE_SIZE) break
    startIndex += PAGE_SIZE
    await sleep(500)
  }

  // Flush remaining
  if (pendingBatch.length > 0) {
    totalInserted += await insertPlotBatch([...pendingBatch])
  }

  console.log(`\nFetched: ${totalFetched} plot polygons`)
  console.log(`Inserted into staging: ${totalInserted}`)

  // Step 3: Reset is_leased_plot for Tampere buildings (idempotent re-runs)
  console.log('\nResetting is_leased_plot for Tampere buildings...')
  const { data: resetCount, error: resetErr } = await supabase.rpc(
    'reset_tampere_leased_plots'
  )
  if (resetErr) {
    console.warn('reset RPC failed:', resetErr.message)
    console.warn('Run manually: UPDATE buildings SET is_leased_plot = NULL FROM areas WHERE ...')
  } else {
    console.log(`  Reset ${resetCount} Tampere buildings`)
  }

  // Step 4: Spatial join
  const marked = await runSpatialJoin()

  // Step 5: Summary
  const { count: leasedCount } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .eq('is_leased_plot', true)

  const { count: ownedCount } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .eq('is_leased_plot', false)

  console.log('\n=== Import Complete ===')
  console.log(`Plots imported:              ${totalInserted}`)
  console.log(`Buildings marked (this run): ${marked}`)
  console.log(`  is_leased_plot = true:     ${leasedCount ?? '?'}`)
  console.log(`  is_leased_plot = false:    ${ownedCount ?? '?'}`)

  if (leasedCount && ownedCount) {
    const total = (leasedCount ?? 0) + (ownedCount ?? 0)
    const pct = Math.round(((leasedCount ?? 0) / total) * 100)
    console.log(`  Leased plot share:         ${pct}%`)
  }

  console.log('\nNext steps:')
  console.log('  1. Update priceEstimation.ts with tontti_factor')
  console.log('  2. Deploy migration 025 (tontti factor in SQL)')
  console.log("  3. Reset Tampere: UPDATE buildings SET estimation_year = NULL FROM areas WHERE buildings.area_id = areas.id AND areas.municipality = 'Tampere';")
  console.log('  4. Recompute: npx tsx scripts/data-import/05-compute-building-prices.ts')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
