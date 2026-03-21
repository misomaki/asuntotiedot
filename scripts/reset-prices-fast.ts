import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Strategy: paginate ALL building IDs first (fast, read-only),
// then fire parallel update batches against known ID ranges.
async function resetFast() {
  console.log('Phase 1: Collecting building IDs...')

  // Collect all IDs that need reset, paginated by cursor
  const allIds: string[] = []
  let cursor = '00000000-0000-0000-0000-000000000000'

  while (true) {
    // No filter — reset ALL buildings (faster than scanning for non-null)
    const { data: rows, error } = await supabase
      .from('buildings')
      .select('id')
      .gt('id', cursor)
      .order('id', { ascending: true })
      .limit(1000)

    if (error) {
      console.error('Select error:', error.message)
      await new Promise(r => setTimeout(r, 1000))
      continue
    }
    if (!rows || rows.length === 0) break

    for (const r of rows) allIds.push(r.id)
    cursor = rows[rows.length - 1].id
    if (allIds.length % 50000 === 0) console.log(`  Collected ${allIds.length} IDs...`)
  }

  console.log(`Phase 1 done: ${allIds.length} buildings to reset`)

  // Phase 2: fire updates in parallel batches of 100 IDs
  console.log('Phase 2: Updating in parallel...')
  const BATCH = 100
  const CONCURRENCY = 10
  let total = 0
  let i = 0

  while (i < allIds.length) {
    const promises: PromiseLike<void>[] = []

    for (let c = 0; c < CONCURRENCY && i < allIds.length; c++) {
      const batch = allIds.slice(i, i + BATCH)
      i += BATCH

      promises.push(
        supabase
          .from('buildings')
          .update({ estimation_year: null, estimated_price_per_sqm: null })
          .in('id', batch)
          .then(({ error }) => {
            if (error) console.error('Update error:', error.message)
          })
      )
    }

    await Promise.all(promises)
    total += Math.min(CONCURRENCY * BATCH, allIds.length - (i - CONCURRENCY * BATCH))

    if (total % 10000 < CONCURRENCY * BATCH) {
      console.log(`Reset ${Math.min(i, allIds.length)}/${allIds.length} buildings...`)
    }
  }

  console.log(`Done! Total reset: ${allIds.length}`)
}

resetFast()
