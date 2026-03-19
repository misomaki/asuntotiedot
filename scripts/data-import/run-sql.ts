/**
 * Helper script to run arbitrary SQL against Supabase.
 *
 * Usage: npx tsx scripts/data-import/run-sql.ts "UPDATE buildings SET min_distance_to_water_m = NULL"
 */

import { resolve } from 'path'
import { config } from 'dotenv'

config({ path: resolve(__dirname, '../../.env.local') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const sql = process.argv[2]
if (!sql) {
  console.error('Usage: npx tsx scripts/data-import/run-sql.ts "<SQL statement>"')
  process.exit(1)
}

console.log(`Running SQL: ${sql.slice(0, 200)}${sql.length > 200 ? '...' : ''}`)

// Try multiple Supabase SQL execution endpoints
const endpoints = [
  `${url}/rest/v1/rpc/exec_sql`,
  `${url}/pg/query`,
  `${url}/pg-meta/query`,
]

async function runSQL() {
  // First try: use the Supabase client's rpc to call a wrapper function
  // that executes arbitrary SQL (if it exists)
  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'apikey': key!,
      },
      body: JSON.stringify({ query: sql }),
    })

    if (response.ok) {
      const result = await response.json()
      console.log('Done!')
      if (Array.isArray(result) && result.length > 0 && result[0] !== null) {
        console.log('Result:', JSON.stringify(result, null, 2))
      }
      return
    }

    const status = response.status
    if (status !== 404) {
      const text = await response.text()
      console.error(`Error ${status} from ${endpoint}: ${text}`)
      process.exit(1)
    }
  }

  // Fallback: try the database direct connection
  console.error('No SQL execution endpoint found. Please run this SQL manually in Supabase SQL Editor:')
  console.log('\n' + sql + '\n')
  process.exit(1)
}

async function runSQL_OLD() {
  const response = await fetch(endpoints[0], {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'apikey': key!,
    },
    body: JSON.stringify({ query: sql }),
  })

  if (!response.ok) {
    const text = await response.text()
    console.error(`Error ${response.status}: ${text}`)
    process.exit(1)
  }

  const result = await response.json()
  console.log('Done!')
  if (Array.isArray(result) && result.length > 0 && result[0] !== null) {
    console.log('Result:', JSON.stringify(result, null, 2))
  }
}

runSQL().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})
