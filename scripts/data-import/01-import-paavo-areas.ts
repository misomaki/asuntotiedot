/**
 * Script 01: Import postal code area boundaries from Statistics Finland Paavo.
 *
 * Fetches GeoJSON from the Paavo WFS service and inserts into the `areas` table.
 * Also extracts demographic and building statistics from Paavo feature properties.
 *
 * Usage: npx tsx scripts/data-import/01-import-paavo-areas.ts
 */

import { supabase } from './lib/supabaseAdmin'
import { PAAVO_WFS_URL, CITIES, isTargetPostalCode } from './config'

/** Whether to import ALL Finnish postal areas (not just target cities) */
const IMPORT_ALL = process.argv.includes('--all')

/** Municipality code → name mapping (loaded at runtime) */
let MUNICIPALITY_NAMES: Record<string, string> = {
  '049': 'Espoo',
  '091': 'Helsinki',
  '092': 'Vantaa',
  '235': 'Kauniainen',
  '837': 'Tampere',
  '853': 'Turku',
  '564': 'Oulu',
  '186': 'Järvenpää',
  '245': 'Kerava',
  '858': 'Tuusula',
  '543': 'Nurmijärvi',
  '694': 'Riihimäki',
  '106': 'Hyvinkää',
  '753': 'Sipoo',
  '257': 'Kirkkonummi',
}

/** Fetch all Finnish municipality names from Statistics Finland classification API */
async function fetchMunicipalityNames(): Promise<Record<string, string>> {
  console.log('Fetching municipality names from Statistics Finland...')
  const url = 'https://data.stat.fi/api/classifications/v2/classifications/kunta_1_20240101/classificationItems?content=data&format=json&lang=fi&meta=max'
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const items = await res.json() as Array<{ code: string; classificationItemNames: Array<{ name: string }> }>
    const names: Record<string, string> = {}
    for (const item of items) {
      const name = item.classificationItemNames?.[0]?.name
      if (name) names[item.code] = name
    }
    console.log(`  Loaded ${Object.keys(names).length} municipality names`)
    return names
  } catch (err) {
    console.warn('  Could not fetch municipality names, using fallback:', err)
    return MUNICIPALITY_NAMES
  }
}

interface PaavoFeature {
  type: 'Feature'
  properties: {
    postinumeroalue: string   // postal code (e.g. "00100")
    nimi: string              // name in Finnish
    kunta: string             // municipality code (e.g. "091")
    vuosi: number             // data year
    // Demographics
    he_vakiy?: number         // total population
    he_kika?: number          // median age
    pt_0_14?: number          // population 0-14
    he_0_2?: number           // population 0-2
    he_3_6?: number           // population 3-6
    he_7_12?: number          // population 7-12
    he_13_15?: number         // population 13-15
    he_16_17?: number         // population 16-17
    he_18_19?: number         // population 18-19
    he_20_24?: number         // population 20-24
    he_25_29?: number         // population 25-29
    he_30_34?: number         // population 30-34
    he_35_39?: number         // population 35-39
    he_40_44?: number         // population 40-44
    he_45_49?: number         // population 45-49
    he_50_54?: number         // population 50-54
    he_55_59?: number         // population 55-59
    he_60_64?: number         // population 60-64
    he_65_69?: number         // population 65-69
    he_70_74?: number         // population 70-74
    he_75_79?: number         // population 75-79
    he_80_84?: number         // population 80-84
    he_85_?: number           // population 85+
    // Households
    te_takk?: number          // average household size
    // Buildings
    ra_raky?: number          // total buildings
    ra_asrak?: number         // residential buildings
    ra_ke?: number            // buildings age indicator
    [key: string]: unknown
  }
  geometry: {
    type: string
    coordinates: number[][][][] | number[][][]
  }
}

async function fetchPaavoData(): Promise<PaavoFeature[]> {
  console.log('Fetching Paavo postal code boundaries from WFS...')

  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeName: 'postialue:pno_tilasto',
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
  })

  const url = `${PAAVO_WFS_URL}?${params}`
  console.log(`URL: ${url}`)

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Paavo WFS error ${response.status}: ${await response.text()}`)
  }

  const geojson = await response.json()
  console.log(`Received ${geojson.features?.length ?? 0} features from Paavo`)
  return geojson.features ?? []
}

function filterTargetAreas(features: PaavoFeature[]): PaavoFeature[] {
  const filtered = features.filter((f) => {
    const postalCode = f.properties.postinumeroalue
    return postalCode && isTargetPostalCode(postalCode)
  })
  console.log(`Filtered to ${filtered.length} areas in target cities`)

  for (const city of CITIES) {
    const count = filtered.filter((f) =>
      city.postalPrefixes.some((p) => f.properties.postinumeroalue.startsWith(p))
    ).length
    console.log(`  ${city.name}: ${count} areas`)
  }

  return filtered
}

function getMunicipalityName(code: string): string {
  return MUNICIPALITY_NAMES[code] || `Kunta ${code}`
}

/** Compute under-18 population from age groups */
function computeUnder18(props: PaavoFeature['properties']): number {
  return (
    (props.he_0_2 ?? 0) +
    (props.he_3_6 ?? 0) +
    (props.he_7_12 ?? 0) +
    (props.he_13_15 ?? 0) +
    (props.he_16_17 ?? 0)
  )
}

/** Compute 18-64 population from age groups */
function compute18to64(props: PaavoFeature['properties']): number {
  return (
    (props.he_18_19 ?? 0) +
    (props.he_20_24 ?? 0) +
    (props.he_25_29 ?? 0) +
    (props.he_30_34 ?? 0) +
    (props.he_35_39 ?? 0) +
    (props.he_40_44 ?? 0) +
    (props.he_45_49 ?? 0) +
    (props.he_50_54 ?? 0) +
    (props.he_55_59 ?? 0) +
    (props.he_60_64 ?? 0)
  )
}

/** Compute 65+ population from age groups */
function computeOver65(props: PaavoFeature['properties']): number {
  return (
    (props.he_65_69 ?? 0) +
    (props.he_70_74 ?? 0) +
    (props.he_75_79 ?? 0) +
    (props.he_80_84 ?? 0) +
    (props.he_85_ ?? 0)
  )
}

async function importAreas(features: PaavoFeature[]) {
  console.log('\nImporting areas into database...')

  let imported = 0
  let skipped = 0

  // Ensure geometry is MultiPolygon
  function normalizeGeometry(geom: PaavoFeature['geometry']): PaavoFeature['geometry'] {
    if (geom.type === 'Polygon') {
      return {
        type: 'MultiPolygon',
        coordinates: [geom.coordinates as number[][][]],
      }
    }
    return geom
  }

  // Process in batches of 50
  for (let i = 0; i < features.length; i += 50) {
    const batch = features.slice(i, i + 50)

    const areaRows = batch.map((f) => ({
      area_code: f.properties.postinumeroalue,
      name: f.properties.nimi || f.properties.postinumeroalue,
      municipality: getMunicipalityName(f.properties.kunta),
      geometry: JSON.stringify(normalizeGeometry(f.geometry)),
    }))

    const { data, error } = await supabase
      .from('areas')
      .upsert(areaRows, { onConflict: 'area_code' })
      .select('id, area_code')

    if (error) {
      console.error(`Error inserting batch ${i}: ${error.message}`)
      skipped += batch.length
      continue
    }

    imported += data?.length ?? 0

    if ((i + 50) % 200 === 0 || i + 50 >= features.length) {
      console.log(`  Progress: ${Math.min(i + 50, features.length)}/${features.length}`)
    }
  }

  console.log(`\nAreas imported: ${imported}, skipped: ${skipped}`)

  // Update centroids for all areas
  console.log('Updating centroids...')
  const { error: centroidError } = await supabase.rpc('update_centroids')
  if (centroidError) {
    console.warn('Could not call update_centroids RPC:', centroidError.message)
  } else {
    console.log('Centroids updated.')
  }

  // Import demographics for areas that have data
  console.log('\nImporting demographics...')
  let demoImported = 0

  for (const f of features) {
    const props = f.properties
    if (!props.he_vakiy) continue

    // Look up area ID
    const { data: area } = await supabase
      .from('areas')
      .select('id')
      .eq('area_code', props.postinumeroalue)
      .single()

    if (!area) continue

    const population = props.he_vakiy ?? 0
    const under18 = computeUnder18(props)
    const age18_64 = compute18to64(props)
    const over65 = computeOver65(props)
    const total = population || 1

    await supabase.from('demographic_stats').upsert(
      {
        area_id: area.id,
        year: props.vuosi || 2024,
        population,
        median_age: props.he_kika ?? null,
        pct_under_18: Math.round((under18 / total) * 100),
        pct_18_64: Math.round((age18_64 / total) * 100),
        pct_over_65: Math.round((over65 / total) * 100),
        avg_household_size: props.te_takk ?? null,
      },
      { onConflict: 'area_id,year' }
    )

    demoImported++
  }

  console.log(`Demographics imported: ${demoImported}`)
}

async function main() {
  console.log('=== Paavo Areas Import ===\n')

  if (IMPORT_ALL) {
    console.log('MODE: Importing ALL Finnish postal areas (--all flag)')
    MUNICIPALITY_NAMES = await fetchMunicipalityNames()
  } else {
    console.log('MODE: Importing target cities only (use --all for all Finland)')
  }

  const features = await fetchPaavoData()

  const targetFeatures = IMPORT_ALL ? features : filterTargetAreas(features)

  if (targetFeatures.length === 0) {
    console.error('No areas found!')
    process.exit(1)
  }

  console.log(`Importing ${targetFeatures.length} postal areas...`)
  await importAreas(targetFeatures)

  console.log('\n=== Import complete ===')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
