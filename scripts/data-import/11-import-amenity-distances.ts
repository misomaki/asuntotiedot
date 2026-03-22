/**
 * Script 11: Import amenity POIs from OSM and compute distances to buildings.
 *
 * Fetches schools, kindergartens, grocery stores, transit stops, parks,
 * and health facilities from Overpass API, then computes nearest distances
 * to each building via PostGIS.
 *
 * Prerequisites:
 *   - Buildings imported (scripts 01-05)
 *   - Run supabase/migrations/021_amenity_distances.sql
 *
 * Usage:
 *   npx tsx scripts/data-import/11-import-amenity-distances.ts
 *   npx tsx scripts/data-import/11-import-amenity-distances.ts --distances-only
 */

import { supabase } from './lib/supabaseAdmin'
import { CITIES } from './config'
import { sleep } from './lib/pxwebClient'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AmenityConfig {
  type: string           // our internal type name
  column: string         // buildings table column
  overpassQuery: string  // Overpass QL snippet (inside bbox area)
}

const AMENITY_CONFIGS: AmenityConfig[] = [
  {
    type: 'school',
    column: 'min_distance_to_school_m',
    overpassQuery: 'nwr["amenity"="school"]',
  },
  {
    type: 'kindergarten',
    column: 'min_distance_to_kindergarten_m',
    overpassQuery: 'nwr["amenity"="kindergarten"]',
  },
  {
    type: 'grocery',
    column: 'min_distance_to_grocery_m',
    overpassQuery: 'nwr["shop"="supermarket"];nwr["shop"="convenience"];nwr["shop"="grocery"]',
  },
  {
    type: 'transit',
    column: 'min_distance_to_transit_m',
    overpassQuery: 'node["highway"="bus_stop"];node["railway"="tram_stop"];node["railway"="station"];node["railway"="halt"]',
  },
  {
    type: 'park',
    column: 'min_distance_to_park_m',
    overpassQuery: 'nwr["leisure"="park"]',
  },
  {
    type: 'health',
    column: 'min_distance_to_health_m',
    overpassQuery: 'nwr["amenity"="hospital"];nwr["amenity"="clinic"];nwr["amenity"="doctors"];nwr["healthcare"="centre"]',
  },
]

// ---------------------------------------------------------------------------
// Overpass API
// ---------------------------------------------------------------------------

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

async function queryOverpass(query: string): Promise<OverpassElement[]> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      })

      if (response.status === 429 || response.status === 503) {
        const wait = 30000 * attempt
        console.log(`    Rate limited (${response.status}), waiting ${wait / 1000}s...`)
        await sleep(wait)
        continue
      }

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Overpass error ${response.status}: ${text.slice(0, 300)}`)
      }

      const data = await response.json() as { elements: OverpassElement[] }
      return data.elements
    } catch (err) {
      if (attempt === 3) throw err
      console.log(`    Attempt ${attempt} failed: ${(err as Error).message}`)
      await sleep(10000 * attempt)
    }
  }
  throw new Error('Unreachable')
}

function getCenter(el: OverpassElement): { lat: number; lng: number } | null {
  if (el.lat != null && el.lon != null) return { lat: el.lat, lng: el.lon }
  if (el.center) return { lat: el.center.lat, lng: el.center.lon }
  return null
}

// ---------------------------------------------------------------------------
// Fetch amenities for all cities
// ---------------------------------------------------------------------------

async function fetchAmenities(): Promise<Map<string, { osmId: number; type: string; name: string | null; lat: number; lng: number }>> {
  const allPois = new Map<string, { osmId: number; type: string; name: string | null; lat: number; lng: number }>()

  for (const config of AMENITY_CONFIGS) {
    console.log(`\nFetching ${config.type}...`)

    for (const city of CITIES) {
      const [west, south, east, north] = city.bbox
      // Overpass bbox format: (south, west, north, east)
      const bbox = `${south},${west},${north},${east}`

      const query = `
        [out:json][timeout:60];
        (
          ${config.overpassQuery.split(';').map(q => `${q}(${bbox});`).join('\n          ')}
        );
        out center;
      `

      try {
        const elements = await queryOverpass(query)
        let added = 0

        for (const el of elements) {
          const center = getCenter(el)
          if (!center) continue

          const key = `${el.id}-${config.type}`
          if (!allPois.has(key)) {
            allPois.set(key, {
              osmId: el.id,
              type: config.type,
              name: el.tags?.name ?? null,
              lat: center.lat,
              lng: center.lng,
            })
            added++
          }
        }

        console.log(`  ${city.name}: +${added} ${config.type} (${elements.length} elements)`)
      } catch (err) {
        console.error(`  SKIPPING ${city.name} ${config.type}: ${(err as Error).message}`)
      }

      await sleep(2000) // respect Overpass rate limits
    }
  }

  console.log(`\nTotal unique POIs: ${allPois.size}`)
  return allPois
}

// ---------------------------------------------------------------------------
// Insert into staging
// ---------------------------------------------------------------------------

async function insertIntoStaging(pois: Array<{ osmId: number; type: string; name: string | null; lat: number; lng: number }>): Promise<void> {
  console.log(`\nInserting ${pois.length} POIs into staging...`)

  const BATCH_SIZE = 1000
  for (let i = 0; i < pois.length; i += BATCH_SIZE) {
    const batch = pois.slice(i, i + BATCH_SIZE)
    const rows = batch.map(p => ({
      osm_id: p.osmId,
      amenity_type: p.type,
      name: p.name,
      geometry: `SRID=4326;POINT(${p.lng} ${p.lat})`,
    }))

    const { error } = await supabase
      .from('_amenity_staging')
      .upsert(rows, { onConflict: 'osm_id,amenity_type' })

    if (error) {
      console.error(`  Insert error at offset ${i}: ${error.message}`)
    }

    if ((i + BATCH_SIZE) % 5000 === 0 || i + BATCH_SIZE >= pois.length) {
      console.log(`  Progress: ${Math.min(i + BATCH_SIZE, pois.length)}/${pois.length}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Compute distances
// ---------------------------------------------------------------------------

async function computeDistances(): Promise<void> {
  for (const config of AMENITY_CONFIGS) {
    // Count POIs of this type
    const { count: poiCount } = await supabase
      .from('_amenity_staging')
      .select('osm_id', { count: 'exact', head: true })
      .eq('amenity_type', config.type)

    // Count buildings needing this distance
    const { count: needCount } = await supabase
      .from('buildings')
      .select('id', { count: 'exact', head: true })
      .is(config.column as 'min_distance_to_school_m', null)
      .not('centroid', 'is', null)

    console.log(`\nComputing ${config.column}: ${poiCount ?? '?'} POIs → ${needCount ?? '?'} buildings`)

    let totalComputed = 0
    let batch = 0

    while (true) {
      batch++
      const { data, error } = await supabase.rpc('compute_amenity_distance_batch', {
        p_amenity_type: config.type,
        p_column_name: config.column,
        p_limit: 500,
      })

      if (error) {
        console.error(`  RPC error: ${error.message}`)
        break
      }

      const batchCount = typeof data === 'number' ? data : 0
      totalComputed += batchCount

      if (batch % 20 === 0 || batchCount === 0) {
        console.log(`  Batch ${batch}: +${batchCount} (total: ${totalComputed})`)
      }

      if (batchCount === 0) break
    }

    console.log(`  Done: ${totalComputed} buildings got ${config.column}`)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const distancesOnly = process.argv.includes('--distances-only')
  console.log('=== Amenity Distance Import ===\n')

  if (!distancesOnly) {
    // Clear staging
    console.log('Clearing amenity staging...')
    await supabase.from('_amenity_staging').delete().neq('osm_id', 0)

    // Fetch from Overpass
    const pois = await fetchAmenities()

    // Insert into staging
    await insertIntoStaging(Array.from(pois.values()))
  } else {
    console.log('--distances-only: using existing staging data')
  }

  // Compute distances
  await computeDistances()

  // Summary
  for (const config of AMENITY_CONFIGS) {
    const { count } = await supabase
      .from('buildings')
      .select('id', { count: 'exact', head: true })
      .not(config.column as 'min_distance_to_school_m', 'is', null)

    console.log(`${config.column}: ${count ?? 0} buildings`)
  }

  console.log('\n=== Complete ===')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
