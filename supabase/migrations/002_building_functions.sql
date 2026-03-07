-- ============================================================
-- Migration 002: RPC functions for building processing
-- ============================================================
-- Run this SQL in the Supabase SQL Editor before scripts 03-05.

-- Add osm_id column to water_bodies for deduplication
ALTER TABLE water_bodies ADD COLUMN IF NOT EXISTS osm_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_water_osm_id
  ON water_bodies(osm_id) WHERE osm_id IS NOT NULL;

-- ============================================================
-- Assign buildings to postal code areas via spatial join
-- ============================================================
CREATE OR REPLACE FUNCTION assign_buildings_to_areas()
RETURNS TEXT AS $$
DECLARE
  v_centroids INT;
  v_assigned INT;
  v_footprints INT;
BEGIN
  -- Step 1: Compute centroids
  UPDATE buildings SET centroid = ST_Centroid(geometry)
  WHERE centroid IS NULL AND geometry IS NOT NULL;
  GET DIAGNOSTICS v_centroids = ROW_COUNT;

  -- Step 2: Spatial join — assign area_id
  UPDATE buildings b SET area_id = a.id
  FROM areas a
  WHERE ST_Contains(a.geometry, b.centroid)
    AND b.area_id IS NULL;
  GET DIAGNOSTICS v_assigned = ROW_COUNT;

  -- Step 3: Compute footprint area in m²
  UPDATE buildings SET footprint_area_sqm = ST_Area(geometry::geography)
  WHERE footprint_area_sqm IS NULL AND geometry IS NOT NULL;
  GET DIAGNOSTICS v_footprints = ROW_COUNT;

  RETURN format('centroids=%s, assigned=%s, footprints=%s',
    v_centroids, v_assigned, v_footprints);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Compute nearest water distance for a batch of buildings
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
        (SELECT MIN(ST_Distance(b2.centroid::geography, w.geometry::geography))
         FROM (
           SELECT geometry FROM water_bodies
           ORDER BY b2.centroid <-> geometry
           LIMIT 3
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

-- ============================================================
-- Compute building prices in batches using the SQL function
-- ============================================================
CREATE OR REPLACE FUNCTION compute_all_building_prices(
  p_year INT,
  p_limit INT DEFAULT 1000
)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE buildings
  SET
    estimated_price_per_sqm = compute_building_price(
      area_id, construction_year, min_distance_to_water_m,
      floor_count, building_type, p_year
    ),
    estimation_year = p_year
  WHERE area_id IS NOT NULL
    AND estimation_year IS NULL
    AND id IN (
      SELECT id FROM buildings
      WHERE area_id IS NOT NULL AND estimation_year IS NULL
      LIMIT p_limit
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
