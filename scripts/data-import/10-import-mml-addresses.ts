/**
 * Script 10: Import addresses from MML (Maanmittauslaitos) INSPIRE API.
 *
 * Fetches address points from the MML INSPIRE Simple Addresses OGC API
 * Features endpoint and matches them to buildings by PostGIS proximity
 * (nearest point within 30m of building centroid).
 *
 * Only updates buildings that don't already have an address (from OSM).
 * MML coverage is >95% vs OSM's ~40-60%.
 *
 * Prerequisites:
 *   - Run supabase/migrations/019_mml_address_enrichment.sql in SQL Editor
 *   - Buildings must be imported (scripts 01-05)
 *
 * Usage: npx tsx scripts/data-import/10-import-mml-addresses.ts
 */

import { supabase } from './lib/supabaseAdmin'
import { CITIES } from './config'
import { sleep } from './lib/pxwebClient'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MML_API =
  'https://beta-paikkatieto.maanmittauslaitos.fi/inspire-addresses/features/v1/collections/addresses/items'

/** Max features per API request */
const PAGE_SIZE = 5000

/** Max records per staging insert batch */
const INSERT_BATCH_SIZE = 5000

/** Delay between API pages (ms) */
const API_DELAY_MS = 500

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MmlAddress {
  inspireId: string
  streetName: string
  houseNumber: string | null
  postalCode: string | null
  municipality: string | null
  lng: number
  lat: number
}

interface MmlFeatureProperties {
  inspireId_localId?: string
  component_ThoroughfareName?: string | null
  locator_designator_addressNumber?: string | null
  component_PostalDescriptor?: string | null
  component_AdminUnitName_4?: string | null
}

interface MmlFeature {
  type: 'Feature'
  id?: string
  properties: MmlFeatureProperties
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  } | null
}

interface MmlResponse {
  type: 'FeatureCollection'
  features: MmlFeature[]
  numberReturned?: number
  links?: Array<{ rel: string; href: string }>
}

// ---------------------------------------------------------------------------
// MML API fetching
// ---------------------------------------------------------------------------

/**
 * Fetch a single page from the MML INSPIRE API.
 * Uses cursor-based pagination via `next` link.
 */
async function fetchMmlPage(url: string): Promise<MmlResponse> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60000) // 60s timeout
      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)

      if (response.status === 429 || response.status === 503) {
        const wait = 15000 * attempt
        console.log(`    Rate limited (${response.status}), waiting ${wait / 1000}s...`)
        await sleep(wait)
        continue
      }

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`MML API error ${response.status}: ${text.slice(0, 300)}`)
      }

      return (await response.json()) as MmlResponse
    } catch (err) {
      if (attempt < 3) {
        console.log(`    Fetch error (attempt ${attempt}/3): ${(err as Error).message}`)
        await sleep(5000 * attempt)
      } else {
        throw err
      }
    }
  }
  throw new Error('Unreachable')
}

/**
 * Fetch all addresses for a city bbox via cursor-based pagination.
 * The MML API's `next` link double-encodes the bbox parameter,
 * so we decode the URL before following it.
 */
async function fetchAddressesForCity(
  cityName: string,
  bbox: [number, number, number, number]
): Promise<Map<string, MmlAddress>> {
  const [west, south, east, north] = bbox
  const addresses = new Map<string, MmlAddress>()

  let url: string | null = `${MML_API}?f=json&limit=${PAGE_SIZE}&bbox=${west},${south},${east},${north}`
  let page = 0

  console.log(`\n${cityName}: fetching MML addresses [${bbox.join(', ')}]`)

  while (url) {
    const data = await fetchMmlPage(url)
    page++

    for (const feature of data.features) {
      if (!feature.geometry || feature.geometry.type !== 'Point') continue

      const props = feature.properties
      const id = feature.id ?? props.inspireId_localId
      if (!id) continue

      const streetName = props.component_ThoroughfareName
      if (!streetName) continue // skip addresses without street name

      const [lng, lat] = feature.geometry.coordinates

      addresses.set(String(id), {
        inspireId: String(id),
        streetName,
        houseNumber: props.locator_designator_addressNumber ?? null,
        postalCode: props.component_PostalDescriptor ?? null,
        municipality: props.component_AdminUnitName_4 ?? null,
        lng,
        lat,
      })
    }

    const count = data.features.length
    console.log(`    Page ${page}: +${count} features (${addresses.size} unique total)`)

    // Find next page link — MML double-encodes bbox, so decode once
    const nextLink = data.links?.find((l) => l.rel === 'next')
    if (nextLink && count > 0) {
      // Fix double-encoded bbox: %252C → %2C → ,
      url = decodeURIComponent(nextLink.href)
      // Ensure f=json is present
      if (!url.includes('f=json')) {
        url += (url.includes('?') ? '&' : '?') + 'f=json'
      }
      await sleep(API_DELAY_MS)
    } else {
      url = null
    }
  }

  console.log(`  ${addresses.size} unique addresses from MML`)
  return addresses
}

// ---------------------------------------------------------------------------
// Staging insert
// ---------------------------------------------------------------------------

async function insertIntoStaging(addresses: MmlAddress[]): Promise<void> {
  console.log(`\nInserting ${addresses.length} records into staging table...`)

  for (let offset = 0; offset < addresses.length; offset += INSERT_BATCH_SIZE) {
    const batch = addresses.slice(offset, offset + INSERT_BATCH_SIZE)

    const rows = batch.map((a) => ({
      inspire_id: a.inspireId,
      street_name: a.streetName,
      house_number: a.houseNumber,
      postal_code: a.postalCode,
      municipality: a.municipality,
      geometry: `SRID=4326;POINT(${a.lng} ${a.lat})`,
    }))

    const { error } = await supabase
      .from('_mml_address_staging')
      .upsert(rows, { onConflict: 'inspire_id' })

    if (error) {
      console.error(`  Staging insert error at offset ${offset}:`, error.message)
      // Continue with next batch
    }

    const total = Math.min(offset + INSERT_BATCH_SIZE, addresses.length)
    if (total % 10000 === 0 || total === addresses.length) {
      console.log(`  Staging progress: ${total}/${addresses.length}`)
    }
  }

  console.log(`Inserted ${addresses.length} records into staging`)
}

// ---------------------------------------------------------------------------
// Batch matching
// ---------------------------------------------------------------------------

async function matchAddressesToBuildings(): Promise<void> {
  // Count buildings needing addresses
  const { count } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .is('address', null)
    .not('centroid', 'is', null)

  console.log(`\nMatching addresses to ${count ?? '?'} buildings without address...`)

  let totalMatched = 0
  let batch = 0

  while (true) {
    batch++
    const { data, error } = await supabase.rpc('match_mml_addresses_batch', {
      p_limit: 500,
    })

    if (error) {
      console.error(`  RPC match_mml_addresses_batch failed:`, error.message)
      break
    }

    const batchCount = typeof data === 'number' ? data : 0
    totalMatched += batchCount

    if (batch % 20 === 0 || batchCount === 0) {
      console.log(`  Batch ${batch}: +${batchCount} (total: ${totalMatched}/${count ?? '?'})`)
    }

    if (batchCount === 0) break
  }

  console.log(`\nDone: matched ${totalMatched} buildings with MML addresses`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const matchOnly = process.argv.includes('--match-only')
  console.log('=== MML Address Import ===\n')

  if (!matchOnly) {
    // Step 1: Clear staging table
    console.log('Clearing staging table...')
    const { error: clearErr } = await supabase
      .from('_mml_address_staging')
      .delete()
      .neq('inspire_id', '') // delete all rows

    if (clearErr) {
      console.error('Failed to clear staging:', clearErr.message)
      // Continue anyway — upsert will handle duplicates
    }

    // Step 2: Fetch addresses for all cities
    const allAddresses = new Map<string, MmlAddress>()

    for (const city of CITIES) {
      try {
        const cityAddresses = await fetchAddressesForCity(city.name, city.bbox as [number, number, number, number])

        for (const [id, addr] of cityAddresses) {
          if (!allAddresses.has(id)) {
            allAddresses.set(id, addr)
          }
        }

        console.log(`  ${cityAddresses.size} new (total unique: ${allAddresses.size})`)
      } catch (err) {
        console.error(`  SKIPPING ${city.name}: ${(err as Error).message}`)
      }
      await sleep(2000) // be polite between cities
    }

    // Step 3: Insert into staging
    await insertIntoStaging(Array.from(allAddresses.values()))
  } else {
    console.log('--match-only: skipping fetch, using existing staging data')
  }

  // Step 4: Match to buildings
  await matchAddressesToBuildings()

  // Step 5: Summary
  const { count: withAddress } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('address', 'is', null)

  const { count: total } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })

  console.log(`\n=== Summary ===`)
  console.log(`Buildings with address: ${withAddress}/${total} (${((withAddress ?? 0) / (total ?? 1) * 100).toFixed(1)}%)`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
