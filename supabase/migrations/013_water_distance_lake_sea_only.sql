-- ============================================================
-- Filter water distance to lakes and sea only (no ponds/rivers)
-- ============================================================
-- Problem: Water proximity premium was triggered by small ponds,
-- drainage basins, and rivers. Only actual lakes and the sea
-- should affect property prices.
--
-- Performance: Finnish lake MultiPolygons are complex (thousands of
-- vertices). The ::geography cast in ST_Distance triggers expensive
-- geodetic math per vertex. Solution:
--   1. Simplify geometries (ST_Simplify, ~50m tolerance)
--   2. Pre-transform to EPSG:3067 (Finnish ETRS-TM35FIN meters)
--   3. Compute distance as pure Euclidean math (instant)
--
-- After deploying:
--   1. npx tsx scripts/data-import/recompute-water-distances.ts
--   2. npx tsx scripts/data-import/reset-estimation-year.ts
--   3. npx tsx scripts/data-import/05-compute-building-prices.ts
-- ============================================================

-- Step 1: Add columns
ALTER TABLE water_bodies ADD COLUMN IF NOT EXISTS area_sqm NUMERIC;
ALTER TABLE water_bodies ADD COLUMN IF NOT EXISTS geometry_simplified GEOMETRY(MultiPolygon, 4326);
ALTER TABLE water_bodies ADD COLUMN IF NOT EXISTS geometry_3067 GEOMETRY(MultiPolygon, 3067);

-- Step 2: Pre-compute areas
UPDATE water_bodies
SET area_sqm = ST_Area(geometry::geography)
WHERE area_sqm IS NULL;

-- Step 3: Delete non-qualifying water bodies
DELETE FROM water_bodies WHERE water_type NOT IN ('lake', 'sea');
DELETE FROM water_bodies WHERE water_type = 'lake' AND area_sqm <= 10000;

-- Step 4: Pre-compute simplified + projected geometries
UPDATE water_bodies
SET geometry_simplified = ST_Simplify(geometry, 0.0005)
WHERE geometry_simplified IS NULL;

UPDATE water_bodies
SET geometry_3067 = ST_Transform(COALESCE(geometry_simplified, geometry), 3067)
WHERE geometry_3067 IS NULL;

-- Step 5: Indexes
CREATE INDEX IF NOT EXISTS idx_water_geom_simplified
  ON water_bodies USING GIST (geometry_simplified);
CREATE INDEX IF NOT EXISTS idx_water_geom_3067
  ON water_bodies USING GIST (geometry_3067);

-- Step 6: Fast batch function — Euclidean distance in meters via EPSG:3067
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
      AND b2.area_id IS NOT NULL
    LIMIT p_limit
  ) sub
  WHERE b.id = sub.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
