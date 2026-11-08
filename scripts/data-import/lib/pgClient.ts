/**
 * Direct Postgres client for data scripts that need bulk reads, geometry
 * functions or multi-row inserts (faster and simpler than paginating the
 * Supabase REST client 1 000 rows at a time).
 *
 * Requires DATABASE_URL in .env.local (same as scripts/run-sql.ts).
 */

import { resolve } from 'path'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: resolve(__dirname, '../../../.env.local') })

export async function getPgClient(statementTimeout = '600s'): Promise<pg.Client> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL in .env.local')
  }
  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  await client.query(`SET statement_timeout = '${statementTimeout}'`)
  return client
}

/**
 * Insert rows in batches using a single multi-row INSERT per batch.
 * `columns` must list every key of each row in order.
 */
export async function bulkInsert(
  client: pg.Client,
  table: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
  batchSize = 500
): Promise<number> {
  let inserted = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const values: unknown[] = []
    const placeholders = batch.map((row, r) => {
      const ph = columns.map((c, k) => {
        values.push(row[c] ?? null)
        return `$${r * columns.length + k + 1}`
      })
      return `(${ph.join(', ')})`
    })
    await client.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders.join(', ')}`,
      values
    )
    inserted += batch.length
  }
  return inserted
}
