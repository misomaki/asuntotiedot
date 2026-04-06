/**
 * Script 03b: Import building footprints from MML Maastotietokanta.
 *
 * Replaces OSM Overpass-based import (03) with official MML survey data.
 * Benefits: 5.4M buildings nationwide, 3m accuracy, no over-segmentation,
 * structured residential classification, floor count included.
 *
 * MML API: OGC API Features
 * Endpoint: https://avoin-paikkatieto.maanmittauslaitos.fi/maastotiedot/features/v1/collections/rakennus/items
 * Auth: API key (free registration, stored in MML_API_KEY env var)
 * License: CC BY 4.0
 *
 * Note: osm_id column is reused to store mtk_id (MML unique feature ID).
 *       The unique constraint on osm_id prevents duplicate imports.
 *
 * Prerequisites:
 *   - Scripts 01 must be run first (areas in database)
 *   - Migration 028 must be run (unique constraint on osm_id)
 *   - MML_API_KEY in .env.local
 *
 * Usage:
 *   npx tsx scripts/data-import/03b-import-buildings-mml.ts          # target cities only
 *   npx tsx scripts/data-import/03b-import-buildings-mml.ts --all    # all municipalities
 *   npx tsx scripts/data-import/03b-import-buildings-mml.ts --clean  # delete existing + reimport
 *
 * After import, re-run enrichment scripts:
 *   04 (water), 06 (Ryhti), 05 (prices), address matching, amenity distances
 */

import { supabase } from './lib/supabaseAdmin'
import { CITIES, type CityConfig } from './config'
import { sleep } from './lib/pxwebClient'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '../../.env.local') })

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MML_API_BASE =
  'https://avoin-paikkatieto.maanmittauslaitos.fi/maastotiedot/features/v1/collections/rakennus/items'

const MML_API_KEY = process.env.MML_API_KEY
if (!MML_API_KEY) {
  console.error('Missing MML_API_KEY in .env.local')
  process.exit(1)
}

/** Max features per page (MML supports up to 5000) */
const PAGE_SIZE = 5000

/** Supabase insert batch size */
const INSERT_BATCH_SIZE = 500

/** Delay between API pages (ms) — MML has no rate limit, but be polite */
const API_DELAY_MS = 200

/** Whether to delete existing buildings first */
const CLEAN_MODE = process.argv.includes('--clean')

/** Whether to import all municipalities */
const IMPORT_ALL = process.argv.includes('--all')

/**
 * MML kohdeluokka codes for residential buildings.
 * 42211 = Residential 1-2 floors
 * 42212 = Residential 3+ floors
 */
const RESIDENTIAL_CLASSES = new Set([42211, 42212])

/**
 * Map MML kohdeluokka to our building_type.
 */
function kohdeluokkaToType(code: number): string {
  switch (code) {
    case 42211: return 'residential'
    case 42212: return 'apartments'
    default: return 'yes'
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MMLFeatureProperties {
  mtk_id: number
  kohdeluokka: number
  kayttotarkoitus: number | null
  kerrosluku: number | null
  sijainti_piste: {
    type: 'Point'
    coordinates: [number, number]
  } | null
  alkupvm: string | null
  [key: string]: unknown
}

interface MMLFeature {
  type: 'Feature'
  properties: MMLFeatureProperties
  geometry: {
    type: 'Polygon'
    coordinates: number[][][]
  } | null
}

interface MMLResponse {
  type: 'FeatureCollection'
  features: MMLFeature[]
  numberReturned: number
  links?: Array<{ rel: string; href: string }>
}

// ---------------------------------------------------------------------------
// MML API fetching
// ---------------------------------------------------------------------------

/**
 * Fetch a single page from MML OGC API Features.
 */
async function fetchMMLPage(url: string): Promise<MMLResponse> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url)

      if (response.status === 429 || response.status === 503) {
        const wait = 10000 * attempt
        console.log(`  Rate limited (${response.status}), waiting ${wait / 1000}s...`)
        await sleep(wait)
        continue
      }

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`MML API error ${response.status}: ${text.slice(0, 300)}`)
      }

      return response.json()
    } catch (err) {
      if (attempt === 3) throw err
      console.log(`  Attempt ${attempt} failed, retrying in ${5 * attempt}s...`)
      await sleep(5000 * attempt)
    }
  }

  throw new Error('MML API request failed after all retries')
}

/**
 * Fetch all residential buildings in a bbox, handling pagination.
 */
async function fetchAllBuildingsInBbox(
  bbox: [number, number, number, number]
): Promise<MMLFeature[]> {
  const [west, south, east, north] = bbox
  const allFeatures: MMLFeature[] = []

  let url = `${MML_API_BASE}?f=json&limit=${PAGE_SIZE}&bbox=${west},${south},${east},${north}&api-key=${MML_API_KEY}`
  let page = 0

  while (url) {
    page++
    const data = await fetchMMLPage(url)

    // Filter to residential buildings
    const residential = data.features.filter((f) => {
      if (!f.geometry) return false
      return RESIDENTIAL_CLASSES.has(f.properties.kohdeluokka)
    })

    allFeatures.push(...residential)

    if (page % 5 === 0 || data.numberReturned < PAGE_SIZE) {
      console.log(
        `    Page ${page}: ${data.numberReturned} fetched, ${residential.length} residential (${allFeatures.length} total)`
      )
    }

    // Follow next link for pagination
    const nextLink = data.links?.find((l) => l.rel === 'next')
    if (nextLink?.href && data.numberReturned >= PAGE_SIZE) {
      url = nextLink.href
      // MML may double-encode bbox in next link — decode if needed
      if (url.includes('%25')) {
        url = decodeURIComponent(url)
      }
      await sleep(API_DELAY_MS)
    } else {
      url = ''
    }
  }

  return allFeatures
}

// ---------------------------------------------------------------------------
// Database insertion
// ---------------------------------------------------------------------------

interface BuildingRow {
  osm_id: number // reused for mtk_id
  geometry: string
  building_type: string
  floor_count: number | null
  construction_year: null // MML doesn't have this, Ryhti fills it later
}

function featureToRow(feature: MMLFeature): BuildingRow | null {
  if (!feature.geometry || feature.geometry.type !== 'Polygon') return null
  if (!feature.properties.mtk_id) return null

  const floorCount = feature.properties.kerrosluku
  const validFloors = floorCount != null && floorCount >= 1 && floorCount <= 50
    ? floorCount
    : null

  return {
    osm_id: feature.properties.mtk_id,
    geometry: JSON.stringify(feature.geometry),
    building_type: kohdeluokkaToType(feature.properties.kohdeluokka),
    floor_count: validFloors,
    construction_year: null,
  }
}

async function insertBatch(rows: BuildingRow[]): Promise<number> {
  const { error } = await supabase
    .from('buildings')
    .upsert(rows as unknown as Record<string, unknown>[], {
      onConflict: 'osm_id',
      ignoreDuplicates: true,
    })

  if (error) {
    console.error(`  Batch insert error: ${error.message}`)
    return 0
  }
  return rows.length
}

// ---------------------------------------------------------------------------
// City import
// ---------------------------------------------------------------------------

async function importBuildingsForCity(city: CityConfig): Promise<number> {
  console.log(`\n${city.name}: bbox [${city.bbox.join(', ')}]`)

  const features = await fetchAllBuildingsInBbox(city.bbox)
  console.log(`  ${features.length} residential buildings fetched`)

  if (features.length === 0) return 0

  // Deduplicate by mtk_id (MML shouldn't have dupes, but be safe)
  const seen = new Set<number>()
  const unique = features.filter((f) => {
    const id = f.properties.mtk_id
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })

  if (unique.length < features.length) {
    console.log(`  Deduped: ${features.length} → ${unique.length}`)
  }

  // Insert in batches
  let inserted = 0

  for (let i = 0; i < unique.length; i += INSERT_BATCH_SIZE) {
    const batch = unique.slice(i, i + INSERT_BATCH_SIZE)
    const rows = batch.map(featureToRow).filter(Boolean) as BuildingRow[]

    if (rows.length > 0) {
      inserted += await insertBatch(rows)
    }

    if ((i + INSERT_BATCH_SIZE) % 5000 === 0 || i + INSERT_BATCH_SIZE >= unique.length) {
      console.log(
        `  Progress: ${Math.min(i + INSERT_BATCH_SIZE, unique.length)}/${unique.length} (${inserted} inserted)`
      )
    }
  }

  console.log(`  Inserted ${inserted} buildings for ${city.name}`)
  return inserted
}

// ---------------------------------------------------------------------------
// Spatial join (same as OSM script)
// ---------------------------------------------------------------------------

async function assignAreasAndCentroids() {
  console.log('\nAssigning buildings to postal code areas (spatial join)...')
  console.log('This may take a few minutes...')

  const { data, error } = await supabase.rpc('assign_buildings_to_areas')

  if (error) {
    console.error('RPC assign_buildings_to_areas failed:', error.message)
    console.log('\nRun these SQL commands in the Supabase SQL editor:')
    console.log(
      "  UPDATE buildings SET centroid = ST_Centroid(geometry) WHERE centroid IS NULL;\n" +
      '  UPDATE buildings b SET area_id = a.id FROM areas a WHERE ST_Contains(a.geometry, b.centroid) AND b.area_id IS NULL;\n' +
      "  UPDATE buildings SET footprint_area_sqm = ST_Area(geometry::geography) WHERE footprint_area_sqm IS NULL;"
    )
    return
  }

  console.log('Spatial join result:', data)
}

// ---------------------------------------------------------------------------
// Municipality bboxes (for --all mode)
// ---------------------------------------------------------------------------

async function fetchMunicipalityBboxes(): Promise<CityConfig[]> {
  console.log('Fetching municipality bboxes from areas table...')

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
    }
    if (!coords) continue
    if (!groups.has(mun)) groups.set(mun, [])
    groups.get(mun)!.push(coords)
  }

  const configs: CityConfig[] = []
  for (const [municipality, centroids] of groups) {
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
    for (const [lng, lat] of centroids) {
      minLng = Math.min(minLng, lng)
      minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng)
      maxLat = Math.max(maxLat, lat)
    }

    const buf = 0.05
    configs.push({
      name: municipality,
      postalPrefixes: [],
      bbox: [minLng - buf, minLat - buf, maxLng + buf, maxLat + buf],
    })
  }

  console.log(`  Found ${configs.length} municipalities with postal areas`)
  return configs
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Building Import (MML Maastotietokanta) ===\n')
  console.log(`API key: ${MML_API_KEY!.slice(0, 8)}...`)
  console.log(`Residential classes: ${[...RESIDENTIAL_CLASSES].join(', ')}`)

  if (CLEAN_MODE) {
    console.log('\n⚠️  CLEAN MODE: Deleting all existing buildings...')
    const { error } = await supabase.from('buildings').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (error) {
      console.error('Failed to clear buildings:', error.message)
      process.exit(1)
    }
    console.log('  All buildings deleted.')
  }

  const cities = IMPORT_ALL
    ? [...CITIES, ...(await fetchMunicipalityBboxes())]
    : CITIES

  // Deduplicate cities by name
  const seen = new Set<string>()
  const uniqueCities = cities.filter((c) => {
    if (seen.has(c.name)) return false
    seen.add(c.name)
    return true
  })

  console.log(`\nImporting ${uniqueCities.length} areas...\n`)

  let totalInserted = 0

  for (let i = 0; i < uniqueCities.length; i++) {
    const city = uniqueCities[i]
    console.log(`[${i + 1}/${uniqueCities.length}]`)

    const count = await importBuildingsForCity(city)
    totalInserted += count
  }

  if (totalInserted > 0) {
    await assignAreasAndCentroids()
  }

  console.log(`\n=== Import complete: ${totalInserted} buildings from ${uniqueCities.length} areas ===`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
