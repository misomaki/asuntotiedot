/**
 * Merge multiple Etuovi CSV files into the main etuovi-listings.csv
 *
 * Usage: npx tsx scripts/data-import/merge-etuovi-csvs.ts [csv-files...]
 *
 * Examples:
 *   npx tsx scripts/data-import/merge-etuovi-csvs.ts ~/Downloads/etuovi-*.csv
 *   npx tsx scripts/data-import/merge-etuovi-csvs.ts ./new-data.csv
 *
 * Deduplicates by address+city+type, preferring entries with construction year.
 * Filters out non-sale prices (< 1200 €/m²).
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const MAIN_CSV = resolve(__dirname, 'etuovi-listings.csv')
const MIN_PRICE_PER_SQM = 1200

interface Listing {
  neighborhood: string
  city: string
  type: string
  year: number
  pricePerSqm: number
  price: number
  size: number
  address: string
}

function parseCsv(filePath: string): Listing[] {
  const content = readFileSync(filePath, 'utf-8')
  const lines = content.trim().split('\n')
  const listings: Listing[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    // Skip header
    if (line.startsWith('neighborhood|') || line.startsWith('neighborhood,')) continue

    const parts = line.split('|')
    if (parts.length < 8) continue

    const [neighborhood, city, type, yearStr, pricePerSqmStr, priceStr, sizeStr, address] = parts
    const listing: Listing = {
      neighborhood: neighborhood.trim(),
      city: city.trim(),
      type: type.trim(),
      year: parseInt(yearStr) || 0,
      pricePerSqm: parseInt(pricePerSqmStr) || 0,
      price: parseInt(priceStr) || 0,
      size: parseFloat(sizeStr) || 0,
      address: (address || '').trim(),
    }

    // Filter non-sale prices
    if (listing.pricePerSqm < MIN_PRICE_PER_SQM) continue
    if (!listing.neighborhood || !listing.city) continue

    listings.push(listing)
  }

  return listings
}

function dedupeKey(l: Listing): string {
  // Deduplicate by normalized address + city + type
  return `${l.address.toLowerCase().replace(/\s+/g, '')}|${l.city.toLowerCase()}|${l.type}`
}

async function main() {
  const inputFiles = process.argv.slice(2)

  if (inputFiles.length === 0) {
    console.log('Usage: npx tsx scripts/data-import/merge-etuovi-csvs.ts [csv-files...]')
    console.log('Example: npx tsx scripts/data-import/merge-etuovi-csvs.ts ~/Downloads/etuovi-*.csv')
    process.exit(1)
  }

  // Read existing main CSV
  console.log(`Reading main CSV: ${MAIN_CSV}`)
  const existing = parseCsv(MAIN_CSV)
  console.log(`  Existing: ${existing.length} listings`)

  // Read new CSVs
  let newListings: Listing[] = []
  for (const file of inputFiles) {
    const filePath = resolve(file)
    try {
      const listings = parseCsv(filePath)
      console.log(`  ${file}: ${listings.length} listings`)
      newListings.push(...listings)
    } catch (e) {
      console.error(`  Failed to read ${file}: ${(e as Error).message}`)
    }
  }

  if (newListings.length === 0) {
    console.log('No new listings found.')
    return
  }

  // Deduplicate: prefer entries with construction year
  const deduped = new Map<string, Listing>()

  // Add existing first
  for (const l of existing) {
    const key = dedupeKey(l)
    deduped.set(key, l)
  }

  // Add new, preferring entries with year > 0
  let added = 0
  let updated = 0
  let skipped = 0
  for (const l of newListings) {
    const key = dedupeKey(l)
    const prev = deduped.get(key)
    if (!prev) {
      deduped.set(key, l)
      added++
    } else if (l.year > 1800 && (prev.year === 0 || prev.year === undefined)) {
      // New entry has year, old doesn't — update
      deduped.set(key, l)
      updated++
    } else {
      skipped++
    }
  }

  // Write merged CSV
  const allListings = [...deduped.values()]
  const header = 'neighborhood|city|type|year|pricePerSqm|price|size|address'
  const lines = allListings.map(l =>
    `${l.neighborhood}|${l.city}|${l.type}|${l.year}|${l.pricePerSqm}|${l.price}|${l.size}|${l.address}`
  )
  const csv = [header, ...lines].join('\n') + '\n'

  writeFileSync(MAIN_CSV, csv)

  // Summary
  console.log(`\n=== Merge Summary ===`)
  console.log(`New listings added: ${added}`)
  console.log(`Updated (year added): ${updated}`)
  console.log(`Duplicates skipped: ${skipped}`)
  console.log(`Total in CSV: ${allListings.length}`)

  // Coverage stats
  const byCity: Record<string, { total: number; withYear: number }> = {}
  for (const l of allListings) {
    if (!byCity[l.city]) byCity[l.city] = { total: 0, withYear: 0 }
    byCity[l.city].total++
    if (l.year > 1800) byCity[l.city].withYear++
  }

  console.log('\nBy city:')
  for (const [city, stats] of Object.entries(byCity).sort((a, b) => b[1].total - a[1].total)) {
    const yearPct = stats.total > 0 ? Math.round(stats.withYear / stats.total * 100) : 0
    console.log(`  ${city}: ${stats.total} total, ${stats.withYear} with year (${yearPct}%)`)
  }

  console.log(`\nNext steps:`)
  console.log(`  1. npx tsx scripts/data-import/08-import-etuovi-listings.ts`)
  console.log(`  2. npx tsx scripts/data-import/09-compute-neighborhood-factors.ts`)
}

main().catch(console.error)
