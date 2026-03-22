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
 *        npx tsx scripts/data-import/04-import-water-bodies.ts --distances-only
 */

import { supabase } from './lib/supabaseAdmin'
import { CITIES } from './config'
import { sleep } from './lib/pxwebClient'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

/** Whether to import water bodies for ALL Finland (not just target cities) */
const IMPORT_ALL = process.argv.includes('--all')

interface OverpassElement {
  type: 'way' | 'relation' | 'node'
  id: number
  tags?: Record<string, string>
  geometry?: Array<{ lat: number; lon: number }>
  members?: Array<{
    type: string
    role: string
    geometry?: Array<{ lat: number; lon: number }>
  }>
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
  // Sea & coastal water
  if (tags.water === 'sea' || tags.water === 'bay' || tags.water === 'cove') return 'sea'
  // Rivers
  if (tags.water === 'river' || tags.waterway === 'riverbank') return 'river'
  // Ponds & small artificial basins (should NOT affect property price premium)
  if (tags.water === 'pond' || tags.water === 'basin' || tags.water === 'wastewater'
    || tags.water === 'reflecting_pool' || tags.water === 'fountain'
    || tags.water === 'fish_pass' || tags.water === 'moat') return 'pond'
  // Reservoirs
  if (tags.water === 'reservoir') return 'reservoir'
  // Explicitly tagged lakes
  if (tags.water === 'lake' || tags.water === 'oxbow') return 'lake'
  // Default: natural=water without specific water=* tag
  // Could be lake or pond — classify as 'lake' and let area filter in SQL handle it
  return 'lake'
}

/**
 * Convert an OSM relation's members into a MultiPolygon.
 * Each outer-role member with geometry becomes a separate polygon.
 * Large lakes (Pyhäjärvi, Näsijärvi, etc.) are mapped as relations in OSM.
 */
function relationToMultiPolygon(
  members: Array<{ type: string; role: string; geometry?: Array<{ lat: number; lon: number }> }>
): { type: 'MultiPolygon'; coordinates: number[][][][] } | null {
  const outerRings: number[][][] = []

  for (const member of members) {
    // Accept 'outer' role and default '' role (some relations use empty role for outer)
    if (member.role !== 'outer' && member.role !== '') continue
    if (!member.geometry || member.geometry.length < 4) continue

    const ring = member.geometry.map((p) => [p.lon, p.lat])
    // Ensure closed ring
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([first[0], first[1]])
    }
    outerRings.push(ring)
  }

  if (outerRings.length === 0) return null
  return {
    type: 'MultiPolygon',
    coordinates: outerRings.map((ring) => [ring]),
  }
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

/**
 * Fetch bboxes from areas table, grouped by municipality.
 */
async function fetchMunicipalityBboxes(): Promise<Array<{ name: string; bbox: [number, number, number, number] }>> {
  const { data, error } = await supabase
    .from('areas')
    .select('municipality, centroid')
    .not('centroid', 'is', null)
    .not('municipality', 'is', null)

  if (error || !data) {
    console.error('Failed to fetch areas:', error?.message)
    return []
  }

  const groups = new Map<string, Array<[number, number]>>()
  for (const row of data) {
    const mun = row.municipality as string
    if (!mun) continue

    let coords: [number, number] | null = null
    if (typeof row.centroid === 'object' && row.centroid !== null) {
      const obj = row.centroid as { type?: string; coordinates?: number[] }
      if (obj.type === 'Point' && Array.isArray(obj.coordinates)) {
        coords = [obj.coordinates[0], obj.coordinates[1]]
      }
    } else if (typeof row.centroid === 'string') {
      const match = (row.centroid as string).match(/POINT\(([^ ]+) ([^ ]+)\)/)
      if (match) coords = [parseFloat(match[1]), parseFloat(match[2])]
    }

    if (!coords) continue
    if (!groups.has(mun)) groups.set(mun, [])
    groups.get(mun)!.push(coords)
  }

  const results: Array<{ name: string; bbox: [number, number, number, number] }> = []
  for (const [mun, centroids] of groups) {
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
    for (const [lng, lat] of centroids) {
      minLng = Math.min(minLng, lng)
      minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng)
      maxLat = Math.max(maxLat, lat)
    }
    const buf = 0.05
    results.push({
      name: mun,
      bbox: [minLng - buf, minLat - buf, maxLng + buf, maxLat + buf],
    })
  }

  return results
}

async function importWaterBodies(): Promise<number> {
  // Determine which bboxes to query
  const queryAreas: Array<{ name: string; bbox: [number, number, number, number] }> = []

  if (IMPORT_ALL) {
    console.log('Fetching municipality bboxes for Finland-wide water import...\n')
    const munBboxes = await fetchMunicipalityBboxes()
    queryAreas.push(...munBboxes)
    console.log(`Will query water bodies for ${queryAreas.length} municipalities\n`)
  } else {
    for (const city of CITIES) {
      queryAreas.push({ name: city.name, bbox: city.bbox })
    }
    console.log(`Querying water bodies for ${queryAreas.length} cities...\n`)
  }

  // Collect all water features, deduplicate by OSM ID
  const allWater = new Map<number, {
    osmId: number
    name: string | null
    waterType: string
    geometry: { type: 'MultiPolygon'; coordinates: number[][][][] }
  }>()

  for (let qi = 0; qi < queryAreas.length; qi++) {
    const area = queryAreas[qi]
    const [west, south, east, north] = area.bbox

    // Add ~5km buffer to catch water bodies near edges
    const buf = 0.05
    const s = south - buf
    const w = west - buf
    const n = north + buf
    const e = east + buf

    if (IMPORT_ALL) {
      console.log(`[${qi + 1}/${queryAreas.length}] ${area.name}`)
    } else {
      console.log(`${area.name}: querying water in [${w.toFixed(2)}, ${s.toFixed(2)}, ${e.toFixed(2)}, ${n.toFixed(2)}]`)
    }

    // Query water polygons: ways AND relations (large lakes are OSM relations)
    const query = `
      [out:json][timeout:180];
      (
        way["natural"="water"](${s},${w},${n},${e});
        way["water"](${s},${w},${n},${e});
        way["waterway"="riverbank"](${s},${w},${n},${e});
        relation["natural"="water"](${s},${w},${n},${e});
        relation["water"](${s},${w},${n},${e});
      );
      out body geom;
    `

    const data = await queryOverpass(query)
    console.log(`  ${data.elements.length} water features received`)

    let added = 0
    let relations = 0
    for (const el of data.elements) {
      if (el.type !== 'way' && el.type !== 'relation') continue
      if (allWater.has(el.id)) continue

      let multiPoly: { type: 'MultiPolygon'; coordinates: number[][][][] } | null = null

      if (el.type === 'way') {
        if (!el.geometry || el.geometry.length < 4) continue
        multiPoly = wayToMultiPolygon(el.geometry)
      } else if (el.type === 'relation') {
        if (!el.members) continue
        multiPoly = relationToMultiPolygon(el.members)
        if (multiPoly) relations++
      }

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

    if (relations > 0) {
      console.log(`  Including ${relations} relation-type water bodies (large lakes)`)
    }

    console.log(`  ${added} new water bodies added (total unique: ${allWater.size})`)

    // Overpass rate limit
    if (qi < queryAreas.length - 1) {
      console.log('  Waiting 10s...')
      await sleep(10000)
    }
  }

  // Log classification breakdown
  const typeCounts = new Map<string, number>()
  for (const w of allWater.values()) {
    typeCounts.set(w.waterType, (typeCounts.get(w.waterType) ?? 0) + 1)
  }
  console.log(`\nWater body classification:`)
  for (const [type, count] of [...typeCounts.entries()].sort((a, b) => b[1] - a[1])) {
    const marker = (type === 'lake' || type === 'sea') ? '✓ (counts for price)' : '✗ (excluded)'
    console.log(`  ${type}: ${count} ${marker}`)
  }

  console.log(`\nClearing existing water bodies and re-inserting ${allWater.size}...`)

  // Delete all existing water bodies (full re-import)
  const { error: deleteError } = await supabase
    .from('water_bodies')
    .delete()
    .gte('id', '00000000-0000-0000-0000-000000000000') // match all rows
  if (deleteError) {
    console.error('Failed to delete existing water bodies:', deleteError.message)
  } else {
    console.log('  Cleared existing water bodies')
  }

  // Insert in batches (no upsert — clean table)
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
  // Use estimated count to avoid timeout on large tables
  const { count } = await supabase
    .from('buildings')
    .select('id', { count: 'estimated', head: true })
    .not('area_id', 'is', null)
    .is('min_distance_to_water_m', null)

  console.log(`Buildings needing water distance: ${count ?? 'unknown (count timed out)'}`)

  // Don't bail on null count — it means the query timed out, not that there are 0 rows.
  // Just proceed and let the RPC loop discover when there are no more rows.
  if (count === 0) {
    console.log('All buildings already have water distances.')
    return
  }

  let totalUpdated = 0
  let batchNum = 0

  while (true) {
    batchNum++

    const { data, error } = await supabase.rpc('compute_water_distances_batch', {
      p_limit: 100,
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
      (SELECT MIN(ST_Distance(b2.geometry::geography, w.geometry::geography))
       FROM (
         SELECT geometry FROM water_bodies
         WHERE water_type IN ('lake', 'sea')
           AND (water_type = 'sea' OR ST_Area(geometry::geography) > 10000)
         ORDER BY b2.centroid <-> geometry
         LIMIT 5
       ) w),
      99999
    ) AS dist
  FROM buildings b2
  WHERE b2.centroid IS NOT NULL AND b2.geometry IS NOT NULL
    AND b2.min_distance_to_water_m IS NULL AND b2.area_id IS NOT NULL
  LIMIT 500
) sub
WHERE b.id = sub.id;
`)
      break
    }

    const batchCount = typeof data === 'number' ? data : 0

    if (batchCount === 0) break

    totalUpdated += batchCount

    if (batchNum % 50 === 0 || batchCount < 100) {
      console.log(
        `  Batch ${batchNum}: +${batchCount} (total: ${totalUpdated}${count ? `/${count}` : ''})`
      )
    }
  }

  console.log(`\nWater distances computed for ${totalUpdated} buildings`)
}

async function main() {
  const distancesOnly = process.argv.includes('--distances-only')

  if (distancesOnly) {
    console.log('=== Recompute Water Distances Only ===\n')
    await computeWaterDistances()
  } else {
    console.log('=== Water Bodies Import (Overpass API) ===\n')
    await importWaterBodies()
    await computeWaterDistances()
  }

  console.log('\n=== Complete ===')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
