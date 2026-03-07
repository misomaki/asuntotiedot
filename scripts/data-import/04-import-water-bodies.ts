/**
 * Script 04: Import water body geometries and compute distances to buildings.
 *
 * Uses OpenStreetMap water features extracted from the Finland PBF.
 *
 * Pre-processing command (run manually):
 *
 *   ogr2ogr -f GeoJSON data/water_finland.geojson \
 *     finland-latest.osm.pbf \
 *     -sql "SELECT osm_id, name, natural, water, waterway FROM multipolygons WHERE natural='water' OR water IS NOT NULL OR waterway='riverbank'" \
 *     -spat 22.0 60.0 26.0 65.5
 *
 * Usage: npx tsx scripts/data-import/04-import-water-bodies.ts
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { supabase } from './lib/supabaseAdmin'

const DATA_DIR = resolve(__dirname, '../../data')
const WATER_FILE = resolve(DATA_DIR, 'water_finland.geojson')

interface WaterFeature {
  type: 'Feature'
  properties: {
    osm_id?: number
    name?: string
    natural?: string
    water?: string
    waterway?: string
  }
  geometry: {
    type: string
    coordinates: number[][][] | number[][][][]
  }
}

function classifyWaterType(props: WaterFeature['properties']): string {
  if (props.natural === 'water' && props.water === 'lake') return 'lake'
  if (props.natural === 'water' && props.water === 'river') return 'river'
  if (props.waterway === 'riverbank') return 'river'
  if (props.natural === 'coastline' || props.water === 'sea') return 'sea'
  return 'lake' // default
}

function normalizeToMultiPolygon(
  geometry: WaterFeature['geometry']
): { type: 'MultiPolygon'; coordinates: number[][][][] } | null {
  if (geometry.type === 'MultiPolygon') {
    return geometry as { type: 'MultiPolygon'; coordinates: number[][][][] }
  }
  if (geometry.type === 'Polygon') {
    return {
      type: 'MultiPolygon',
      coordinates: [geometry.coordinates as number[][][]],
    }
  }
  return null
}

async function importWaterBodies() {
  if (!existsSync(WATER_FILE)) {
    console.log(`Water file not found: ${WATER_FILE}`)
    console.log('Run the ogr2ogr extract command first (see script header).')
    return 0
  }

  console.log(`Loading ${WATER_FILE}...`)
  const raw = readFileSync(WATER_FILE, 'utf-8')
  const geojson = JSON.parse(raw)
  const features: WaterFeature[] = geojson.features ?? []

  console.log(`${features.length} water features loaded`)

  // Filter to features with reasonable size (skip tiny ponds)
  let inserted = 0
  const BATCH_SIZE = 100

  for (let i = 0; i < features.length; i += BATCH_SIZE) {
    const batch = features.slice(i, i + BATCH_SIZE)

    const rows = batch
      .map((f) => {
        const multiPoly = normalizeToMultiPolygon(f.geometry)
        if (!multiPoly) return null

        return {
          name: f.properties.name ?? null,
          water_type: classifyWaterType(f.properties),
          geometry: JSON.stringify(multiPoly),
        }
      })
      .filter(Boolean)

    if (rows.length === 0) continue

    const { error } = await supabase
      .from('water_bodies')
      .insert(rows as Record<string, unknown>[])

    if (error) {
      console.error(`Batch insert error at ${i}: ${error.message}`)
    } else {
      inserted += rows.length
    }

    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= features.length) {
      console.log(
        `Progress: ${Math.min(i + BATCH_SIZE, features.length)}/${features.length}`
      )
    }
  }

  console.log(`\nInserted ${inserted} water bodies`)
  return inserted
}

async function computeWaterDistances() {
  console.log('\nComputing building distances to nearest water body...')
  console.log(
    'Run this SQL in the Supabase SQL editor for best performance:\n\n' +
      'UPDATE buildings b\n' +
      'SET min_distance_to_water_m = sub.dist\n' +
      'FROM (\n' +
      '  SELECT b2.id,\n' +
      '    MIN(ST_Distance(b2.centroid::geography, w.geometry::geography)) AS dist\n' +
      '  FROM buildings b2\n' +
      '  CROSS JOIN LATERAL (\n' +
      '    SELECT geometry FROM water_bodies\n' +
      '    ORDER BY b2.centroid <-> geometry\n' +
      '    LIMIT 1\n' +
      '  ) w\n' +
      '  WHERE b2.centroid IS NOT NULL\n' +
      '  GROUP BY b2.id\n' +
      ') sub\n' +
      'WHERE b.id = sub.id AND b.min_distance_to_water_m IS NULL;'
  )
}

async function main() {
  console.log('=== Water Bodies Import ===\n')

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
