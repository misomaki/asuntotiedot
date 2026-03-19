-- ============================================================
-- Migration 010: Fix water distance calculation
-- ============================================================
-- Two bugs in compute_water_distances_batch():
--   1. Used building centroid instead of polygon edge for distance
--   2. LIMIT 3 on KNN was too restrictive, missing nearest water
--
-- After deploying:
--   1. Re-import water bodies (adds relation-type lakes):
--      npx tsx scripts/data-import/04-import-water-bodies.ts
--   2. Reset distances:
--      UPDATE buildings SET min_distance_to_water_m = NULL;
--   3. Recompute distances:
--      npx tsx scripts/data-import/04-import-water-bodies.ts --distances-only
--   4. Reset prices and recompute:
--      UPDATE buildings SET estimation_year = NULL;
--      npx tsx scripts/data-import/05-compute-building-prices.ts
-- ============================================================

CREATE OR REPLACE FUNCTION compute_water_distances_batch(p_limit INT DEFAULT 500)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE buildings b
  SET min_distance_to_water_m = sub.dist
  FROM (
    SELECT b2.id,
      COALESCE(
        (SELECT MIN(ST_Distance(b2.geometry::geography, w.geometry::geography))
         FROM (
           SELECT geometry FROM water_bodies
           ORDER BY b2.centroid <-> geometry
           LIMIT 5
         ) w
        ),
        99999
      ) AS dist
    FROM buildings b2
    WHERE b2.centroid IS NOT NULL
      AND b2.geometry IS NOT NULL
      AND b2.min_distance_to_water_m IS NULL
      AND b2.area_id IS NOT NULL
    LIMIT p_limit
  ) sub
  WHERE b.id = sub.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
