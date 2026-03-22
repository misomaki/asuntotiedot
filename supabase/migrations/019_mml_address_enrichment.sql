-- ============================================================
-- Migration 019: MML address enrichment
--
-- Import addresses from MML (Maanmittauslaitos) INSPIRE Simple
-- Addresses API and match to buildings by PostGIS proximity.
-- OSM address coverage in Finland is ~40-60%; MML covers >95%.
--
-- After deploying:
--   npx tsx scripts/data-import/10-import-mml-addresses.ts
-- ============================================================

-- Staging table for MML address points
CREATE TABLE IF NOT EXISTS _mml_address_staging (
  inspire_id TEXT PRIMARY KEY,
  street_name TEXT NOT NULL,
  house_number TEXT,
  postal_code TEXT,
  municipality TEXT,
  geometry GEOMETRY(Point, 4326)
);

CREATE INDEX IF NOT EXISTS idx_mml_staging_geom
  ON _mml_address_staging USING GIST(geometry);

-- Batch matching: assign nearest MML address to buildings within 30m.
-- Only updates buildings that don't already have an address (from OSM).
-- Uses ST_DWithin as bounding box pre-filter for performance (~0.0003° ≈ 30m).
CREATE OR REPLACE FUNCTION match_mml_addresses_batch(p_limit INT DEFAULT 500)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE buildings b
  SET address = sub.full_address
  FROM (
    SELECT b2.id,
      CASE
        WHEN nearest.house_number IS NOT NULL AND nearest.house_number != ''
        THEN nearest.street_name || ' ' || nearest.house_number
        ELSE nearest.street_name
      END AS full_address
    FROM buildings b2
    CROSS JOIN LATERAL (
      SELECT rs.street_name, rs.house_number, rs.geometry
      FROM _mml_address_staging rs
      WHERE rs.street_name IS NOT NULL
        AND rs.street_name != ''
        AND ST_DWithin(b2.centroid, rs.geometry, 0.0004)  -- bbox pre-filter ~40m
      ORDER BY b2.centroid <-> rs.geometry
      LIMIT 1
    ) nearest
    WHERE b2.centroid IS NOT NULL
      AND b2.address IS NULL
      AND ST_Distance(
        ST_Transform(b2.centroid, 3067),
        ST_Transform(nearest.geometry, 3067)
      ) < 30
    LIMIT p_limit
  ) sub
  WHERE b.id = sub.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
