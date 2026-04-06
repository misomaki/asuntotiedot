/**
 * Script 06: Enrich OSM buildings with Ryhti (SYKE) registry data.
 *
 * Fetches building attributes from the national Ryhti building registry
 * (OGC API Features, CC BY 4.0) and matches them to existing OSM buildings
 * by spatial proximity (nearest point within 50m of building centroid).
 *
 * Key enrichment:
 *   - completion_date → construction_year  (~100% coverage vs OSM's ~12%)
 *   - number_of_storeys → floor_count
 *
 * Deduplication: Ryhti may contain multiple points for the same physical
 * building (e.g. multiple addresses). We keep only one record per
 * permanent_building_identifier (the most recently modified).
 *
 * After enrichment, buildings are marked for price re-estimation
 * (estimation_year = NULL), so script 05 should be re-run.
 *
 * Prerequisites:
 *   - Scripts 01-05 must be run first
 *   - Run supabase/migrations/003_ryhti_enrichment.sql in SQL Editor
 *
 * Usage: npx tsx scripts/data-import/06-enrich-from-ryhti.ts
 */

import { supabase } from './lib/supabaseAdmin'
import { CITIES, type CityConfig } from './config'
import { sleep } from './lib/pxwebClient'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RYHTI_API =
  'https://paikkatiedot.ymparisto.fi/geoserver/ryhti_building/ogc/features/v1/collections/open_building/items'

/** Max features per API request (GeoServer typical max ~10000) */
const PAGE_SIZE = 5000

/** Max records per staging insert RPC call */
const INSERT_BATCH_SIZE = 500

/** Delay between API pages (ms) */
const API_DELAY_MS = 500

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RyhtiRecord {
  id: string // permanent_building_identifier
  year: number | null // parsed from completion_date
  storeys: number | null // number_of_storeys
  purpose: string | null // main_purpose
  apartments: number | null
  energyClass: string | null // energy_class (A-G)
  floorArea: number | null // floor_area (kerrosala, m²)
  lng: number
  lat: number
  modifiedAt: string | null
}

interface RyhtiFeatureProperties {
  permanent_building_identifier: string | null
  completion_date: string | null
  number_of_storeys: number | null
  main_purpose: string | null
  apartment_count: number | null
  energy_class: string | null
  floor_area: number | null // kerrosala (m²)
  modified_timestamp_utc: string | null
}

interface RyhtiFeature {
  type: 'Feature'
  properties: RyhtiFeatureProperties
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  } | null
}

interface RyhtiResponse {
  type: 'FeatureCollection'
  features: RyhtiFeature[]
  numberReturned: number
  numberMatched?: number
}

// ---------------------------------------------------------------------------
// Ryhti API fetching
// ---------------------------------------------------------------------------

/**
 * Parse completion_date string (e.g. "1920-01-01Z") into a year number.
 */
function parseCompletionYear(dateStr: string | null): number | null {
  if (!dateStr) return null
  const match = dateStr.match(/(\d{4})/)
  if (!match) return null
  const year = parseInt(match[1], 10)
  if (year >= 1800 && year <= 2030) return year
  return null
}

/**
 * Fetch a single page from the Ryhti OGC API Features endpoint.
 * Uses startIndex for pagination (GeoServer OGC API Features).
 */
async function fetchRyhtiPage(
  bbox: [number, number, number, number],
  startIndex: number
): Promise<RyhtiResponse> {
  const [west, south, east, north] = bbox
  const url = `${RYHTI_API}?f=json&limit=${PAGE_SIZE}&startIndex=${startIndex}&bbox=${west},${south},${east},${north}`

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url)

      if (response.status === 429 || response.status === 503) {
        const wait = 15000 * attempt
        console.log(`    Rate limited (${response.status}), waiting ${wait / 1000}s...`)
        await sleep(wait)
        continue
      }

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Ryhti API error ${response.status}: ${text.slice(0, 300)}`)
      }

      return response.json()
    } catch (err) {
      if (attempt === 3) throw err
      console.log(`    Attempt ${attempt} failed, retrying...`)
      await sleep(5000 * attempt)
    }
  }
  throw new Error('Ryhti API query failed')
}

/**
 * Fetch all Ryhti buildings within a bounding box, with pagination.
 * Deduplicates by permanent_building_identifier, keeping the most
 * recently modified record.
 */
async function fetchRyhtiForBbox(
  bbox: [number, number, number, number]
): Promise<Map<string, RyhtiRecord>> {
  const buildings = new Map<string, RyhtiRecord>()
  let startIndex = 0
  let pageNum = 0
  let totalAvailable = 0

  while (true) {
    pageNum++
    const data = await fetchRyhtiPage(bbox, startIndex)
    const features = data.features ?? []

    if (features.length === 0) break

    if (pageNum === 1 && data.numberMatched) {
      totalAvailable = data.numberMatched
      console.log(`    Total available: ${totalAvailable}`)
    }

    let added = 0
    for (const f of features) {
      const props = f.properties
      const id = props?.permanent_building_identifier
      if (!id) continue

      const coords = f.geometry?.coordinates
      if (!coords || coords.length < 2) continue

      const [lng, lat] = coords

      // Sanity check: coordinates should be WGS84
      if (lng > 180 || lat > 90 || lng < 0 || lat < 0) continue

      // Deduplicate: keep the most recently modified record
      const existing = buildings.get(id)
      if (existing) {
        const existingTime = existing.modifiedAt ?? ''
        const newTime = props.modified_timestamp_utc ?? ''
        if (newTime <= existingTime) continue
      }

      buildings.set(id, {
        id,
        year: parseCompletionYear(props.completion_date),
        storeys: props.number_of_storeys,
        purpose: props.main_purpose,
        apartments: props.apartment_count,
        energyClass: props.energy_class,
        floorArea: props.floor_area,
        lng,
        lat,
        modifiedAt: props.modified_timestamp_utc,
      })
      added++
    }

    if (pageNum % 10 === 0 || features.length < PAGE_SIZE) {
      const pct = totalAvailable > 0
        ? ` (${Math.round((startIndex + features.length) / totalAvailable * 100)}%)`
        : ''
      console.log(
        `    Page ${pageNum}: +${features.length} features, ${added} new unique (total: ${buildings.size})${pct}`
      )
    }

    if (features.length < PAGE_SIZE) break

    startIndex += PAGE_SIZE
    await sleep(API_DELAY_MS)
  }

  return buildings
}

// ---------------------------------------------------------------------------
// Staging table operations
// ---------------------------------------------------------------------------

/**
 * Insert Ryhti records into the staging table via RPC batch function.
 */
async function insertIntoStaging(records: RyhtiRecord[]): Promise<number> {
  let inserted = 0

  for (let i = 0; i < records.length; i += INSERT_BATCH_SIZE) {
    const batch = records.slice(i, i + INSERT_BATCH_SIZE)

    const payload = batch.map((r) => ({
      id: r.id,
      year: r.year,
      storeys: r.storeys,
      purpose: r.purpose,
      apartments: r.apartments,
      energyClass: r.energyClass,
      floorArea: r.floorArea,
      lng: r.lng,
      lat: r.lat,
    }))

    const { data, error } = await supabase.rpc('insert_ryhti_batch', {
      p_buildings: payload,
    })

    if (error) {
      console.error(`  Staging insert error at ${i}: ${error.message}`)
    } else {
      inserted += typeof data === 'number' ? data : 0
    }

    if ((i + INSERT_BATCH_SIZE) % 5000 === 0 || i + INSERT_BATCH_SIZE >= records.length) {
      console.log(
        `  Staging progress: ${Math.min(i + INSERT_BATCH_SIZE, records.length)}/${records.length} (${inserted} inserted)`
      )
    }
  }

  return inserted
}

// ---------------------------------------------------------------------------
// Matching: construction_year + floor_count
// ---------------------------------------------------------------------------

async function matchConstructionYears(): Promise<number> {
  console.log('\nMatching construction years (buildings missing year)...')

  // Count buildings needing year
  const { count } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('area_id', 'is', null)
    .is('construction_year', null)

  console.log(`Buildings without construction_year: ${count}`)

  if (!count || count === 0) return 0

  let totalMatched = 0
  let batchNum = 0

  while (true) {
    batchNum++

    const { data, error } = await supabase.rpc('match_ryhti_to_buildings_batch', {
      p_limit: 500,
    })

    if (error) {
      console.error('RPC match_ryhti_to_buildings_batch failed:', error.message)
      break
    }

    const batchCount = typeof data === 'number' ? data : 0
    if (batchCount === 0) break

    totalMatched += batchCount

    if (batchNum % 20 === 0 || batchCount < 500) {
      const pct = Math.round((totalMatched / count) * 100)
      console.log(
        `  Batch ${batchNum}: +${batchCount} (total: ${totalMatched}/${count}, ${pct}%)`
      )
    }
  }

  console.log(`Matched construction_year for ${totalMatched} buildings`)
  return totalMatched
}

async function matchFloorCounts(): Promise<number> {
  console.log('\nMatching floor counts (buildings with year but missing floors)...')

  const { count } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('area_id', 'is', null)
    .not('construction_year', 'is', null)
    .is('floor_count', null)

  console.log(`Buildings with year but without floor_count: ${count}`)

  if (!count || count === 0) return 0

  let totalMatched = 0
  let batchNum = 0

  while (true) {
    batchNum++

    const { data, error } = await supabase.rpc('match_ryhti_floors_batch', {
      p_limit: 500,
    })

    if (error) {
      console.error('RPC match_ryhti_floors_batch failed:', error.message)
      break
    }

    const batchCount = typeof data === 'number' ? data : 0
    if (batchCount === 0) break

    totalMatched += batchCount

    if (batchNum % 20 === 0 || batchCount < 500) {
      const pct = Math.round((totalMatched / count) * 100)
      console.log(
        `  Batch ${batchNum}: +${batchCount} (total: ${totalMatched}/${count}, ${pct}%)`
      )
    }
  }

  console.log(`Matched floor_count for ${totalMatched} buildings`)
  return totalMatched
}

async function matchEnergyAndApartments(): Promise<number> {
  console.log('\nMatching energy class + apartment count...')

  const { count } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('area_id', 'is', null)
    .or('energy_class.is.null,apartment_count.is.null')

  console.log(`Buildings missing energy_class or apartment_count: ${count}`)

  if (!count || count === 0) return 0

  let totalMatched = 0
  let batchNum = 0

  while (true) {
    batchNum++

    const { data, error } = await supabase.rpc('match_ryhti_energy_apartment_batch', {
      p_limit: 500,
    })

    if (error) {
      console.error('RPC match_ryhti_energy_apartment_batch failed:', error.message)
      break
    }

    const batchCount = typeof data === 'number' ? data : 0
    if (batchCount === 0) break

    totalMatched += batchCount

    if (batchNum % 20 === 0 || batchCount < 500) {
      const pct = Math.round((totalMatched / count) * 100)
      console.log(
        `  Batch ${batchNum}: +${batchCount} (total: ${totalMatched}/${count}, ${pct}%)`
      )
    }
  }

  console.log(`Matched energy/apartment data for ${totalMatched} buildings`)
  return totalMatched
}

// ---------------------------------------------------------------------------
// Bbox tile splitting (for large areas that cause Ryhti API timeouts)
// ---------------------------------------------------------------------------

function splitBbox(
  bbox: [number, number, number, number],
  maxDeg = 0.25
): Array<[number, number, number, number]> {
  const [west, south, east, north] = bbox
  const width = east - west
  const height = north - south

  if (width <= maxDeg && height <= maxDeg) return [bbox]

  const cols = Math.ceil(width / maxDeg)
  const rows = Math.ceil(height / maxDeg)
  const stepLng = width / cols
  const stepLat = height / rows
  const tiles: Array<[number, number, number, number]> = []

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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Ryhti Building Registry Enrichment ===\n')

  // Step 1: Clear staging table
  console.log('Clearing staging table...')
  const { error: clearError } = await supabase.rpc('clear_ryhti_staging')
  if (clearError) {
    console.error('Failed to clear staging table:', clearError.message)
    console.log('Make sure migration 003 has been run in SQL Editor.')
    process.exit(1)
  }

  // Step 2: Fetch Ryhti data per city (split large bboxes into tiles)
  const allRecords = new Map<string, RyhtiRecord>()

  for (const city of CITIES) {
    const tiles = splitBbox(city.bbox)
    const tileLabel = tiles.length > 1 ? ` (${tiles.length} tiles)` : ''
    console.log(`\n${city.name}: fetching Ryhti buildings [${city.bbox.join(', ')}]${tileLabel}`)

    for (let ti = 0; ti < tiles.length; ti++) {
      if (tiles.length > 1) {
        console.log(`  Tile ${ti + 1}/${tiles.length}`)
      }

      const tileRecords = await fetchRyhtiForBbox(tiles[ti])

      // Merge into global map (deduplicate across tiles and cities)
      let newCount = 0
      for (const [id, record] of tileRecords) {
        if (!allRecords.has(id)) {
          allRecords.set(id, record)
          newCount++
        }
      }

      if (tiles.length > 1) {
        console.log(`    ${tileRecords.size} fetched, ${newCount} new`)
      }

      // Small delay between tiles
      if (ti < tiles.length - 1) await sleep(1000)
    }

    console.log(`  ${city.name} total unique: ${allRecords.size}`)

    // Rate limit between cities
    if (CITIES.indexOf(city) < CITIES.length - 1) {
      console.log('  Waiting 2s...')
      await sleep(2000)
    }
  }

  // Stats
  const records = Array.from(allRecords.values())
  const withYear = records.filter((r) => r.year !== null).length
  const withStoreys = records.filter((r) => r.storeys !== null).length
  const withEnergy = records.filter((r) => r.energyClass !== null).length
  const withApartments = records.filter((r) => r.apartments !== null).length
  const withFloorArea = records.filter((r) => r.floorArea !== null).length

  console.log(`\n--- Ryhti data summary ---`)
  console.log(`Total unique buildings:   ${allRecords.size}`)
  console.log(`With completion year:     ${withYear} (${Math.round((withYear / allRecords.size) * 100)}%)`)
  console.log(`With floor count:         ${withStoreys} (${Math.round((withStoreys / allRecords.size) * 100)}%)`)
  console.log(`With energy class:        ${withEnergy} (${Math.round((withEnergy / allRecords.size) * 100)}%)`)
  console.log(`With apartment count:     ${withApartments} (${Math.round((withApartments / allRecords.size) * 100)}%)`)
  console.log(`With floor area:          ${withFloorArea} (${Math.round((withFloorArea / allRecords.size) * 100)}%)`)

  // Step 3: Insert into staging table
  console.log(`\nInserting ${allRecords.size} records into staging table...`)
  const recordList = Array.from(allRecords.values())
  const insertedCount = await insertIntoStaging(recordList)
  console.log(`Inserted ${insertedCount} records into staging`)

  // Step 4: Match to buildings
  const yearMatches = await matchConstructionYears()
  const floorMatches = await matchFloorCounts()
  const energyAptMatches = await matchEnergyAndApartments()

  // Step 5: Summary
  const { count: hasYear } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('construction_year', 'is', null)

  const { count: hasFloors } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('floor_count', 'is', null)

  const { count: needsEstimation } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('area_id', 'is', null)
    .is('estimation_year', null)

  const { count: hasEnergy } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('energy_class', 'is', null)

  const { count: hasApartments } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('apartment_count', 'is', null)

  console.log(`\n=== Enrichment complete ===`)
  console.log(`Construction years matched:  ${yearMatches}`)
  console.log(`Floor counts matched:        ${floorMatches}`)
  console.log(`Energy/apartment matched:    ${energyAptMatches}`)
  console.log(`Total buildings with year:   ${hasYear}`)
  console.log(`Total buildings with floors: ${hasFloors}`)
  console.log(`Total buildings with energy: ${hasEnergy}`)
  console.log(`Total buildings with apts:   ${hasApartments}`)
  console.log(`Buildings needing re-estimation: ${needsEstimation}`)
  console.log(`\nRe-run script 05 to recalculate prices with enriched data.`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
