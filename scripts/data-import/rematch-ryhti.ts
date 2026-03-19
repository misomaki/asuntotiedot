/**
 * Re-run Ryhti matching for construction_year and floor_count.
 *
 * Uses existing data in _ryhti_staging (369K records) — does NOT
 * re-download from SYKE. Just calls the matching RPCs in batches.
 *
 * Usage: npx tsx scripts/data-import/rematch-ryhti.ts
 */

import { supabase } from './lib/supabaseAdmin'

const BATCH_SIZE = 500
const MAX_RETRIES = 3

async function matchConstructionYears(): Promise<number> {
  console.log('Matching construction years...\n')

  const { count } = await supabase
    .from('buildings')
    .select('id', { count: 'estimated', head: true })
    .not('area_id', 'is', null)
    .is('construction_year', null)

  console.log(`Buildings without construction_year: ${count ?? 'unknown'}`)

  let totalMatched = 0
  let batchNum = 0
  let consecutiveEmpty = 0
  const startTime = Date.now()

  while (true) {
    batchNum++

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const { data, error } = await supabase.rpc('match_ryhti_to_buildings_batch', {
        p_limit: BATCH_SIZE,
      })

      if (!error) {
        const batchCount = typeof data === 'number' ? data : 0

        if (batchCount === 0) {
          consecutiveEmpty++
          if (consecutiveEmpty > 5) {
            console.log('No more buildings to match.')
            return totalMatched
          }
          break
        }

        consecutiveEmpty = 0
        totalMatched += batchCount

        if (batchNum % 20 === 0 || batchCount < BATCH_SIZE) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
          const rate = (totalMatched / (Number(elapsed) || 1)).toFixed(1)
          console.log(
            `  Batch ${batchNum}: total ${totalMatched}${count ? `/${count}` : ''} (${elapsed}s, ${rate}/s)`
          )
        }
        break
      }

      if (error.message.includes('statement timeout') && attempt < MAX_RETRIES) {
        console.log(`  Timeout at batch ${batchNum}, retry ${attempt}...`)
        continue
      }

      console.error(`  Error at batch ${batchNum}: ${error.message}`)
      if (attempt === MAX_RETRIES) {
        console.error('Max retries reached, stopping.')
        return totalMatched
      }
    }
  }
}

async function matchFloorCounts(): Promise<number> {
  console.log('\nMatching floor counts...\n')

  const { count } = await supabase
    .from('buildings')
    .select('id', { count: 'estimated', head: true })
    .not('area_id', 'is', null)
    .not('construction_year', 'is', null)
    .is('floor_count', null)

  console.log(`Buildings with year but without floor_count: ${count ?? 'unknown'}`)

  let totalMatched = 0
  let batchNum = 0
  let consecutiveEmpty = 0
  const startTime = Date.now()

  while (true) {
    batchNum++

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const { data, error } = await supabase.rpc('match_ryhti_floors_batch', {
        p_limit: BATCH_SIZE,
      })

      if (!error) {
        const batchCount = typeof data === 'number' ? data : 0

        if (batchCount === 0) {
          consecutiveEmpty++
          if (consecutiveEmpty > 5) {
            console.log('No more buildings to match.')
            return totalMatched
          }
          break
        }

        consecutiveEmpty = 0
        totalMatched += batchCount

        if (batchNum % 20 === 0 || batchCount < BATCH_SIZE) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
          const rate = (totalMatched / (Number(elapsed) || 1)).toFixed(1)
          console.log(
            `  Batch ${batchNum}: total ${totalMatched}${count ? `/${count}` : ''} (${elapsed}s, ${rate}/s)`
          )
        }
        break
      }

      if (error.message.includes('statement timeout') && attempt < MAX_RETRIES) {
        console.log(`  Timeout at batch ${batchNum}, retry ${attempt}...`)
        continue
      }

      console.error(`  Error at batch ${batchNum}: ${error.message}`)
      if (attempt === MAX_RETRIES) {
        console.error('Max retries reached, stopping.')
        return totalMatched
      }
    }
  }
}

async function main() {
  console.log('=== Re-match Ryhti Data (staging → buildings) ===\n')

  // Verify staging data exists
  const { count: stagingCount } = await supabase
    .from('_ryhti_staging')
    .select('permanent_building_identifier', { count: 'exact', head: true })

  console.log(`Ryhti staging records: ${stagingCount}\n`)

  if (!stagingCount || stagingCount === 0) {
    console.error('Staging table is empty! Run script 06 first.')
    process.exit(1)
  }

  const yearMatches = await matchConstructionYears()
  const floorMatches = await matchFloorCounts()

  // Final stats
  const { count: hasYear } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('construction_year', 'is', null)

  const { count: total } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })

  console.log(`\n=== Summary ===`)
  console.log(`Construction years matched: ${yearMatches}`)
  console.log(`Floor counts matched: ${floorMatches}`)
  console.log(`Total buildings with year: ${hasYear}/${total} (${Math.round(((hasYear ?? 0) / (total ?? 1)) * 100)}%)`)
  console.log(`\nNext: npx tsx scripts/data-import/05-compute-building-prices.ts`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
