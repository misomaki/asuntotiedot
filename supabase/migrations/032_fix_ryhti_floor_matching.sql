-- ============================================================
-- Migration 032: Fix Ryhti floor matching accuracy
-- ============================================================
-- Problems fixed:
--   1. Nearest-neighbor matching without cross-validation caused
--      wrong floor counts in dense areas (e.g., 2-storey rowhouse
--      matched to adjacent 8-storey apartment building's Ryhti record)
--   2. insert_ryhti_batch ON CONFLICT only updated floor_area,
--      silently dropping other fields on duplicate
--   3. No floor count bounds validation from Ryhti (OSM validates 1-50)
--
-- Cross-validation strategy:
--   - If OSM building_type is known, validate Ryhti storeys are plausible
--   - house/detached → reject if storeys > 4
--   - apartments → reject if storeys = 1 AND footprint < 200m²
--   - terrace/semidetached → reject if storeys > 4
--   - Reject all matches with storeys < 1 or > 50
--   - Use Ryhti main_purpose for additional cross-check when available
--
-- After deploying:
--   1. Clear bad floor data: see comments below
--   2. Re-run enrichment: npx tsx scripts/data-import/06-enrich-from-ryhti.ts
--   3. Recalculate prices: UPDATE buildings SET estimation_year = NULL;
--   4. npx tsx scripts/data-import/05-compute-building-prices.ts
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
-- Helper: validate Ryhti floor count against OSM building type
-- ============================================================
-- Returns TRUE if the floor count is plausible for this building.
-- Conservative: when in doubt, accept the match (return TRUE).
CREATE OR REPLACE FUNCTION _ryhti_floor_plausible(
  p_ryhti_storeys INT,
  p_ryhti_purpose TEXT,
  p_osm_building_type TEXT,
  p_footprint_area_sqm NUMERIC
) RETURNS BOOLEAN AS $$
BEGIN
  -- Reject out-of-range values
  IF p_ryhti_storeys IS NULL OR p_ryhti_storeys < 1 OR p_ryhti_storeys > 50 THEN
    RETURN FALSE;
  END IF;

  -- Cross-validate Ryhti purpose vs OSM type when both are available
  -- If Ryhti says detached house (0110) but storeys >= 5, likely wrong match
  IF p_ryhti_purpose = '0110' AND p_ryhti_storeys >= 5 THEN
    RETURN FALSE;
  END IF;

  -- If Ryhti says apartment building (0130/0140) but only 1 storey with small footprint
  IF p_ryhti_purpose IN ('0130', '0140') AND p_ryhti_storeys = 1
     AND p_footprint_area_sqm IS NOT NULL AND p_footprint_area_sqm < 200 THEN
    RETURN FALSE;
  END IF;

  -- OSM type cross-validation
  IF p_osm_building_type IS NOT NULL THEN
    -- Detached houses should not have > 4 floors
    IF p_osm_building_type IN ('detached', 'house') AND p_ryhti_storeys > 4 THEN
      RETURN FALSE;
    END IF;

    -- Row houses / semidetached should not have > 4 floors
    IF p_osm_building_type IN ('terrace', 'semidetached_house') AND p_ryhti_storeys > 4 THEN
      RETURN FALSE;
    END IF;

    -- Apartments with 1 storey and small footprint is suspicious
    IF p_osm_building_type = 'apartments' AND p_ryhti_storeys = 1
       AND p_footprint_area_sqm IS NOT NULL AND p_footprint_area_sqm < 200 THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- Fix 2: match_ryhti_to_buildings_batch with cross-validation
-- ============================================================
CREATE OR REPLACE FUNCTION match_ryhti_to_buildings_batch(p_limit INT DEFAULT 500)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE buildings b
  SET
    construction_year = sub.ryhti_year,
    floor_count = CASE
      WHEN b.floor_count IS NOT NULL THEN b.floor_count
      WHEN _ryhti_floor_plausible(sub.ryhti_storeys, sub.ryhti_purpose, b.building_type, b.footprint_area_sqm)
        THEN sub.ryhti_storeys
      ELSE NULL
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
-- ============================================================
CREATE OR REPLACE FUNCTION match_ryhti_floors_batch(p_limit INT DEFAULT 500)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE buildings b
  SET
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
      AND b2.floor_count IS NULL
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
-- Fix 4: match_ryhti_energy_apartment_batch with floor_area validation
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
