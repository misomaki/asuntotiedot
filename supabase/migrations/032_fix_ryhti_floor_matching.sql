-- ============================================================
-- Migration 032: Fix Ryhti floor matching accuracy
-- ============================================================
-- Root cause: MML Maastotietokanta kerrosluku (floor count) is
-- often wrong — it's a topographic survey, not a building registry.
-- Ryhti (SYKE) is the authoritative building registry but was
-- blocked from correcting MML data by COALESCE(b.floor_count, ...).
--
-- Fixes:
--   1. Ryhti floor count now OVERRIDES MML/existing floor count
--      (Ryhti is the authoritative source for building attributes)
--   2. Cross-validation prevents wrong proximity matches in dense areas
--   3. insert_ryhti_batch ON CONFLICT now updates ALL fields
--   4. Bounds validation (1-50) for Ryhti floor counts
--   5. New match_ryhti_override_floors_batch() to fix buildings that
--      already have (wrong) floor_count from MML
--
-- After deploying:
--   1. Run this migration in Supabase SQL Editor
--   2. Re-run enrichment: npx tsx scripts/data-import/06-enrich-from-ryhti.ts
--   3. Reset prices: UPDATE buildings SET estimation_year = NULL;
--   4. Recompute: npx tsx scripts/data-import/05-compute-building-prices.ts
-- ============================================================

-- ============================================================
-- Fix 1: insert_ryhti_batch — update ALL fields on conflict
-- ============================================================
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
    energy_class,
    floor_area,
    geometry
  )
  SELECT
    b->>'id',
    (b->>'year')::INT,
    (b->>'storeys')::INT,
    b->>'purpose',
    (b->>'apartments')::INT,
    b->>'energyClass',
    (b->>'floorArea')::INT,
    ST_SetSRID(ST_MakePoint((b->>'lng')::DOUBLE PRECISION, (b->>'lat')::DOUBLE PRECISION), 4326)
  FROM jsonb_array_elements(p_buildings) AS b
  WHERE b->>'id' IS NOT NULL
    AND (b->>'lng')::DOUBLE PRECISION IS NOT NULL
    AND (b->>'lat')::DOUBLE PRECISION IS NOT NULL
  ON CONFLICT (permanent_building_identifier) DO UPDATE SET
    completion_year = COALESCE(EXCLUDED.completion_year, _ryhti_staging.completion_year),
    number_of_storeys = COALESCE(EXCLUDED.number_of_storeys, _ryhti_staging.number_of_storeys),
    main_purpose = COALESCE(EXCLUDED.main_purpose, _ryhti_staging.main_purpose),
    apartment_count = COALESCE(EXCLUDED.apartment_count, _ryhti_staging.apartment_count),
    energy_class = COALESCE(EXCLUDED.energy_class, _ryhti_staging.energy_class),
    floor_area = COALESCE(EXCLUDED.floor_area, _ryhti_staging.floor_area),
    geometry = COALESCE(EXCLUDED.geometry, _ryhti_staging.geometry);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Helper: validate Ryhti floor count against building type
-- ============================================================
-- Returns TRUE if the floor count is plausible for this building.
-- Conservative: when in doubt, accept the match (return TRUE).
CREATE OR REPLACE FUNCTION _ryhti_floor_plausible(
  p_ryhti_storeys INT,
  p_ryhti_purpose TEXT,
  p_building_type TEXT,
  p_footprint_area_sqm NUMERIC
) RETURNS BOOLEAN AS $$
BEGIN
  -- Reject out-of-range values
  IF p_ryhti_storeys IS NULL OR p_ryhti_storeys < 1 OR p_ryhti_storeys > 50 THEN
    RETURN FALSE;
  END IF;

  -- Cross-validate Ryhti purpose vs storeys
  -- Detached house (0110) with >= 5 floors is likely a wrong match
  IF p_ryhti_purpose = '0110' AND p_ryhti_storeys >= 5 THEN
    RETURN FALSE;
  END IF;

  -- Apartment building (0130/0140) with 1 storey and small footprint
  IF p_ryhti_purpose IN ('0130', '0140') AND p_ryhti_storeys = 1
     AND p_footprint_area_sqm IS NOT NULL AND p_footprint_area_sqm < 200 THEN
    RETURN FALSE;
  END IF;

  -- Building type cross-validation (from MML kohdeluokka or OSM)
  IF p_building_type IS NOT NULL THEN
    -- Detached houses should not have > 4 floors
    IF p_building_type IN ('detached', 'house', 'residential') AND p_ryhti_storeys > 4 THEN
      RETURN FALSE;
    END IF;

    -- Row houses / semidetached should not have > 4 floors
    IF p_building_type IN ('terrace', 'semidetached_house') AND p_ryhti_storeys > 4 THEN
      RETURN FALSE;
    END IF;

    -- Apartments with 1 storey and small footprint is suspicious
    IF p_building_type = 'apartments' AND p_ryhti_storeys = 1
       AND p_footprint_area_sqm IS NOT NULL AND p_footprint_area_sqm < 200 THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- Fix 2: match_ryhti_to_buildings_batch
-- Ryhti floor count OVERRIDES existing (MML) when plausible
-- ============================================================
CREATE OR REPLACE FUNCTION match_ryhti_to_buildings_batch(p_limit INT DEFAULT 500)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE buildings b
  SET
    construction_year = sub.ryhti_year,
    -- Ryhti overrides MML floor count (Ryhti = authoritative registry)
    floor_count = CASE
      WHEN _ryhti_floor_plausible(sub.ryhti_storeys, sub.ryhti_purpose, b.building_type, b.footprint_area_sqm)
        THEN sub.ryhti_storeys
      ELSE b.floor_count  -- keep existing if Ryhti is implausible
    END,
    apartment_count = COALESCE(b.apartment_count, sub.ryhti_apartments),
    energy_class = COALESCE(b.energy_class, sub.ryhti_energy_class),
    total_area_sqm = COALESCE(b.total_area_sqm, sub.ryhti_floor_area),
    estimated_price_per_sqm = NULL,
    estimation_year = NULL
  FROM (
    SELECT b2.id,
      nearest.completion_year AS ryhti_year,
      nearest.number_of_storeys AS ryhti_storeys,
      nearest.main_purpose AS ryhti_purpose,
      nearest.apartment_count AS ryhti_apartments,
      nearest.energy_class AS ryhti_energy_class,
      nearest.floor_area AS ryhti_floor_area
    FROM buildings b2
    CROSS JOIN LATERAL (
      SELECT rs.completion_year, rs.number_of_storeys, rs.main_purpose,
             rs.apartment_count, rs.energy_class, rs.floor_area, rs.geometry
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
-- Fix 3: match_ryhti_floors_batch with cross-validation
-- Now also targets buildings WITH floor_count (to fix MML data)
-- ============================================================
CREATE OR REPLACE FUNCTION match_ryhti_floors_batch(p_limit INT DEFAULT 500)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE buildings b
  SET
    -- Ryhti overrides MML floor count
    floor_count = sub.ryhti_storeys,
    total_area_sqm = COALESCE(b.total_area_sqm, sub.ryhti_floor_area),
    estimated_price_per_sqm = NULL,
    estimation_year = NULL
  FROM (
    SELECT b2.id,
      nearest.number_of_storeys AS ryhti_storeys,
      nearest.main_purpose AS ryhti_purpose,
      nearest.floor_area AS ryhti_floor_area
    FROM buildings b2
    CROSS JOIN LATERAL (
      SELECT rs.number_of_storeys, rs.main_purpose, rs.floor_area, rs.geometry
      FROM _ryhti_staging rs
      WHERE rs.number_of_storeys IS NOT NULL
        AND rs.number_of_storeys BETWEEN 1 AND 50
      ORDER BY b2.centroid <-> rs.geometry
      LIMIT 1
    ) nearest
    WHERE b2.centroid IS NOT NULL
      AND b2.area_id IS NOT NULL
      AND b2.construction_year IS NOT NULL
      -- Target buildings without floor_count OR where Ryhti disagrees
      AND (b2.floor_count IS NULL OR b2.floor_count != nearest.number_of_storeys)
      AND ST_Distance(b2.centroid::geography, nearest.geometry::geography) < 50
      -- Cross-validate: reject implausible floor counts
      AND _ryhti_floor_plausible(
            nearest.number_of_storeys,
            nearest.main_purpose,
            b2.building_type,
            b2.footprint_area_sqm)
    LIMIT p_limit
  ) sub
  WHERE b.id = sub.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Fix 4: match_ryhti_energy_apartment_batch (unchanged logic,
-- just re-created with floor_area support from migration 029)
-- ============================================================
CREATE OR REPLACE FUNCTION match_ryhti_energy_apartment_batch(p_limit INT DEFAULT 500)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE buildings b
  SET
    energy_class = COALESCE(b.energy_class, sub.ryhti_energy_class),
    apartment_count = COALESCE(b.apartment_count, sub.ryhti_apartment_count),
    total_area_sqm = COALESCE(b.total_area_sqm, sub.ryhti_floor_area),
    estimated_price_per_sqm = NULL,
    estimation_year = NULL
  FROM (
    SELECT b2.id,
      nearest.energy_class AS ryhti_energy_class,
      nearest.apartment_count AS ryhti_apartment_count,
      nearest.floor_area AS ryhti_floor_area
    FROM buildings b2
    CROSS JOIN LATERAL (
      SELECT rs.energy_class, rs.apartment_count, rs.floor_area, rs.geometry
      FROM _ryhti_staging rs
      WHERE rs.energy_class IS NOT NULL OR rs.apartment_count IS NOT NULL OR rs.floor_area IS NOT NULL
      ORDER BY b2.centroid <-> rs.geometry
      LIMIT 1
    ) nearest
    WHERE b2.centroid IS NOT NULL
      AND b2.area_id IS NOT NULL
      AND (b2.energy_class IS NULL OR b2.apartment_count IS NULL OR b2.total_area_sqm IS NULL)
      AND ST_Distance(b2.centroid::geography, nearest.geometry::geography) < 50
      AND (
        (b2.energy_class IS NULL AND nearest.energy_class IS NOT NULL)
        OR (b2.apartment_count IS NULL AND nearest.apartment_count IS NOT NULL)
        OR (b2.total_area_sqm IS NULL AND nearest.floor_area IS NOT NULL)
      )
    LIMIT p_limit
  ) sub
  WHERE b.id = sub.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
