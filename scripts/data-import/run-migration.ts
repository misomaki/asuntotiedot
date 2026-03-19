/**
 * Helper script to run a SQL migration file against Supabase.
 * Uses the Supabase SQL API (available with service role key).
 *
 * Usage: npx tsx scripts/data-import/run-migration.ts <path-to-migration.sql>
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { config } from 'dotenv'

config({ path: resolve(__dirname, '../../.env.local') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const migrationPath = process.argv[2]
if (!migrationPath) {
  console.error('Usage: npx tsx scripts/data-import/run-migration.ts <path-to-migration.sql>')
  process.exit(1)
}

const sql = readFileSync(resolve(migrationPath), 'utf-8')
console.log(`Running migration: ${migrationPath}`)
console.log(`SQL length: ${sql.length} chars\n`)

// Use Supabase's pg-meta SQL execution endpoint
const pgMetaUrl = `${url}/pg/query`

async function runMigration() {
  const response = await fetch(pgMetaUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'apikey': key,
    },
    body: JSON.stringify({ query: sql }),
  })

  if (!response.ok) {
    const text = await response.text()
    console.error(`Error ${response.status}: ${text}`)
    process.exit(1)
  }

  const result = await response.json()
  console.log('Migration executed successfully!')
  if (Array.isArray(result) && result.length > 0) {
    console.log('Result:', JSON.stringify(result, null, 2))
  }
}

runMigration().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
