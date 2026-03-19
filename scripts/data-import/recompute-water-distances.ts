/**
 * Recompute water distances per area using small batches.
 *
 * The default RPC times out on Supabase's 8-second PostgREST limit.
 * This script processes buildings area-by-area with tiny batches (20)
 * and retries on timeout, making steady progress.
 *
 * Usage: npx tsx scripts/data-import/recompute-water-distances.ts
 */

import { supabase } from './lib/supabaseAdmin'

const BATCH_SIZE = 20  // Small enough to finish within 8s timeout
const MAX_RETRIES = 3

async function computeBatch(): Promise<number> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { data, error } = await supabase.rpc('compute_water_distances_batch', {
      p_limit: BATCH_SIZE,
    })

    if (!error) {
      return typeof data === 'number' ? data : 0
    }

    if (error.message.includes('statement timeout') && attempt < MAX_RETRIES) {
      // Timeout — some rows may have been processed anyway, retry
      continue
    }

    throw new Error(`RPC failed: ${error.message}`)
  }
  return 0
}

async function main() {
  console.log('=== Recompute Water Distances (small batches) ===\n')

  const { count } = await supabase
    .from('buildings')
    .select('id', { count: 'estimated', head: true })
    .not('area_id', 'is', null)
    .is('min_distance_to_water_m', null)

  console.log(`Buildings needing water distance: ${count ?? 'unknown'}`)

  let totalUpdated = 0
  let batchNum = 0
  let consecutiveTimeouts = 0
  const startTime = Date.now()

  while (true) {
    batchNum++

    try {
      const batchCount = await computeBatch()

      if (batchCount === 0) {
        // Check if truly done or just a timeout artifact
        const { count: remaining } = await supabase
          .from('buildings')
          .select('id', { count: 'estimated', head: true })
          .not('area_id', 'is', null)
          .is('min_distance_to_water_m', null)

        if (!remaining || remaining === 0) break
        // There are still buildings to process — might be a transient issue
        consecutiveTimeouts++
        if (consecutiveTimeouts > 10) {
          console.error('10 consecutive empty batches with remaining buildings. Stopping.')
          break
        }
        continue
      }

      consecutiveTimeouts = 0
      totalUpdated += batchCount

      if (batchNum % 100 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
        const rate = (totalUpdated / (elapsed as unknown as number)).toFixed(1)
        console.log(
          `  Batch ${batchNum}: total ${totalUpdated}${count ? `/${count}` : ''} (${elapsed}s, ${rate}/s)`
        )
      }
    } catch (err) {
      console.error(`  Error at batch ${batchNum}: ${(err as Error).message}`)
      consecutiveTimeouts++
      if (consecutiveTimeouts > 5) {
        console.error('Too many consecutive errors. Stopping.')
        break
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
  console.log(`\nDone: ${totalUpdated} buildings in ${elapsed}s`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
