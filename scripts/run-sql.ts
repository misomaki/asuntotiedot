/**
 * Run a SQL file against Supabase via direct Postgres connection.
 * Usage: npx tsx scripts/run-sql.ts <path-to-sql-file>
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: resolve(__dirname, '../.env.local') })

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('Missing DATABASE_URL in .env.local')
  process.exit(1)
}

const sqlFile = process.argv[2]
if (!sqlFile) {
  console.error('Usage: npx tsx scripts/run-sql.ts <path-to-sql-file>')
  process.exit(1)
}

const sql = readFileSync(resolve(sqlFile), 'utf-8')
console.log(`Running SQL from ${sqlFile} (${sql.length} chars)...`)

async function main() {
  const client = new pg.Client({ connectionString: databaseUrl })
  try {
    await client.connect()
    await client.query("SET statement_timeout = '600s'")
    const result = await client.query(sql)
    console.log('Migration completed successfully.')
    if (result.command) {
      console.log(`Command: ${result.command}`)
    }
  } catch (err) {
    console.error('Migration failed:', (err as Error).message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
