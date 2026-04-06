/**
 * Script 03: Import building outlines from OpenStreetMap via Overpass API.
 *
 * Queries the Overpass API for building ways within each city's bounding box.
 * No local files, GDAL, or PBF downloads needed.
 *
 * After inserting buildings, runs a spatial join via PostGIS to assign
 * each building to its postal code area and computes centroids.
 *
 * Prerequisites:
 *   - Scripts 01 must be run first (areas in database)
 *   - Run supabase/migrations/002_building_functions.sql in SQL Editor
 *
 * Usage: npx tsx scripts/data-import/03-import-buildings.ts
 */

import { supabase } from './lib/supabaseAdmin'
import { CITIES, type CityConfig } from './config'
import { sleep } from './lib/pxwebClient'
import {
  NON_RESIDENTIAL_BUILDING_TYPES_SET,
  IMPORT_ONLY_EXCLUDED_TYPES,
} from '../../app/lib/buildingClassification'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

/** Whether to import buildings for ALL Finnish postal areas (not just target cities) */
const IMPORT_ALL = process.argv.includes('--all')

/** Non-residential building types to exclude at import time.
 *  Combines the shared denylist with import-only niche types. */
const EXCLUDED_BUILDING_TYPES = new Set([
  ...NON_RESIDENTIAL_BUILDING_TYPES_SET,
  ...IMPORT_ONLY_EXCLUDED_TYPES,
])

interface OverpassElement {
  type: 'way' | 'relation' | 'node'
  id: number
  tags?: Record<string, string>
  geometry?: Array<{ lat: number; lon: number }>
}

/**
 * Query the Overpass API with retry logic for rate limiting.
 */
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
        throw new Error(`Overpass API error ${response.status}: ${text.slice(0, 300)}`)
      }

      return response.json()
    } catch (err) {
      if (attempt === 3) throw err
      console.log(`  Attempt ${attempt} failed, retrying in ${10 * attempt}s...`)
      await sleep(10000 * attempt)
    }
  }

  throw new Error('Overpass query failed after all retries')
}

/**
 * Convert Overpass way geometry [{lat,lon},...] to GeoJSON Polygon.
 */
function wayToPolygon(
  geometry: Array<{ lat: number; lon: number }>
): { type: 'Polygon'; coordinates: number[][][] } | null {
  if (!geometry || geometry.length < 4) return null

  const ring = geometry.map((p) => [p.lon, p.lat])

  // Ensure closed ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]])
  }

  return { type: 'Polygon', coordinates: [ring] }
}

function parseConstructionYear(tags: Record<string, string>): number | null {
  const raw = tags['start_date'] || tags['building:year'] || null
  if (!raw) return null

  const match = String(raw).match(/(\d{4})/)
  if (match) {
    const year = parseInt(match[1], 10)
    if (year >= 1800 && year <= 2030) return year
  }
  return null
}

function parseFloorCount(tags: Record<string, string>): number | null {
  const raw = tags['building:levels'] || tags['levels'] || null
  if (!raw) return null

  const num = parseInt(String(raw), 10)
  if (num >= 1 && num <= 50) return num
  return null
}

function parseAddress(tags: Record<string, string>): string | null {
  const street = tags['addr:street']
  const number = tags['addr:housenumber']

  if (street && number) return `${street} ${number}`
  if (street) return street
  return null
}

async function importBuildingsForCity(city: CityConfig): Promise<number> {
  const [west, south, east, north] = city.bbox

  console.log(`\n${city.name}: bbox [${west}, ${south}, ${east}, ${north}]`)

  // Overpass bbox format: (south, west, north, east)
  const query = `
    [out:json][timeout:300];
    way["building"](${south},${west},${north},${east});
    out body geom;
  `

  const data = await queryOverpass(query)
  console.log(`  Received ${data.elements.length} building elements`)

  // Filter: ways only, with geometry, exclude non-residential
  const buildings = data.elements.filter((el) => {
    if (el.type !== 'way') return false
    if (!el.geometry || el.geometry.length < 4) return false

    const buildingType = el.tags?.building
    if (!buildingType) return false
    if (EXCLUDED_BUILDING_TYPES.has(buildingType)) return false

    return true
  })

  console.log(`  ${buildings.length} residential buildings after filtering`)

  // Insert in batches
  let inserted = 0
  const BATCH_SIZE = 200

  for (let i = 0; i < buildings.length; i += BATCH_SIZE) {
    const batch = buildings.slice(i, i + BATCH_SIZE)

    const rows = batch
      .map((el) => {
        const polygon = wayToPolygon(el.geometry!)
        if (!polygon) return null

        const tags = el.tags ?? {}

        return {
          osm_id: el.id,
          geometry: JSON.stringify(polygon),
          building_type: tags.building ?? 'yes',
          construction_year: parseConstructionYear(tags),
          floor_count: parseFloorCount(tags),
          address: parseAddress(tags),
        }
      })
      .filter(Boolean)

    if (rows.length === 0) continue

    const { error } = await supabase
      .from('buildings')
      .upsert(rows as Record<string, unknown>[], {
        onConflict: 'osm_id',
        ignoreDuplicates: true,
      })

    if (error) {
      console.error(`  Batch error at ${i}: ${error.message}`)
    } else {
      inserted += rows.length
    }

    if ((i + BATCH_SIZE) % 2000 === 0 || i + BATCH_SIZE >= buildings.length) {
      console.log(
        `  Progress: ${Math.min(i + BATCH_SIZE, buildings.length)}/${buildings.length} (${inserted} inserted)`
      )
    }
  }

  console.log(`  Inserted ${inserted} buildings for ${city.name}`)
  return inserted
}

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

/**
 * Fetch all municipality bboxes from the areas table, grouped by municipality.
 * Returns one CityConfig per municipality with bbox derived from postal area centroids.
 */
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

  // Group centroids by municipality
  const groups = new Map<string, Array<[number, number]>>()
  for (const row of data) {
    const mun = row.municipality as string
    if (!mun) continue

    // Parse centroid (GeoJSON Point or WKT)
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

  // Build CityConfig per municipality
  const configs: CityConfig[] = []
  for (const [municipality, centroids] of groups) {
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
    for (const [lng, lat] of centroids) {
      minLng = Math.min(minLng, lng)
      minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng)
      maxLat = Math.max(maxLat, lat)
    }

    // Add buffer (~5km) to catch buildings at edges
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

/**
 * Split a large bbox into tiles of max ~0.5° × 0.5° to avoid Overpass timeouts.
 */
function splitBbox(bbox: [number, number, number, number], maxDeg = 0.5): Array<[number, number, number, number]> {
  const [west, south, east, north] = bbox
  const width = east - west
  const height = north - south

  if (width <= maxDeg && height <= maxDeg) return [bbox]

  const tiles: Array<[number, number, number, number]> = []
  const cols = Math.ceil(width / maxDeg)
  const rows = Math.ceil(height / maxDeg)
  const stepLng = width / cols
  const stepLat = height / rows

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      tiles.push([
        west + c * stepLng,
        south + r * stepLat,
        west + (c + 1) * stepLng,
        south + (r + 1) * stepLat,
      ])
    }
  }

  return tiles
}

async function importBuildingsForMunicipality(city: CityConfig): Promise<number> {
  const tiles = splitBbox(city.bbox)

  if (tiles.length > 1) {
    console.log(`  Splitting ${city.name} into ${tiles.length} tiles`)
  }

  let totalInserted = 0

  for (let ti = 0; ti < tiles.length; ti++) {
    const tile = tiles[ti]
    if (tiles.length > 1) {
      console.log(`  Tile ${ti + 1}/${tiles.length}`)
    }

    const count = await importBuildingsForCity({
      name: `${city.name}${tiles.length > 1 ? ` (tile ${ti + 1})` : ''}`,
      postalPrefixes: [],
      bbox: tile,
    })
    totalInserted += count

    // Rate limit between tiles
    if (ti < tiles.length - 1) {
      await sleep(5000)
    }
  }

  return totalInserted
}

async function main() {
  console.log('=== Building Import (Overpass API) ===\n')

  if (IMPORT_ALL) {
    console.log('MODE: Importing ALL Finnish municipalities (--all flag)\n')

    // Fetch bboxes from areas table
    const municipalities = await fetchMunicipalityBboxes()

    // Skip municipalities that overlap with existing CITIES (already imported)
    const existingNames = new Set(CITIES.map((c) => c.name))
    // Also skip Helsinki metro sub-cities
    const metroNames = new Set(['Helsinki', 'Espoo', 'Vantaa', 'Kauniainen'])
    const toImport = municipalities.filter(
      (m) => !existingNames.has(m.name) && !metroNames.has(m.name)
    )

    console.log(`  ${toImport.length} new municipalities to import (${municipalities.length - toImport.length} already covered by CITIES)\n`)

    let totalInserted = 0
    for (let i = 0; i < toImport.length; i++) {
      const mun = toImport[i]
      console.log(`\n[${i + 1}/${toImport.length}] ${mun.name}`)

      const count = await importBuildingsForMunicipality(mun)
      totalInserted += count

      // Respect Overpass rate limits
      if (i < toImport.length - 1) {
        console.log('  Waiting 15s for Overpass rate limit...')
        await sleep(15000)
      }
    }

    if (totalInserted > 0) {
      await assignAreasAndCentroids()
    }

    console.log(`\n=== Import complete: ${totalInserted} buildings from ${toImport.length} municipalities ===`)
  } else {
    console.log('MODE: Importing target cities only (use --all for all Finland)\n')

    let totalInserted = 0

    for (const city of CITIES) {
      const count = await importBuildingsForCity(city)
      totalInserted += count

      // Respect Overpass rate limits — wait between cities
      if (CITIES.indexOf(city) < CITIES.length - 1) {
        console.log('  Waiting 15s for Overpass rate limit...')
        await sleep(15000)
      }
    }

    if (totalInserted > 0) {
      await assignAreasAndCentroids()
    }

    console.log(`\n=== Import complete: ${totalInserted} buildings ===`)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
