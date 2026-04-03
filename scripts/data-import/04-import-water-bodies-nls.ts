/**
 * Script 04-nls: Import water body geometries from NLS (Maanmittauslaitos)
 * INSPIRE Hydrography API.
 *
 * Replaces the OSM Overpass-based import with accurate NLS polygon data.
 * NLS standingwater collection provides precise lake boundaries from the
 * Finnish national land survey — no simplification artifacts.
 *
 * Sea polygons are kept from the existing OSM data (NLS doesn't provide
 * sea area polygons, only coastline LineStrings).
 *
 * After importing, computes distance from each building to nearest
 * water body using PostGIS spatial functions (migration 013 logic).
 *
 * Prerequisites:
 *   - Script 03 must be run first (buildings in database)
 *   - Run supabase/migrations/002_building_functions.sql
 *   - Run supabase/migrations/013_water_distance_lake_sea_only.sql
 *
 * Usage:
 *   npx tsx scripts/data-import/04-import-water-bodies-nls.ts
 *   npx tsx scripts/data-import/04-import-water-bodies-nls.ts --distances-only
 *   npx tsx scripts/data-import/04-import-water-bodies-nls.ts --all
 */

import { supabase } from './lib/supabaseAdmin'
import { CITIES } from './config'
import { sleep } from './lib/pxwebClient'
import { config } from 'dotenv'
import { resolve } from 'path'
import pg from 'pg'

// Load env for direct pg connection
config({ path: resolve(__dirname, '../../.env.local') })

/**
 * Get a direct pg client for SQL operations that Supabase client can't do.
 */
function getPgClient(): pg.Client {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL in .env.local — needed for post-processing SQL')
  }
  return new pg.Client({ connectionString: databaseUrl })
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NLS_API =
  'https://avoin-paikkatieto.maanmittauslaitos.fi/inspire-hydrography/features/v1/collections/standingwater/items'

/** Max features per API request */
const PAGE_SIZE = 5000

/** Delay between API pages (ms) */
const API_DELAY_MS = 300

/** Whether to import for ALL municipalities (not just target cities) */
const IMPORT_ALL = process.argv.includes('--all')

/** Minimum lake area in m² to keep (1 hectare = 10,000 m²) */
const MIN_LAKE_AREA_SQM = 10000

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NlsFeature {
  type: 'Feature'
  id: string
  properties: {
    InspireId_localId: string
    localType: string // 'järvi' etc.
    persistence: string
    elevation: number | null
    surfaceArea: number | null
    [key: string]: unknown
  }
  geometry: {
    type: 'Polygon' | 'MultiPolygon'
    coordinates: number[][][] | number[][][][]
  }
}

interface NlsResponse {
  type: 'FeatureCollection'
  features: NlsFeature[]
  links?: Array<{ rel: string; href: string; type?: string }>
  numberReturned?: number
  numberMatched?: number
}

// ---------------------------------------------------------------------------
// API fetch with pagination
// ---------------------------------------------------------------------------

async function fetchNlsPage(url: string): Promise<NlsResponse> {
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
        throw new Error(`NLS API error ${response.status}: ${text.slice(0, 300)}`)
      }

      return response.json() as Promise<NlsResponse>
    } catch (err) {
      if (attempt === 3) throw err
      console.log(`  Attempt ${attempt} failed, retrying...`)
      await sleep(5000 * attempt)
    }
  }
  throw new Error('NLS API fetch failed')
}

/**
 * Fetch all standingwater features within a bbox.
 * Uses cursor-based pagination via 'next' links.
 */
async function fetchStandingWater(
  bbox: [number, number, number, number]
): Promise<NlsFeature[]> {
  const [west, south, east, north] = bbox
  const bboxParam = `${west},${south},${east},${north}`
  const features: NlsFeature[] = []

  // Use CRS84 (lon, lat axis order) to match GeoJSON convention.
  // EPSG:4326 has (lat, lon) per OGC standard — would produce swapped coordinates.
  let url: string | null =
    `${NLS_API}?limit=${PAGE_SIZE}&bbox=${bboxParam}&crs=http://www.opengis.net/def/crs/OGC/1.3/CRS84`
  let pageNum = 0

  while (url) {
    pageNum++
    const data = await fetchNlsPage(url)
    const count = data.features?.length ?? 0
    features.push(...(data.features ?? []))

    if (pageNum % 5 === 0 || count < PAGE_SIZE) {
      console.log(`    Page ${pageNum}: +${count} features (total: ${features.length})`)
    }

    // Find 'next' link for pagination
    const nextLink = data.links?.find((l) => l.rel === 'next')
    if (nextLink?.href && count > 0) {
      // MML sometimes double-encodes bbox in next links
      url = decodeURIComponent(nextLink.href)
      await sleep(API_DELAY_MS)
    } else {
      url = null
    }
  }

  return features
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * Wrap a Polygon or MultiPolygon into MultiPolygon format for storage.
 */
function toMultiPolygon(
  geometry: { type: string; coordinates: number[][][] | number[][][][] }
): { type: 'MultiPolygon'; coordinates: number[][][][] } {
  if (geometry.type === 'MultiPolygon') {
    return { type: 'MultiPolygon', coordinates: geometry.coordinates as number[][][][] }
  }
  // Wrap single Polygon in MultiPolygon
  return { type: 'MultiPolygon', coordinates: [geometry.coordinates as number[][][]] }
}

// ---------------------------------------------------------------------------
// Municipality bbox fetcher (same as OSM script)
// ---------------------------------------------------------------------------

async function fetchMunicipalityBboxes(): Promise<
  Array<{ name: string; bbox: [number, number, number, number] }>
> {
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
    let minLng = Infinity,
      minLat = Infinity,
      maxLng = -Infinity,
      maxLat = -Infinity
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

// ---------------------------------------------------------------------------
// Main import
// ---------------------------------------------------------------------------

async function importWaterBodies(): Promise<number> {
  // Determine bboxes to query
  const queryAreas: Array<{ name: string; bbox: [number, number, number, number] }> = []

  if (IMPORT_ALL) {
    console.log('Fetching municipality bboxes for Finland-wide water import...\n')
    const munBboxes = await fetchMunicipalityBboxes()
    queryAreas.push(...munBboxes)
    console.log(`Will query NLS standingwater for ${queryAreas.length} municipalities\n`)
  } else {
    for (const city of CITIES) {
      queryAreas.push({ name: city.name, bbox: city.bbox })
    }
    console.log(`Querying NLS standingwater for ${queryAreas.length} cities...\n`)
  }

  // Collect all features, deduplicate by NLS ID
  const allWater = new Map<
    string,
    {
      nlsId: string
      name: string | null
      waterType: string
      geometry: { type: 'MultiPolygon'; coordinates: number[][][][] }
    }
  >()

  for (let qi = 0; qi < queryAreas.length; qi++) {
    const area = queryAreas[qi]
    const [west, south, east, north] = area.bbox

    // Add ~5km buffer to catch lakes near edges
    const buf = 0.05
    const bufferedBbox: [number, number, number, number] = [
      west - buf,
      south - buf,
      east + buf,
      north + buf,
    ]

    console.log(
      `[${qi + 1}/${queryAreas.length}] ${area.name}: bbox [${bufferedBbox.map((v) => v.toFixed(2)).join(', ')}]`
    )

    const features = await fetchStandingWater(bufferedBbox)
    console.log(`  ${features.length} standingwater features received`)

    let added = 0
    for (const feature of features) {
      const id = feature.properties?.InspireId_localId ?? feature.id
      if (!id || allWater.has(String(id))) continue
      if (!feature.geometry) continue

      const multiPoly = toMultiPolygon(feature.geometry)

      allWater.set(String(id), {
        nlsId: String(id),
        name: null, // NLS standingwater doesn't have name in standard properties
        waterType: 'lake', // All standingwater features are lakes
        geometry: multiPoly,
      })
      added++
    }

    console.log(`  ${added} new lakes added (total unique: ${allWater.size})`)

    // Brief delay between areas
    if (qi < queryAreas.length - 1) {
      await sleep(1000)
    }
  }

  console.log(`\nTotal unique lakes from NLS: ${allWater.size}`)

  // Preserve existing sea polygons
  console.log('\nPreserving existing sea polygons...')
  const { data: seaData, error: seaError } = await supabase
    .from('water_bodies')
    .select('id, name, water_type, geometry')
    .eq('water_type', 'sea')

  const seaCount = seaData?.length ?? 0
  console.log(`  Found ${seaCount} sea polygons to preserve`)

  // Delete all lake water bodies (keep sea)
  console.log('\nDeleting existing lake water bodies...')
  const { error: deleteError } = await supabase
    .from('water_bodies')
    .delete()
    .eq('water_type', 'lake')

  if (deleteError) {
    console.error('Failed to delete existing lakes:', deleteError.message)
    // Also try deleting all other non-sea types (pond, river, reservoir from old imports)
  }

  // Also delete leftover non-lake non-sea types from old OSM import
  const { error: deleteOtherError } = await supabase
    .from('water_bodies')
    .delete()
    .not('water_type', 'eq', 'sea')

  if (deleteOtherError) {
    console.error('Failed to delete other water types:', deleteOtherError.message)
  }

  console.log('  Cleared existing lake water bodies')

  // Insert NLS lakes in batches
  const waterList = Array.from(allWater.values())
  let inserted = 0
  const BATCH_SIZE = 50 // Smaller batches — NLS polygons can be large

  for (let i = 0; i < waterList.length; i += BATCH_SIZE) {
    const batch = waterList.slice(i, i + BATCH_SIZE)

    const rows = batch.map((w) => ({
      name: w.name,
      water_type: w.waterType,
      geometry: JSON.stringify(w.geometry),
    }))

    const { error } = await supabase.from('water_bodies').insert(rows)

    if (error) {
      console.error(`  Batch error at ${i}: ${error.message}`)
    } else {
      inserted += rows.length
    }

    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= waterList.length) {
      console.log(
        `  Progress: ${Math.min(i + BATCH_SIZE, waterList.length)}/${waterList.length} (inserted: ${inserted})`
      )
    }
  }

  console.log(`\nInserted ${inserted} NLS lakes + ${seaCount} preserved sea polygons`)
  return inserted
}

// ---------------------------------------------------------------------------
// Post-import: compute areas, filter, simplify, project
// ---------------------------------------------------------------------------

async function postProcessWaterBodies(): Promise<void> {
  console.log('\n=== Post-processing water bodies ===\n')

  const client = getPgClient()
  try {
    await client.connect()
    await client.query("SET statement_timeout = '600s'")

    // Step 1: Compute areas for new lakes (area_sqm IS NULL)
    console.log('Computing lake areas...')
    const areaResult = await client.query(
      `UPDATE water_bodies SET area_sqm = ST_Area(geometry::geography) WHERE area_sqm IS NULL`
    )
    console.log(`  Computed area for ${areaResult.rowCount} water bodies`)

    // Step 2: Delete small lakes (< 1 hectare)
    console.log(`Filtering lakes < ${MIN_LAKE_AREA_SQM / 10000} hectare...`)
    const deleteResult = await client.query(
      `DELETE FROM water_bodies WHERE water_type = 'lake' AND area_sqm < $1`,
      [MIN_LAKE_AREA_SQM]
    )
    console.log(`  Removed ${deleteResult.rowCount} small lakes`)

    // Step 3: Simplify and project geometries
    console.log('Simplifying geometries...')
    const simplifyResult = await client.query(
      `UPDATE water_bodies SET geometry_simplified = ST_Simplify(geometry, 0.0005) WHERE geometry_simplified IS NULL`
    )
    console.log(`  Simplified ${simplifyResult.rowCount} water bodies`)

    console.log('Projecting to EPSG:3067...')
    const projectResult = await client.query(
      `UPDATE water_bodies SET geometry_3067 = ST_Transform(COALESCE(geometry_simplified, geometry), 3067) WHERE geometry_3067 IS NULL`
    )
    console.log(`  Projected ${projectResult.rowCount} water bodies`)

    // Check final counts
    const countResult = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE water_type = 'lake') AS lakes,
        COUNT(*) FILTER (WHERE water_type = 'sea') AS sea
      FROM water_bodies
    `)
    const counts = countResult.rows[0]
    console.log(`\nFinal water body counts:`)
    console.log(`  Lakes (>= 1ha): ${counts.lakes}`)
    console.log(`  Sea: ${counts.sea}`)
    console.log(`  Total: ${counts.total}`)
  } finally {
    await client.end()
  }
}

// ---------------------------------------------------------------------------
// Water distance computation (same as existing script)
// ---------------------------------------------------------------------------

async function computeWaterDistances(): Promise<void> {
  console.log('\n=== Computing water distances ===\n')

  // Reset all water distances using pg (Supabase client can't do bulk UPDATE)
  console.log('Resetting existing water distances...')
  const client = getPgClient()
  try {
    await client.connect()
    await client.query("SET statement_timeout = '600s'")
    const resetResult = await client.query(
      `UPDATE buildings SET min_distance_to_water_m = NULL WHERE area_id IS NOT NULL`
    )
    console.log(`  Reset ${resetResult.rowCount} buildings`)
  } finally {
    await client.end()
  }

  const { count } = await supabase
    .from('buildings')
    .select('id', { count: 'estimated', head: true })
    .not('area_id', 'is', null)
    .is('min_distance_to_water_m', null)

  console.log(`Buildings needing water distance: ${count ?? 'unknown'}`)

  let totalUpdated = 0
  let batchNum = 0

  while (true) {
    batchNum++

    const { data, error } = await supabase.rpc('compute_water_distances_batch', {
      p_limit: 500,
    })

    if (error) {
      console.error('RPC compute_water_distances_batch failed:', error.message)
      console.log('\nYou may need to run the post-processing SQL manually first.')
      console.log('See migration 013 for the batch function definition.')
      break
    }

    const batchCount = typeof data === 'number' ? data : 0
    if (batchCount === 0) break

    totalUpdated += batchCount

    if (batchNum % 100 === 0 || batchCount < 500) {
      console.log(
        `  Batch ${batchNum}: +${batchCount} (total: ${totalUpdated}${count ? `/${count}` : ''})`
      )
    }
  }

  console.log(`\nWater distances computed for ${totalUpdated} buildings`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const distancesOnly = process.argv.includes('--distances-only')

  if (distancesOnly) {
    console.log('=== Recompute Water Distances Only ===\n')
    await computeWaterDistances()
  } else {
    console.log('=== Water Bodies Import (NLS INSPIRE Hydrography) ===\n')
    console.log('Source: Maanmittauslaitos INSPIRE standingwater')
    console.log('Lakes: NLS (accurate polygons)')
    console.log('Sea: Preserved from existing data\n')

    await importWaterBodies()
    await postProcessWaterBodies()
    await computeWaterDistances()
  }

  console.log('\n=== Complete ===')
  console.log('\nNext steps:')
  console.log('  1. Reset building prices: UPDATE buildings SET estimation_year = NULL;')
  console.log('  2. Recompute: npx tsx scripts/data-import/05-compute-building-prices.ts')
  console.log('  3. Bump TILE_VERSION in MapContainer.tsx')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
