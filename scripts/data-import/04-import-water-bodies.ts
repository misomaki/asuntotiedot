/**
 * Script 04: Import water body geometries from OpenStreetMap via Overpass API.
 *
 * Queries for lakes, ponds, rivers, bays, and other water polygons
 * within each city's bounding box (with buffer for nearby water).
 *
 * After importing, computes distance from each building to nearest
 * water body using PostGIS spatial functions.
 *
 * Prerequisites:
 *   - Script 03 must be run first (buildings in database)
 *   - Run supabase/migrations/002_building_functions.sql in SQL Editor
 *
 * Usage: npx tsx scripts/data-import/04-import-water-bodies.ts
 */

import { supabase } from './lib/supabaseAdmin'
import { CITIES } from './config'
import { sleep } from './lib/pxwebClient'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

interface OverpassElement {
  type: 'way' | 'relation' | 'node'
  id: number
  tags?: Record<string, string>
  geometry?: Array<{ lat: number; lon: number }>
}

async function queryOverpass(query: string): Promise<{ elements: OverpassElement[] }> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`  Overpass query (attempt ${attempt})...`)

      const response = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      })

      if (response.status === 429 || response.status === 503) {
        const wait = 30000 * attempt
        console.log(`  Rate limited (${response.status}), waiting ${wait / 1000}s...`)
        await sleep(wait)
        continue
      }

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Overpass error ${response.status}: ${text.slice(0, 300)}`)
      }

      return response.json()
    } catch (err) {
      if (attempt === 3) throw err
      console.log(`  Attempt ${attempt} failed, retrying...`)
      await sleep(10000 * attempt)
    }
  }
  throw new Error('Overpass query failed')
}

function classifyWaterType(tags: Record<string, string>): string {
  if (tags.water === 'sea' || tags.water === 'bay' || tags.water === 'cove') return 'sea'
  if (tags.water === 'river' || tags.waterway === 'riverbank') return 'river'
  if (tags.water === 'reservoir') return 'reservoir'
  return 'lake'
}

function wayToMultiPolygon(
  geometry: Array<{ lat: number; lon: number }>
): { type: 'MultiPolygon'; coordinates: number[][][][] } | null {
  if (!geometry || geometry.length < 4) return null

  const ring = geometry.map((p) => [p.lon, p.lat])

  // Ensure closed ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]])
  }

  return { type: 'MultiPolygon', coordinates: [[ring]] }
}

async function importWaterBodies(): Promise<number> {
  console.log('Querying water bodies for all cities...\n')

  // Collect all water features, deduplicate by OSM ID
  const allWater = new Map<number, {
    osmId: number
    name: string | null
    waterType: string
    geometry: { type: 'MultiPolygon'; coordinates: number[][][][] }
  }>()

  for (const city of CITIES) {
    const [west, south, east, north] = city.bbox

    // Add ~5km buffer to catch water bodies near city edges
    const buf = 0.05
    const s = south - buf
    const w = west - buf
    const n = north + buf
    const e = east + buf

    console.log(`${city.name}: querying water in [${w.toFixed(2)}, ${s.toFixed(2)}, ${e.toFixed(2)}, ${n.toFixed(2)}]`)

    // Query water polygon ways (lakes, ponds, bays, rivers, reservoirs)
    const query = `
      [out:json][timeout:120];
      (
        way["natural"="water"](${s},${w},${n},${e});
        way["water"](${s},${w},${n},${e});
        way["waterway"="riverbank"](${s},${w},${n},${e});
      );
      out body geom;
    `

    const data = await queryOverpass(query)
    console.log(`  ${data.elements.length} water features received`)

    let added = 0
    for (const el of data.elements) {
      if (el.type !== 'way') continue
      if (allWater.has(el.id)) continue
      if (!el.geometry || el.geometry.length < 4) continue

      const multiPoly = wayToMultiPolygon(el.geometry)
      if (!multiPoly) continue

      const tags = el.tags ?? {}

      allWater.set(el.id, {
        osmId: el.id,
        name: tags.name ?? null,
        waterType: classifyWaterType(tags),
        geometry: multiPoly,
      })
      added++
    }

    console.log(`  ${added} new water bodies added (total unique: ${allWater.size})`)

    // Overpass rate limit
    if (CITIES.indexOf(city) < CITIES.length - 1) {
      console.log('  Waiting 10s...')
      await sleep(10000)
    }
  }

  console.log(`\nInserting ${allWater.size} unique water bodies...`)

  // Insert in batches
  const waterList = Array.from(allWater.values())
  let inserted = 0
  const BATCH_SIZE = 100

  for (let i = 0; i < waterList.length; i += BATCH_SIZE) {
    const batch = waterList.slice(i, i + BATCH_SIZE)

    const rows = batch.map((w) => ({
      osm_id: w.osmId,
      name: w.name,
      water_type: w.waterType,
      geometry: JSON.stringify(w.geometry),
    }))

    const { error } = await supabase
      .from('water_bodies')
      .insert(rows)

    if (error) {
      console.error(`  Batch error at ${i}: ${error.message}`)
    } else {
      inserted += rows.length
    }

    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= waterList.length) {
      console.log(
        `  Progress: ${Math.min(i + BATCH_SIZE, waterList.length)}/${waterList.length}`
      )
    }
  }

  console.log(`Inserted ${inserted} water bodies`)
  return inserted
}

async function computeWaterDistances() {
  console.log('\nComputing distances from buildings to nearest water...')
  console.log('This may take several minutes...\n')

  // Check how many buildings need distance computation
  const { count } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('area_id', 'is', null)
    .is('min_distance_to_water_m', null)

  console.log(`Buildings needing water distance: ${count}`)

  if (!count || count === 0) {
    console.log('All buildings already have water distances.')
    return
  }

  let totalUpdated = 0
  let batchNum = 0

  while (true) {
    batchNum++

    const { data, error } = await supabase.rpc('compute_water_distances_batch', {
      p_limit: 500,
    })

    if (error) {
      console.error('RPC compute_water_distances_batch failed:', error.message)
      console.log('\nFallback: Run this SQL in the Supabase SQL editor:')
      console.log(`
UPDATE buildings b
SET min_distance_to_water_m = sub.dist
FROM (
  SELECT b2.id,
    COALESCE(
      (SELECT MIN(ST_Distance(b2.centroid::geography, w.geometry::geography))
       FROM (SELECT geometry FROM water_bodies ORDER BY b2.centroid <-> geometry LIMIT 3) w),
      99999
    ) AS dist
  FROM buildings b2
  WHERE b2.centroid IS NOT NULL AND b2.min_distance_to_water_m IS NULL AND b2.area_id IS NOT NULL
  LIMIT 500
) sub
WHERE b.id = sub.id;
`)
      break
    }

    const batchCount = typeof data === 'number' ? data : 0

    if (batchCount === 0) break

    totalUpdated += batchCount

    if (batchNum % 10 === 0 || batchCount < 500) {
      console.log(
        `  Batch ${batchNum}: +${batchCount} (total: ${totalUpdated}/${count})`
      )
    }
  }

  console.log(`\nWater distances computed for ${totalUpdated} buildings`)
}

async function main() {
  console.log('=== Water Bodies Import (Overpass API) ===\n')

  const count = await importWaterBodies()

  if (count > 0) {
    await computeWaterDistances()
  }

  console.log('\n=== Import complete ===')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
