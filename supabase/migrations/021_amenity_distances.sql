-- ============================================================
-- Migration 021: Amenity POI staging + distance computation
--
-- Stores OSM amenity points (schools, kindergartens, grocery,
-- transit, parks, health) and computes nearest distances to
-- each building via PostGIS.
--
-- After deploying:
--   npx tsx scripts/data-import/11-import-amenity-distances.ts
-- ============================================================

-- Staging table for amenity POIs
CREATE TABLE IF NOT EXISTS _amenity_staging (
  osm_id BIGINT NOT NULL,
  amenity_type TEXT NOT NULL,  -- 'school', 'kindergarten', 'grocery', 'transit', 'park', 'health'
  name TEXT,
  geometry GEOMETRY(Point, 4326),
  PRIMARY KEY (osm_id, amenity_type)
);

CREATE INDEX IF NOT EXISTS idx_amenity_staging_geom
  ON _amenity_staging USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_amenity_staging_type
  ON _amenity_staging (amenity_type);

-- Batch compute nearest amenity distance for a given type
-- Updates buildings that don't yet have a distance for this amenity type.
CREATE OR REPLACE FUNCTION compute_amenity_distance_batch(
  p_amenity_type TEXT,
  p_column_name TEXT,
  p_limit INT DEFAULT 500
)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  -- Dynamic SQL to handle different column names
  EXECUTE format(
    'UPDATE buildings b
     SET %I = sub.distance_m
     FROM (
       SELECT b2.id,
         (SELECT ST_Distance(
           ST_Transform(b2.centroid, 3067),
           ST_Transform(a.geometry, 3067)
         )
         FROM _amenity_staging a
         WHERE a.amenity_type = $1
           AND ST_DWithin(b2.centroid, a.geometry, 0.05)  -- ~5km pre-filter
         ORDER BY b2.centroid <-> a.geometry
         LIMIT 1) AS distance_m
       FROM buildings b2
       WHERE b2.centroid IS NOT NULL
         AND b2.%I IS NULL
       LIMIT $2
     ) sub
     WHERE b.id = sub.id
       AND sub.distance_m IS NOT NULL',
    p_column_name, p_column_name
  ) USING p_amenity_type, p_limit;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
