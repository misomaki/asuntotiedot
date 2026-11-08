/**
 * Script 00: Fill areas.municipality_code from the Statistics Finland
 * municipality classification (kunta_1_YYYY0101).
 *
 * areas.municipality holds the NAME (e.g. "Nokia"); StatFin 13mx/13mq and
 * the MML KHR KUNTA level are keyed by CODE (e.g. "536"). This script
 * resolves name → code once and stores it on the areas table.
 *
 * Prerequisites: Migration 040 (adds areas.municipality_code).
 *
 * Usage: npx tsx scripts/data-import/00-fill-municipality-codes.ts
 */

import { getPgClient } from './lib/pgClient'

const CLASSIFICATION_YEARS = ['20250101', '20240101']

interface ClassificationItem {
  code: string
  classificationItemNames: Array<{ name: string; lang?: string }>
}

async function fetchMunicipalityCodes(): Promise<Map<string, string>> {
  for (const year of CLASSIFICATION_YEARS) {
    const url = `https://data.stat.fi/api/classifications/v2/classifications/kunta_1_${year}/classificationItems?content=data&format=json&lang=fi&meta=max`
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const items = (await res.json()) as ClassificationItem[]
      const map = new Map<string, string>()
      for (const item of items) {
        const name = item.classificationItemNames?.[0]?.name
        if (name) map.set(name.trim().toLowerCase(), item.code)
      }
      console.log(`  Loaded ${map.size} municipalities from kunta_1_${year}`)
      return map
    } catch (err) {
      console.warn(`  kunta_1_${year} failed: ${(err as Error).message}`)
    }
  }
  throw new Error('Could not fetch municipality classification')
}

async function main() {
  console.log('=== Fill areas.municipality_code ===\n')

  const codesByName = await fetchMunicipalityCodes()
  const client = await getPgClient()
  try {
    // Distinct municipality names (the Supabase REST client caps at 1 000 rows — use pg)
    const names = (await client.query<{ municipality: string; n: string }>(
      'SELECT municipality, COUNT(*)::text AS n FROM areas GROUP BY municipality ORDER BY municipality'
    )).rows

    let updatedAreas = 0
    let resolved = 0
    const unresolved: string[] = []

    for (const row of names) {
      const code = codesByName.get(row.municipality.trim().toLowerCase())
      if (!code) {
        unresolved.push(row.municipality)
        continue
      }
      const res = await client.query('UPDATE areas SET municipality_code = $1 WHERE municipality = $2', [code, row.municipality])
      updatedAreas += res.rowCount ?? 0
      resolved++
    }

    console.log(`\nUpdated ${updatedAreas} areas in ${resolved} municipalities`)
    if (unresolved.length > 0) {
      console.log(`Unresolved municipality names (${unresolved.length}):`)
      for (const n of unresolved) console.log(`  - ${n}`)
    }
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
