/**
 * Script 12: Import PostHog `price_feedback` events into price_feedback_votes.
 *
 * Reads a PostHog CSV export (Events → filter `price_feedback` → Export to CSV),
 * parses the relevant columns, and upserts into price_feedback_votes.
 *
 * Idempotent on PostHog event UUID, so re-running with a fresh export only
 * adds new votes.
 *
 * Usage:
 *   npx tsx scripts/data-import/12-import-posthog-votes.ts <path-to-csv>
 *
 * Example:
 *   npx tsx scripts/data-import/12-import-posthog-votes.ts \
 *     /Users/mariisomaki/Downloads/export-2026-05-04-171112.csv
 */

import { supabase } from './lib/supabaseAdmin'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const PRICE_FEEDBACK_EVENT = 'price_feedback'
const VALID_RATINGS = new Set(['accurate', 'too_low', 'too_high'])

interface VoteRow {
  posthog_event_id: string
  building_id: string | null
  area_code: string | null
  address: string | null
  estimated_price: number | null
  rating: string
  comment: string | null
  distinct_id: string | null
  event_timestamp: string
}

/**
 * Parse a single CSV line into fields, handling quoted fields with
 * embedded commas, quoted newlines (already split out by parseCSV),
 * and `""`-escaped quotes.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let cur = ''
  let inQuotes = false
  let i = 0
  while (i < line.length) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      cur += c
      i++
    } else {
      if (c === ',') {
        fields.push(cur)
        cur = ''
        i++
      } else if (c === '"' && cur === '') {
        inQuotes = true
        i++
      } else {
        cur += c
        i++
      }
    }
  }
  fields.push(cur)
  return fields
}

/**
 * Split CSV content into logical lines, respecting quoted newlines.
 */
function splitCsvLines(content: string): string[] {
  const lines: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < content.length; i++) {
    const c = content[i]
    if (c === '"') {
      // toggle, but handle "" inside quoted field
      if (inQuotes && content[i + 1] === '"') {
        cur += '""'
        i++
        continue
      }
      inQuotes = !inQuotes
      cur += c
      continue
    }
    if (c === '\n' && !inQuotes) {
      lines.push(cur)
      cur = ''
      continue
    }
    if (c === '\r' && !inQuotes && content[i + 1] === '\n') {
      lines.push(cur)
      cur = ''
      i++
      continue
    }
    cur += c
  }
  if (cur.length > 0) lines.push(cur)
  return lines
}

function parseCsv(content: string): { header: string[]; rows: string[][] } {
  const lines = splitCsvLines(content).filter((l) => l.length > 0)
  if (lines.length === 0) return { header: [], rows: [] }
  const header = parseCsvLine(lines[0])
  const rows = lines.slice(1).map((l) => parseCsvLine(l))
  return { header, rows }
}

function emptyToNull(s: string | undefined): string | null {
  if (s == null) return null
  const trimmed = s.trim()
  if (trimmed === '' || trimmed.toLowerCase() === 'null') return null
  return trimmed
}

function parsePrice(s: string | undefined): number | null {
  const v = emptyToNull(s)
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function looksLikeUuid(s: string | null): boolean {
  if (!s) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

async function main() {
  const csvPath = process.argv[2]
  if (!csvPath) {
    console.error('Usage: npx tsx scripts/data-import/12-import-posthog-votes.ts <path-to-csv>')
    process.exit(1)
  }

  const absPath = resolve(csvPath)
  console.log(`Reading ${absPath}...`)
  const content = readFileSync(absPath, 'utf-8')
  const { header, rows } = parseCsv(content)
  console.log(`Parsed ${rows.length} rows, ${header.length} columns`)

  const idx = (name: string): number => {
    const i = header.indexOf(name)
    if (i < 0) {
      console.error(`Missing column: ${name}`)
      process.exit(1)
    }
    return i
  }

  const COL = {
    uuid: idx('*.uuid'),
    event: idx('*.event'),
    buildingId: idx('*.properties.buildingId'),
    distinctId: idx('*.properties.distinct_id'),
    address: idx('*.properties.address'),
    rating: idx('*.properties.rating'),
    estimatedPrice: idx('*.properties.estimatedPrice'),
    areaCode: idx('*.properties.areaCode'),
    timestamp: idx('*.timestamp'),
    comment: header.indexOf('*.properties.comment'), // optional
  }

  const votes: VoteRow[] = []
  let skippedNotFeedback = 0
  let skippedBadRating = 0
  let skippedNoTimestamp = 0

  for (const row of rows) {
    if (row[COL.event] !== PRICE_FEEDBACK_EVENT) {
      skippedNotFeedback++
      continue
    }
    const rating = emptyToNull(row[COL.rating])
    if (!rating || !VALID_RATINGS.has(rating)) {
      skippedBadRating++
      continue
    }
    const ts = emptyToNull(row[COL.timestamp])
    if (!ts) {
      skippedNoTimestamp++
      continue
    }
    const buildingId = emptyToNull(row[COL.buildingId])
    votes.push({
      posthog_event_id: row[COL.uuid],
      building_id: looksLikeUuid(buildingId) ? buildingId : null,
      area_code: emptyToNull(row[COL.areaCode]),
      address: emptyToNull(row[COL.address]),
      estimated_price: parsePrice(row[COL.estimatedPrice]),
      rating,
      comment: COL.comment >= 0 ? emptyToNull(row[COL.comment]) : null,
      distinct_id: emptyToNull(row[COL.distinctId]),
      event_timestamp: ts,
    })
  }

  console.log(
    `Filtered to ${votes.length} price_feedback votes ` +
      `(skipped: ${skippedNotFeedback} non-feedback, ${skippedBadRating} bad rating, ${skippedNoTimestamp} no ts)`
  )

  // Upsert in batches of 200
  const batchSize = 200
  let inserted = 0
  for (let i = 0; i < votes.length; i += batchSize) {
    const batch = votes.slice(i, i + batchSize)
    const { error, count } = await supabase
      .from('price_feedback_votes')
      .upsert(batch, { onConflict: 'posthog_event_id', count: 'exact' })
    if (error) {
      console.error(`Batch ${i}–${i + batch.length} failed:`, error.message)
      process.exit(1)
    }
    inserted += count ?? batch.length
    process.stdout.write(`\rUpserted ${inserted}/${votes.length}...`)
  }
  console.log()

  // Summary
  const { count: total } = await supabase
    .from('price_feedback_votes')
    .select('*', { count: 'exact', head: true })
  console.log(`Total rows in price_feedback_votes: ${total}`)

  const ratingCounts: Record<string, number> = {}
  for (const v of votes) ratingCounts[v.rating] = (ratingCounts[v.rating] ?? 0) + 1
  console.log('Rating distribution in this import:', ratingCounts)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
