/**
 * Reset estimation_year in batches to avoid Supabase timeout.
 * Works per-area (postal code) to keep each UPDATE small.
 *
 * Usage: npx tsx scripts/data-import/reset-estimation-year.ts
 */

import { supabase } from './lib/supabaseAdmin'

async function main() {
  console.log('=== Reset Estimation Year ===\n')

  // Get all area IDs
  const { data: areas, error: aErr } = await supabase
    .from('areas')
    .select('id, name, municipality')

  if (aErr || !areas) {
    console.error('Failed to fetch areas:', aErr?.message)
    process.exit(1)
  }

  console.log(`Areas: ${areas.length}\n`)

  let totalReset = 0

  for (let i = 0; i < areas.length; i++) {
    const area = areas[i]

    const { error, count } = await supabase
      .from('buildings')
      .update({ estimation_year: null }, { count: 'exact' })
      .eq('area_id', area.id)
      .not('estimation_year', 'is', null)

    if (error) {
      console.error(`  FAIL ${area.name}: ${error.message}`)
      continue
    }

    totalReset += count ?? 0

    if ((i + 1) % 50 === 0 || i === areas.length - 1) {
      console.log(`  Progress: ${i + 1}/${areas.length} areas, ${totalReset} buildings reset`)
    }
  }

  console.log(`\nTotal reset: ${totalReset}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
