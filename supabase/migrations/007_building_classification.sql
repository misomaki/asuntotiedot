-- ============================================================
-- Migration 007: Building classification — residential vs non-residential
-- ============================================================
-- Adds persistent is_residential classification using:
--   1. Ryhti main_purpose code (highest authority)
--   2. OSM building_type denylist
--   3. Footprint area heuristic (< 30 m² → auxiliary)
--
-- Non-residential buildings are skipped in price computation.
--
-- After deploying this, run:
--   npx tsx scripts/data-import/07-classify-buildings.ts
--   npx tsx scripts/data-import/05-compute-building-prices.ts
-- ============================================================

-- ============================================================
-- 1a. Add columns
-- ============================================================
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS ryhti_main_purpose TEXT;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS is_residential BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_buildings_is_residential
  ON buildings (is_residential) WHERE is_residential = true;

-- ============================================================
-- 1b. Copy main_purpose from Ryhti staging → buildings
-- ============================================================
-- Same CROSS JOIN LATERAL + 50m pattern as match_ryhti_to_buildings_batch (003)
CREATE OR REPLACE FUNCTION match_ryhti_purpose_batch(p_limit INT DEFAULT 500)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE buildings b
  SET ryhti_main_purpose = sub.ryhti_purpose
  FROM (
    SELECT b2.id,
      nearest.main_purpose AS ryhti_purpose
    FROM buildings b2
    CROSS JOIN LATERAL (
      SELECT rs.main_purpose, rs.geometry
      FROM _ryhti_staging rs
      WHERE rs.main_purpose IS NOT NULL
      ORDER BY b2.centroid <-> rs.geometry
      LIMIT 1
    ) nearest
    WHERE b2.centroid IS NOT NULL
      AND b2.area_id IS NOT NULL
      AND b2.ryhti_main_purpose IS NULL
      AND ST_Distance(b2.centroid::geography, nearest.geometry::geography) < 50
    LIMIT p_limit
  ) sub
  WHERE b.id = sub.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1c. Compute is_residential using 3-tier classification
-- ============================================================
-- Tier 1 (Ryhti): main_purpose LIKE '01%' → residential
-- Tier 2 (OSM):   building_type in denylist → non-residential
-- Tier 3 (Area):  footprint_area_sqm < 30 → auxiliary (non-residential)
-- Default: true (conservative — don't miss real houses)
CREATE OR REPLACE FUNCTION compute_is_residential_batch(p_limit INT DEFAULT 5000)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE buildings
  SET is_residential = CASE
    -- Tier 1: Ryhti main_purpose (highest authority)
    -- 01xx = asuinrakennukset (residential buildings)
    WHEN ryhti_main_purpose IS NOT NULL AND ryhti_main_purpose LIKE '01%' THEN true
    WHEN ryhti_main_purpose IS NOT NULL AND ryhti_main_purpose NOT LIKE '01%' THEN false

    -- Tier 2: OSM building_type denylist
    WHEN building_type IN (
      'office', 'hotel', 'civic', 'commercial', 'retail',
      'industrial', 'warehouse', 'church', 'chapel',
      'hospital', 'school', 'university', 'kindergarten',
      'public', 'government', 'transportation', 'train_station',
      'garage', 'garages', 'shed', 'barn', 'farm_auxiliary',
      'sports_hall', 'sports_centre', 'grandstand', 'pavilion',
      'greenhouse', 'hangar', 'manufacture', 'service',
      'storage_tank', 'silo', 'transformer_tower',
      'fire_station', 'toilets', 'kiosk', 'ruins',
      'water_tower', 'bunker', 'bridge', 'carport',
      'roof', 'container', 'construction'
    ) THEN false

    -- Tier 3: Footprint area heuristic
    -- Very small buildings (< 30 m²) are typically auxiliary
    WHEN footprint_area_sqm IS NOT NULL AND footprint_area_sqm < 30 THEN false

    -- Default: assume residential (conservative)
    ELSE true
  END
  WHERE is_residential IS NULL
    AND area_id IS NOT NULL
    AND id IN (
      SELECT id FROM buildings
      WHERE is_residential IS NULL AND area_id IS NOT NULL
      LIMIT p_limit
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1d. Update get_buildings_mvt() — use stored is_residential
-- ============================================================
CREATE OR REPLACE FUNCTION get_buildings_mvt(z INT, x INT, y INT)
RETURNS TEXT AS $$
DECLARE
  bbox GEOMETRY;
  mvt BYTEA;
BEGIN
  bbox := ST_TileEnvelope(z, x, y);

  SELECT INTO mvt ST_AsMVT(tile, 'buildings', 4096, 'geom')
  FROM (
    SELECT
      b.id::text AS id,
      b.building_type,
      b.construction_year,
      b.floor_count,
      b.address,
      b.estimated_price_per_sqm::float8 AS price,
      COALESCE(b.is_residential, true) AS is_residential,
      b.ryhti_main_purpose,
      ST_AsMVTGeom(
        ST_Transform(b.geometry, 3857),
        bbox,
        4096,
        256,
        true
      ) AS geom
    FROM buildings b
    WHERE b.geometry && ST_Transform(bbox, 4326)
  ) AS tile
  WHERE tile.geom IS NOT NULL;

  RETURN COALESCE(encode(mvt, 'base64'), '');
END;
$$ LANGUAGE plpgsql STABLE PARALLEL SAFE;

-- ============================================================
-- 1e. Update compute_all_building_prices() — skip non-residential
-- ============================================================
CREATE OR REPLACE FUNCTION compute_all_building_prices(
  p_year INT,
  p_limit INT DEFAULT 1000
)
RETURNS INT AS $$
DECLARE
  v_count INT;
  v_skipped INT;
BEGIN
  -- First: mark non-residential buildings as processed (no price)
  UPDATE buildings
  SET estimation_year = p_year
  WHERE area_id IS NOT NULL
    AND estimation_year IS NULL
    AND is_residential = false
    AND id IN (
      SELECT id FROM buildings
      WHERE area_id IS NOT NULL
        AND estimation_year IS NULL
        AND is_residential = false
      LIMIT p_limit
    );
  GET DIAGNOSTICS v_skipped = ROW_COUNT;

  -- Then: compute prices for residential + unclassified buildings
  UPDATE buildings
  SET
    estimated_price_per_sqm = compute_building_price(
      area_id, construction_year, min_distance_to_water_m,
      floor_count, building_type, p_year
    ),
    estimation_year = p_year
  WHERE area_id IS NOT NULL
    AND estimation_year IS NULL
    AND (is_residential IS NULL OR is_residential = true)
    AND id IN (
      SELECT id FROM buildings
      WHERE area_id IS NOT NULL
        AND estimation_year IS NULL
        AND (is_residential IS NULL OR is_residential = true)
      LIMIT p_limit
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count + v_skipped;
END;
$$ LANGUAGE plpgsql;
