/**
 * Script 03: Import building outlines from OpenStreetMap.
 *
 * Prerequisites:
 * 1. Download Finland OSM extract: https://download.geofabrik.de/europe/finland-latest.osm.pbf
 * 2. Install GDAL (brew install gdal) for ogr2ogr
 * 3. Extract buildings per city using ogr2ogr (see commands below)
 *
 * Pre-processing commands (run manually before this script):
 *
 *   # Extract buildings for Helsinki metro area
 *   ogr2ogr -f GeoJSON data/buildings_helsinki.geojson \
 *     finland-latest.osm.pbf \
 *     -sql "SELECT osm_id, name, building, 'building:levels' as levels, start_date, 'addr:street' as street, 'addr:housenumber' as housenumber FROM multipolygons WHERE building IS NOT NULL" \
 *     -spat 24.50 60.05 25.30 60.35
 *
 *   # Repeat for other cities with appropriate bounding boxes
 *
 * Usage: npx tsx scripts/data-import/03-import-buildings.ts
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { supabase } from './lib/supabaseAdmin'
import { CITIES } from './config'

const DATA_DIR = resolve(__dirname, '../../data')

interface OSMBuildingFeature {
  type: 'Feature'
  properties: {
    osm_id?: number
    building?: string
    levels?: string | number
    'building:levels'?: string | number
    start_date?: string
    'building:year'?: string
    'addr:street'?: string
    'addr:housenumber'?: string
    street?: string
    housenumber?: string
    name?: string
  }
  geometry: {
    type: 'Polygon' | 'MultiPolygon'
    coordinates: number[][][] | number[][][][]
  }
}

function parseConstructionYear(feature: OSMBuildingFeature): number | null {
  const props = feature.properties
  const raw =
    props.start_date || props['building:year'] || null

  if (!raw) return null

  // Try to parse year from various formats: "1965", "1960s", "~1970"
  const match = String(raw).match(/(\d{4})/)
  if (match) {
    const year = parseInt(match[1], 10)
    if (year >= 1800 && year <= 2030) return year
  }

  return null
}

function parseFloorCount(feature: OSMBuildingFeature): number | null {
  const raw =
    feature.properties.levels ||
    feature.properties['building:levels'] ||
    null

  if (!raw) return null

  const num = parseInt(String(raw), 10)
  if (num >= 1 && num <= 50) return num

  return null
}

function parseAddress(feature: OSMBuildingFeature): string | null {
  const props = feature.properties
  const street = props['addr:street'] || props.street
  const number = props['addr:housenumber'] || props.housenumber

  if (street && number) return `${street} ${number}`
  if (street) return street
  return null
}

function normalizeToPolygon(
  geometry: OSMBuildingFeature['geometry']
): { type: 'Polygon'; coordinates: number[][][] } | null {
  if (geometry.type === 'Polygon') {
    return geometry as { type: 'Polygon'; coordinates: number[][][] }
  }

  // For MultiPolygon, take the largest polygon
  if (geometry.type === 'MultiPolygon') {
    const coords = geometry.coordinates as number[][][][]
    if (coords.length === 0) return null

    // Find the polygon with the most points
    let largest = coords[0]
    let maxPoints = coords[0][0]?.length ?? 0

    for (const poly of coords) {
      const points = poly[0]?.length ?? 0
      if (points > maxPoints) {
        largest = poly
        maxPoints = points
      }
    }

    return { type: 'Polygon', coordinates: largest }
  }

  return null
}

async function importBuildingsForCity(cityName: string, filename: string) {
  const filepath = resolve(DATA_DIR, filename)

  if (!existsSync(filepath)) {
    console.log(`  File not found: ${filepath}`)
    console.log(`  Skipping ${cityName}. Run ogr2ogr extract first.`)
    return 0
  }

  console.log(`\n  Loading ${filename}...`)
  const raw = readFileSync(filepath, 'utf-8')
  const geojson = JSON.parse(raw)
  const features: OSMBuildingFeature[] = geojson.features ?? []

  console.log(`  ${features.length} building features loaded`)

  // Filter to only residential buildings
  const residential = features.filter((f) => {
    const bt = f.properties.building
    if (!bt) return false
    // Exclude non-residential
    const exclude = [
      'garage', 'garages', 'shed', 'barn', 'greenhouse', 'industrial',
      'commercial', 'warehouse', 'retail', 'church', 'chapel', 'hospital',
      'school', 'university', 'kindergarten', 'public', 'government',
      'transportation', 'train_station', 'parking',
    ]
    return !exclude.includes(bt)
  })

  console.log(`  ${residential.length} residential buildings after filtering`)

  let inserted = 0
  const BATCH_SIZE = 200

  for (let i = 0; i < residential.length; i += BATCH_SIZE) {
    const batch = residential.slice(i, i + BATCH_SIZE)

    const rows = batch
      .map((f) => {
        const polygon = normalizeToPolygon(f.geometry)
        if (!polygon) return null

        return {
          osm_id: f.properties.osm_id ?? null,
          geometry: JSON.stringify(polygon),
          building_type: f.properties.building ?? 'yes',
          construction_year: parseConstructionYear(f),
          floor_count: parseFloorCount(f),
          address: parseAddress(f),
        }
      })
      .filter(Boolean)

    if (rows.length === 0) continue

    const { error, count } = await supabase
      .from('buildings')
      .insert(rows as Record<string, unknown>[])

    if (error) {
      console.error(`  Batch insert error at ${i}: ${error.message}`)
    } else {
      inserted += rows.length
    }

    if ((i + BATCH_SIZE) % 2000 === 0 || i + BATCH_SIZE >= residential.length) {
      console.log(
        `  Progress: ${Math.min(i + BATCH_SIZE, residential.length)}/${residential.length} (${inserted} inserted)`
      )
    }
  }

  return inserted
}

async function assignAreasAndComputeCentroids() {
  console.log('\nAssigning buildings to postal code areas (spatial join)...')

  // Use PostGIS to assign area_id and compute centroids
  const { error: centroidError } = await supabase.rpc('assign_buildings_to_areas')

  if (centroidError) {
    console.log('RPC not available, falling back to SQL...')

    // Run raw SQL via the REST API
    const { error } = await supabase.from('buildings').select('id').limit(1)
    if (error) {
      console.error('Could not verify buildings table:', error.message)
      return
    }

    console.log(
      'Note: Run these SQL commands in the Supabase SQL editor:\n' +
        "  UPDATE buildings SET centroid = ST_Centroid(geometry) WHERE centroid IS NULL;\n" +
        '  UPDATE buildings b SET area_id = a.id FROM areas a WHERE ST_Contains(a.geometry, b.centroid) AND b.area_id IS NULL;\n' +
        "  UPDATE buildings SET footprint_area_sqm = ST_Area(geometry::geography) WHERE footprint_area_sqm IS NULL;"
    )
  } else {
    console.log('Buildings assigned to areas successfully')
  }
}

async function main() {
  console.log('=== Building Import ===\n')
  console.log(`Data directory: ${DATA_DIR}`)

  const cityFiles = [
    { name: 'Helsinki metro', file: 'buildings_helsinki.geojson' },
    { name: 'Tampere', file: 'buildings_tampere.geojson' },
    { name: 'Turku', file: 'buildings_turku.geojson' },
    { name: 'Oulu', file: 'buildings_oulu.geojson' },
  ]

  let totalInserted = 0

  for (const { name, file } of cityFiles) {
    const count = await importBuildingsForCity(name, file)
    totalInserted += count
  }

  if (totalInserted > 0) {
    await assignAreasAndComputeCentroids()
  }

  console.log(`\n=== Import complete: ${totalInserted} buildings ===`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
