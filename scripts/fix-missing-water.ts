import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 23K buildings have centroids but no area_id.
// The compute_water_distances_batch RPC skips them (requires area_id).
// Fix: call a modified version that only requires centroid.
async function fixMissing() {
  console.log('=== Fix Missing Water Distances ===\n')

  // Step 1: Create a fixed function via RPC-based workaround
  // Since we can't CREATE FUNCTION via REST, we'll ask the user to
  // deploy a one-liner SQL fix first. But let's try the batched approach
  // by temporarily setting area_id to a dummy value, computing, then resetting.

  // Actually simplest: just use the existing function but first assign
  // these orphan buildings to their nearest area.

  // Even simpler: these 23K buildings are OUTSIDE our postal code areas.
  // They have centroids but fell outside all PostGIS polygons during
  // assign_buildings_to_areas. They'll never get a price estimate anyway
  // (no base price without area_id). But they should still get a real
  // water distance so the map shows correct colors if we ever assign them.

  // Best practical fix: compute water distance directly. Since we can't
  // modify the RPC, we'll compute it client-side using a simpler query.

  // For each batch of buildings, get their centroid lat/lng, then for each
  // find the nearest water body distance using a PostGIS query.

  // Actually, the FASTEST fix: deploy a one-line SQL change to the
  // compute_water_distances_batch function removing the area_id filter,
  // then run recompute-water-distances.ts.
  // But user already ran migration 017. Let's just do the fix inline.

  // Plan: batch through buildings missing water distance, use RPC
  // to compute distance for each batch directly.

  console.log('Computing real water distances for 23K orphan buildings...')
  console.log('(These have centroids but no area_id)\n')

  let total = 0
  let batchNum = 0
  const BATCH = 20  // Small to avoid timeout (spatial joins are expensive)
  const MAX_ERRORS = 20
  let errors = 0

  while (true) {
    batchNum++

    // Try the existing RPC but it requires area_id... let's use a custom query
    const { data, error } = await supabase.rpc('compute_water_distances_no_area', {
      p_limit: BATCH
    })

    if (error) {
      if (error.message.includes('does not exist')) {
        console.log('RPC compute_water_distances_no_area not found.')
        console.log('Please deploy this SQL in Supabase SQL Editor:\n')
        console.log(`CREATE OR REPLACE FUNCTION compute_water_distances_no_area(p_limit INT DEFAULT 20)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE buildings b
  SET min_distance_to_water_m = sub.dist
  FROM (
    SELECT b2.id,
      COALESCE(
        (SELECT MIN(ST_Distance(
           ST_Transform(b2.centroid, 3067),
           w.geometry_3067
         ))
         FROM (
           SELECT geometry_3067 FROM water_bodies
           ORDER BY b2.centroid <-> geometry_simplified
           LIMIT 5
         ) w
        ),
        99999
      ) AS dist
    FROM buildings b2
    WHERE b2.centroid IS NOT NULL
      AND b2.min_distance_to_water_m IS NULL
    LIMIT p_limit
  ) sub
  WHERE b.id = sub.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;`)
        console.log('\nThen re-run this script.')
        break
      }

      console.error(`Error at batch ${batchNum}:`, error.message)
      errors++
      if (errors > MAX_ERRORS) {
        console.error('Too many errors, stopping.')
        break
      }
      await new Promise(r => setTimeout(r, 2000))
      continue
    }

    const count = typeof data === 'number' ? data : 0
    if (count === 0) {
      // Verify we're actually done
      const { data: check } = await supabase
        .from('buildings')
        .select('id', { count: 'estimated', head: true })
        .is('min_distance_to_water_m', null)
        .not('centroid', 'is', null)

      if (!check || (check as unknown as number) === 0) break
      errors++
      if (errors > 5) break
      continue
    }

    errors = 0
    total += count
    if (batchNum % 50 === 0) {
      console.log(`  Batch ${batchNum}: total ${total} buildings computed`)
    }
  }

  console.log(`\nDone: computed water distance for ${total} buildings`)
}

fixMissing()
