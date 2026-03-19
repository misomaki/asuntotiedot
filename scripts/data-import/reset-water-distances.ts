/**
 * Reset water distances using Supabase JS client.
 * Works per-area (postal code) to keep each UPDATE small enough
 * to avoid PostgREST statement timeout.
 *
 * Usage: npx tsx scripts/data-import/reset-water-distances.ts
 */

import { supabase } from './lib/supabaseAdmin'

async function main() {
  console.log('=== Reset Water Distances ===\n')

  // Count buildings with existing distances
  const { count: totalWithDistance } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('min_distance_to_water_m', 'is', null)

  console.log(`Buildings with water distance: ${totalWithDistance}`)

  if (!totalWithDistance || totalWithDistance === 0) {
    console.log('Nothing to reset.')
    return
  }

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
  let failedAreas = 0

  // Process one area at a time — each has ~500-3000 buildings
  for (let i = 0; i < areas.length; i++) {
    const area = areas[i]

    const { error, count } = await supabase
      .from('buildings')
      .update({ min_distance_to_water_m: null }, { count: 'exact' })
      .eq('area_id', area.id)
      .not('min_distance_to_water_m', 'is', null)

    if (error) {
      console.error(`  FAIL ${area.name} (${area.municipality}): ${error.message}`)
      failedAreas++
      continue
    }

    totalReset += count ?? 0

    if ((i + 1) % 50 === 0 || i === areas.length - 1) {
      console.log(`  Progress: ${i + 1}/${areas.length} areas, ${totalReset} buildings reset`)
    }
  }

  // Also handle buildings without area_id
  const { error: noAreaErr, count: noAreaCount } = await supabase
    .from('buildings')
    .update({ min_distance_to_water_m: null }, { count: 'exact' })
    .is('area_id', null)
    .not('min_distance_to_water_m', 'is', null)

  if (!noAreaErr && noAreaCount) {
    totalReset += noAreaCount
    console.log(`  No-area buildings: ${noAreaCount}`)
  }

  console.log(`\nTotal reset: ${totalReset} / ${totalWithDistance}`)
  if (failedAreas > 0) {
    console.log(`Failed areas: ${failedAreas}`)
  }

  // Verify
  const { count: remaining } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('min_distance_to_water_m', 'is', null)

  console.log(`Remaining with distance: ${remaining ?? 0}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
