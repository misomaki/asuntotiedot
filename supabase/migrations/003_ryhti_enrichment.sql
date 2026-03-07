-- ============================================================
-- Migration 003: Ryhti building registry enrichment
-- ============================================================
-- Staging table + RPC functions for matching Ryhti (SYKE) building
-- attributes to existing OSM buildings by spatial proximity.
--
-- Run this SQL in the Supabase SQL Editor before script 06.

-- ============================================================
-- Staging table for Ryhti OGC API Features data
-- ============================================================
CREATE TABLE IF NOT EXISTS _ryhti_staging (
  permanent_building_identifier TEXT PRIMARY KEY,
  completion_year INT,
  number_of_storeys INT,
  main_purpose TEXT,
  apartment_count INT,
  geometry GEOMETRY(Point, 4326)
);

CREATE INDEX IF NOT EXISTS idx_ryhti_staging_geom
  ON _ryhti_staging USING GIST(geometry);

-- ============================================================
-- Clear staging table between runs
-- ============================================================
CREATE OR REPLACE FUNCTION clear_ryhti_staging()
RETURNS VOID AS $$
BEGIN
  TRUNCATE _ryhti_staging;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Batch insert Ryhti buildings from JSONB array
-- ============================================================
-- Each element: {"id":"...", "year":1920, "storeys":5, "lng":24.94, "lat":60.17}
-- ON CONFLICT DO NOTHING handles duplicates
CREATE OR REPLACE FUNCTION insert_ryhti_batch(p_buildings JSONB)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO _ryhti_staging (
    permanent_building_identifier,
    completion_year,
    number_of_storeys,
    main_purpose,
    apartment_count,
    geometry
  )
  SELECT
    b->>'id',
    (b->>'year')::INT,
    (b->>'storeys')::INT,
    b->>'purpose',
    (b->>'apartments')::INT,
    ST_SetSRID(ST_MakePoint((b->>'lng')::DOUBLE PRECISION, (b->>'lat')::DOUBLE PRECISION), 4326)
  FROM jsonb_array_elements(p_buildings) AS b
  WHERE b->>'id' IS NOT NULL
    AND (b->>'lng')::DOUBLE PRECISION IS NOT NULL
    AND (b->>'lat')::DOUBLE PRECISION IS NOT NULL
  ON CONFLICT (permanent_building_identifier) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Match Ryhti → buildings: construction_year + floor_count
-- ============================================================
-- For buildings missing construction_year, find nearest Ryhti
-- point within 50m and copy year + floor count.
-- Resets estimation_year so prices are recalculated.
CREATE OR REPLACE FUNCTION match_ryhti_to_buildings_batch(p_limit INT DEFAULT 500)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE buildings b
  SET
    construction_year = sub.ryhti_year,
    floor_count = COALESCE(b.floor_count, sub.ryhti_storeys),
    estimated_price_per_sqm = NULL,
    estimation_year = NULL
  FROM (
    SELECT b2.id,
      nearest.completion_year AS ryhti_year,
      nearest.number_of_storeys AS ryhti_storeys
    FROM buildings b2
    CROSS JOIN LATERAL (
      SELECT rs.completion_year, rs.number_of_storeys, rs.geometry
      FROM _ryhti_staging rs
      WHERE rs.completion_year IS NOT NULL
      ORDER BY b2.centroid <-> rs.geometry
      LIMIT 1
    ) nearest
    WHERE b2.centroid IS NOT NULL
      AND b2.area_id IS NOT NULL
      AND b2.construction_year IS NULL
      AND ST_Distance(b2.centroid::geography, nearest.geometry::geography) < 50
    LIMIT p_limit
  ) sub
  WHERE b.id = sub.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Match Ryhti → buildings: floor_count only
-- ============================================================
-- For buildings that already have construction_year (from OSM)
-- but are missing floor_count.
CREATE OR REPLACE FUNCTION match_ryhti_floors_batch(p_limit INT DEFAULT 500)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE buildings b
  SET
    floor_count = sub.ryhti_storeys,
    estimated_price_per_sqm = NULL,
    estimation_year = NULL
  FROM (
    SELECT b2.id,
      nearest.number_of_storeys AS ryhti_storeys
    FROM buildings b2
    CROSS JOIN LATERAL (
      SELECT rs.number_of_storeys, rs.geometry
      FROM _ryhti_staging rs
      WHERE rs.number_of_storeys IS NOT NULL
      ORDER BY b2.centroid <-> rs.geometry
      LIMIT 1
    ) nearest
    WHERE b2.centroid IS NOT NULL
      AND b2.area_id IS NOT NULL
      AND b2.construction_year IS NOT NULL
      AND b2.floor_count IS NULL
      AND ST_Distance(b2.centroid::geography, nearest.geometry::geography) < 50
    LIMIT p_limit
  ) sub
  WHERE b.id = sub.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
