/**
 * Script 08: Import Etuovi listings from CSV into _etuovi_staging table.
 *
 * Reads etuovi-listings.csv (collected via browser scraping),
 * matches each listing to an area_id by finding the best matching
 * area name + municipality, and inserts into _etuovi_staging.
 *
 * Prerequisites: Migration 009 must be run first (creates _etuovi_staging table).
 *
 * Usage: npx tsx scripts/data-import/08-import-etuovi-listings.ts
 */

import { supabase } from './lib/supabaseAdmin'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const TYPE_MAP: Record<string, string> = {
  K: 'kerrostalo',
  R: 'rivitalo',
  O: 'omakotitalo',
}

// Known city name normalizations
const CITY_NORMALIZE: Record<string, string> = {
  TAMPERE: 'Tampere',
  OULU: 'Oulu',
  TURKU: 'Turku',
  HELSINKI: 'Helsinki',
  ESPOO: 'Espoo',
  VANTAA: 'Vantaa',
  JYVÄSKYLÄ: 'Jyväskylä',
  KUOPIO: 'Kuopio',
  LAHTI: 'Lahti',
}

interface CsvListing {
  neighborhood: string
  city: string
  propertyType: string
  year: number | null
  pricePerSqm: number
  price: number
  size: number
  address: string
}

interface AreaRow {
  id: string
  name: string
  municipality: string
}

function parseCsv(filePath: string): CsvListing[] {
  const content = readFileSync(filePath, 'utf-8')
  const lines = content.trim().split('\n')
  const listings: CsvListing[] = []

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const parts = line.split('|')
    if (parts.length < 8) continue

    const [neighborhood, city, type, yearStr, pricePerSqmStr, priceStr, sizeStr, address] = parts
    const year = parseInt(yearStr)
    const pricePerSqm = parseInt(pricePerSqmStr)
    const price = parseInt(priceStr)
    const size = parseFloat(sizeStr)

    if (!pricePerSqm || pricePerSqm <= 0) continue

    listings.push({
      neighborhood: neighborhood.trim(),
      city: city.trim(),
      propertyType: TYPE_MAP[type] || 'kerrostalo',
      year: year > 1800 && year <= 2030 ? year : null,
      pricePerSqm,
      price,
      size,
      address: address?.trim() || '',
    })
  }

  return listings
}

/** Normalize city name from Etuovi format */
function normalizeCity(city: string): string {
  // Handle "Hervanta, Tampere" → "Tampere"
  const parts = city.split(/[,/]/).map(p => p.trim())
  for (const part of parts.reverse()) {
    const upper = part.toUpperCase()
    if (CITY_NORMALIZE[upper]) return CITY_NORMALIZE[upper]
    // Check if it's a known major city
    if (['Helsinki', 'Tampere', 'Turku', 'Oulu', 'Espoo', 'Vantaa', 'Jyväskylä', 'Kuopio', 'Lahti'].includes(part)) {
      return part
    }
  }
  return parts[parts.length - 1] || city
}

// Etuovi neighborhood → database area name aliases
const NEIGHBORHOOD_ALIASES: Record<string, string> = {
  keskusta: 'keskus',
  alppiharju: 'alppila',
  hietalahti: 'punavuori',
  kluuvi: 'kruununhaka',
  tammela: 'tampere keskus',
  härmälänranta: 'härmälä',
  'ranta-tampella': 'tampere keskus',
  tampella: 'tampere keskus',
  toppilansaari: 'toppila',
  aviapolis: 'aviapoliksen',
  asemantausta: 'lahti keskus',
  niemenranta: 'niemi',
}

/** Find best matching area_id for a listing */
function findAreaId(
  listing: CsvListing,
  areas: AreaRow[]
): string | null {
  const city = normalizeCity(listing.city)
  const nbhd = listing.neighborhood.toLowerCase().trim()

  if (!nbhd) return null

  // Try original name, then alias
  const candidates = [nbhd]
  if (NEIGHBORHOOD_ALIASES[nbhd]) candidates.push(NEIGHBORHOOD_ALIASES[nbhd])

  for (const candidate of candidates) {
    // Strategy 1: Exact name match within city
    for (const area of areas) {
      if (area.municipality.toLowerCase() !== city.toLowerCase()) continue
      const areaName = area.name.toLowerCase()

      // Exact match
      if (areaName === candidate) return area.id

      // Area name contains neighborhood or vice versa
      if (areaName.includes(candidate) || candidate.includes(areaName)) return area.id
    }

    // Strategy 2: Fuzzy match — first word
    for (const area of areas) {
      if (area.municipality.toLowerCase() !== city.toLowerCase()) continue
      const areaName = area.name.toLowerCase()

      const candidateFirst = candidate.split(/[\s-]/)[0]
      const areaFirst = areaName.split(/[\s-]/)[0]
      if (candidateFirst.length >= 4 && (areaName.startsWith(candidateFirst) || candidateFirst === areaFirst)) {
        return area.id
      }
    }
  }

  return null
}

async function main() {
  console.log('=== Etuovi Listing Import ===\n')

  // 1. Read CSV
  const csvPath = resolve(__dirname, 'etuovi-listings.csv')
  const listings = parseCsv(csvPath)
  console.log(`Parsed ${listings.length} listings from CSV`)

  // Filter out likely bad data (very low pricePerSqm suggests monthly payment, not sale price)
  const validListings = listings.filter(l => l.pricePerSqm >= 500)
  const filtered = listings.length - validListings.length
  console.log(`Filtered ${filtered} listings with pricePerSqm < 500 (likely non-sale prices)`)
  console.log(`Valid listings: ${validListings.length}`)

  // 2. Fetch all areas
  const { data: areas, error: areaErr } = await supabase
    .from('areas')
    .select('id, name, municipality')

  if (areaErr) {
    console.error('Failed to fetch areas:', areaErr.message)
    process.exit(1)
  }

  console.log(`Areas in database: ${areas?.length || 0}\n`)

  // 3. Match listings to areas
  let matched = 0
  let unmatched = 0
  const unmatchedNeighborhoods = new Map<string, number>()

  const rows = validListings.map(listing => {
    const areaId = findAreaId(listing, areas as AreaRow[])
    if (areaId) {
      matched++
    } else {
      unmatched++
      const key = `${listing.neighborhood} (${listing.city})`
      unmatchedNeighborhoods.set(key, (unmatchedNeighborhoods.get(key) || 0) + 1)
    }

    return {
      address: listing.address,
      neighborhood: listing.neighborhood,
      city: normalizeCity(listing.city),
      property_type: listing.propertyType,
      construction_year: listing.year,
      asking_price_total: listing.price,
      size_sqm: listing.size,
      asking_price_per_sqm: listing.pricePerSqm,
      area_id: areaId,
    }
  })

  console.log(`Matched to area: ${matched}`)
  console.log(`No area match:   ${unmatched}`)

  if (unmatchedNeighborhoods.size > 0) {
    console.log('\nTop unmatched neighborhoods:')
    const sorted = Array.from(unmatchedNeighborhoods.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
    for (const [name, count] of sorted) {
      console.log(`  ${name}: ${count}`)
    }
  }

  // 4. Clear existing staging data and insert
  console.log('\nClearing existing staging data...')
  const { error: delErr } = await supabase
    .from('_etuovi_staging')
    .delete()
    .gte('id', '00000000-0000-0000-0000-000000000000') // delete all

  if (delErr) {
    console.error('Failed to clear staging:', delErr.message)
    // Continue anyway — table might not exist yet
  }

  console.log(`Inserting ${rows.length} listings...`)

  // Insert in batches
  const BATCH_SIZE = 100
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('_etuovi_staging')
      .insert(batch)

    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message)
    } else {
      inserted += batch.length
    }
  }

  console.log(`Inserted: ${inserted}`)

  // 5. Summary
  const byType: Record<string, number> = {}
  const byCity: Record<string, number> = {}
  for (const row of rows) {
    byType[row.property_type] = (byType[row.property_type] || 0) + 1
    byCity[row.city] = (byCity[row.city] || 0) + 1
  }

  console.log('\n=== Summary ===')
  console.log('By type:', JSON.stringify(byType))
  console.log('By city:', JSON.stringify(byCity))
  console.log(`With area_id: ${matched} / ${rows.length} (${Math.round(matched / rows.length * 100)}%)`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
