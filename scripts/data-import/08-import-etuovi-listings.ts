/**
 * Script 08: Import Etuovi listings from CSV into _etuovi_staging table.
 *
 * Reads etuovi-listings.csv (collected via browser scraping) and matches
 * each listing to an area_id:
 *   0. street address → MML address register (_mml_address_staging) → postal code
 *   1. neighborhood name → area name within the same municipality
 *   2. fuzzy first-word match
 * then inserts into _etuovi_staging (postal_code filled when strategy 0 hits).
 *
 * Prerequisites: Migration 009 must be run first (creates _etuovi_staging table).
 *
 * Usage: npx tsx scripts/data-import/08-import-etuovi-listings.ts
 */

import { supabase } from './lib/supabaseAdmin'
import { getPgClient } from './lib/pgClient'
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

/** "NOKIA" → "Nokia", "hämeenkyrö" → "Hämeenkyrö" (keeps internal hyphen/space casing simple) */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map(part => (part.length > 1 || /[a-zåäö]/.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join('')
}

/** Known municipality names (lowercase) — filled from the areas table at runtime */
let knownMunicipalities = new Set<string>()

/** Normalize city name from Etuovi format — works for any municipality in the DB */
function normalizeCity(city: string): string {
  // Handle "Hervanta, Tampere" → "Tampere"; "Huopalahti Helsinki" → "Helsinki"
  const parts = city.split(/[,/]/).map(p => p.trim()).filter(Boolean)
  for (const part of [...parts].reverse()) {
    const upper = part.toUpperCase()
    if (CITY_NORMALIZE[upper]) return CITY_NORMALIZE[upper]
    if (knownMunicipalities.has(part.toLowerCase())) return titleCase(part)
    // "Huopalahti Helsinki" — last word is the municipality
    const words = part.split(/\s+/)
    const last = words[words.length - 1]
    if (words.length > 1 && knownMunicipalities.has(last.toLowerCase())) return titleCase(last)
  }
  return titleCase(parts[parts.length - 1] || city)
}

// ── Strategy 0: address → MML address register → postal code ─────────

/** 'Mestarintie 19 C' → { street: 'mestarintie', number: '19' } */
function parseAddress(address: string): { street: string; number: string } | null {
  const m = address.trim().match(/^(.+?)\s+(\d+)/)
  if (!m) return null
  return { street: m[1].toLowerCase().replace(/\s+/g, ' '), number: m[2] }
}

type AddressIndex = Map<string, string> // `${street}|${number}|${municipality}` → postal_code

async function loadAddressIndex(): Promise<AddressIndex> {
  console.log('Loading MML address register for address matching...')
  const index: AddressIndex = new Map()
  let client
  try {
    client = await getPgClient()
    const res = await client.query<{ street: string; num: string; muni: string; postal_code: string }>(
      `SELECT lower(street_name) AS street,
              substring(house_number from '^\\d+') AS num,
              lower(municipality) AS muni,
              postal_code
       FROM _mml_address_staging
       WHERE street_name IS NOT NULL AND postal_code IS NOT NULL`
    )
    for (const r of res.rows) {
      if (!r.num) continue
      const key = `${r.street.replace(/\s+/g, ' ')}|${r.num}|${r.muni}`
      if (!index.has(key)) index.set(key, r.postal_code)
    }
    console.log(`  ${index.size} address keys`)
  } catch (err) {
    console.warn(`  Address index unavailable (${(err as Error).message}) — falling back to name matching only`)
  } finally {
    await client?.end()
  }
  return index
}

function findPostalCodeByAddress(listing: CsvListing, index: AddressIndex): string | null {
  const parsed = parseAddress(listing.address)
  if (!parsed) return null
  const city = normalizeCity(listing.city).toLowerCase()
  return index.get(`${parsed.street}|${parsed.number}|${city}`) ?? null
}

// Etuovi neighborhood → database area name aliases
const NEIGHBORHOOD_ALIASES: Record<string, string> = {
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

// City-specific keskusta aliases (generic 'keskusta' → 'keskus' caused Oulu Keskusta
// to match Oulunsalo Keskus instead of Oulu Keskus via substring matching)
const CITY_KESKUSTA_ALIASES: Record<string, string> = {
  helsinki: 'helsinki keskus',
  tampere: 'tampere keskus',
  turku: 'turku keskus',
  oulu: 'oulu keskus',
  espoo: 'espoo keskus',
  vantaa: 'tikkurila',
  jyväskylä: 'jyväskylän keskus',
  kuopio: 'kuopio keskus',
  lahti: 'lahti keskus',
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
  // City-specific keskusta alias (avoids cross-city substring collisions)
  if (nbhd === 'keskusta') {
    const cityKey = city.toLowerCase()
    if (CITY_KESKUSTA_ALIASES[cityKey]) candidates.push(CITY_KESKUSTA_ALIASES[cityKey])
  }

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

  // Filter out likely bad data (very low pricePerSqm suggests monthly rent, Hitas, or partial ownership)
  // Real Finnish sale prices: KT ≥1,200, RT ≥1,500, OKT ≥1,000 €/m². Using 1,200 as safe floor.
  const validListings = listings.filter(l => l.pricePerSqm >= 1200)
  const filtered = listings.length - validListings.length
  console.log(`Filtered ${filtered} listings with pricePerSqm < 1200 (likely non-sale prices)`)
  console.log(`Valid listings: ${validListings.length}`)

  // 2. Fetch all areas (via pg — the Supabase REST client caps responses at 1 000 rows)
  const pgc = await getPgClient()
  const areas = (await pgc.query<AreaRow & { area_code: string }>('SELECT id, name, municipality, area_code FROM areas')).rows
  await pgc.end()

  console.log(`Areas in database: ${areas?.length || 0}\n`)
  knownMunicipalities = new Set((areas ?? []).map((a: { municipality: string }) => a.municipality.toLowerCase()))
  const areaIdByCode = new Map<string, string>()
  for (const a of (areas ?? []) as Array<{ id: string; area_code: string }>) areaIdByCode.set(a.area_code, a.id)

  const addressIndex = await loadAddressIndex()

  // 3. Match listings to areas
  let matched = 0
  let matchedByAddress = 0
  let unmatched = 0
  const unmatchedNeighborhoods = new Map<string, number>()

  const rows = validListings.map(listing => {
    let areaId: string | null = null
    let postalCode: string | null = null

    // Strategy 0: exact street address via MML register
    const pc = findPostalCodeByAddress(listing, addressIndex)
    if (pc && areaIdByCode.has(pc)) {
      areaId = areaIdByCode.get(pc)!
      postalCode = pc
      matchedByAddress++
    }

    if (!areaId) areaId = findAreaId(listing, areas as AreaRow[])

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
      postal_code: postalCode,
    }
  })

  console.log(`Matched to area:   ${matched} (by address: ${matchedByAddress}, by name: ${matched - matchedByAddress})`)
  console.log(`No area match:     ${unmatched}`)

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
