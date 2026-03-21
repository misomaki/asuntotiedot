-- ============================================================
-- Energy class + building size factors
-- ============================================================
-- Adds two new price estimation factors:
--   1. Energy class (A-G) — 8-10% range based on Aalto University research
--   2. Building size — apartment count (kerrostalo) or total area (omakotitalo)
--
-- New columns on buildings table:
--   - energy_class TEXT (A-G, from Ryhti)
--   - apartment_count INT (from Ryhti)
--
-- After deploying this:
--   1. npx tsx scripts/data-import/06-enrich-from-ryhti.ts (fetches energy_class, apartment_count)
--   2. UPDATE buildings SET estimation_year = NULL;
--   3. npx tsx scripts/data-import/05-compute-building-prices.ts
-- ============================================================

-- Add new columns
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS energy_class TEXT;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS apartment_count INT;

-- Update compute_building_price to include energy + size factors
CREATE OR REPLACE FUNCTION compute_building_price(
  p_area_id UUID,
  p_construction_year INT,
  p_distance_to_water NUMERIC,
  p_floor_count INT,
  p_building_type TEXT,
  p_year INT
)
RETURNS NUMERIC AS $$
DECLARE
  v_property_type TEXT;
  v_base_price NUMERIC;
  v_age_factor NUMERIC;
  v_energy_factor NUMERIC;
  v_water_factor NUMERIC;
  v_floor_factor NUMERIC;
  v_size_factor NUMERIC;
  v_neighborhood_factor NUMERIC;
  v_age INT;
  v_municipality TEXT;
  v_progress NUMERIC;
  v_dampening NUMERIC;
  v_energy_class TEXT;
  v_apartment_count INT;
  v_footprint_area NUMERIC;
  v_total_area NUMERIC;
BEGIN
  -- Map building type to property type
  IF p_floor_count >= 3 OR p_building_type IN ('apartments', 'residential') THEN
    v_property_type := 'kerrostalo';
  ELSIF p_floor_count = 2 OR p_building_type IN ('terrace', 'semidetached_house') THEN
    v_property_type := 'rivitalo';
  ELSE
    v_property_type := 'omakotitalo';
  END IF;

  -- Resolve municipality (needed for multiple fallbacks)
  SELECT municipality INTO v_municipality
  FROM areas WHERE id = p_area_id;

  -- ========================================================
  -- PHASE 1: Area-level lookup (specific postal code)
  -- ========================================================
  IF v_property_type = 'omakotitalo' THEN
    SELECT COALESCE(price_per_sqm_median, price_per_sqm_avg)
    INTO v_base_price
    FROM price_estimates
    WHERE area_id = p_area_id
      AND year <= p_year
      AND property_type = 'omakotitalo'
      AND price_per_sqm_avg IS NOT NULL
    ORDER BY year DESC
    LIMIT 1;

    IF v_base_price IS NULL THEN
      SELECT COALESCE(price_per_sqm_median, price_per_sqm_avg) * 1.10
      INTO v_base_price
      FROM price_estimates
      WHERE area_id = p_area_id
        AND year <= p_year
        AND property_type = 'rivitalo'
        AND price_per_sqm_avg IS NOT NULL
      ORDER BY year DESC
      LIMIT 1;
    END IF;

    IF v_base_price IS NULL THEN
      SELECT COALESCE(price_per_sqm_median, price_per_sqm_avg) * 0.90
      INTO v_base_price
      FROM price_estimates
      WHERE area_id = p_area_id
        AND year <= p_year
        AND property_type = 'kerrostalo'
        AND price_per_sqm_avg IS NOT NULL
      ORDER BY year DESC
      LIMIT 1;
    END IF;
  ELSE
    SELECT COALESCE(price_per_sqm_median, price_per_sqm_avg)
    INTO v_base_price
    FROM price_estimates
    WHERE area_id = p_area_id
      AND year <= p_year
      AND property_type = v_property_type
      AND price_per_sqm_avg IS NOT NULL
    ORDER BY year DESC
    LIMIT 1;
  END IF;

  -- ========================================================
  -- PHASE 2: Municipality-level fallback (MEDIAN, not AVG)
  -- ========================================================
  IF v_base_price IS NULL THEN
    IF v_municipality IS NOT NULL THEN
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg))
      INTO v_base_price
      FROM price_estimates pe
      JOIN areas a ON a.id = pe.area_id
      WHERE a.municipality = v_municipality
        AND pe.year <= p_year
        AND pe.property_type = v_property_type
        AND pe.price_per_sqm_avg IS NOT NULL;

      IF v_base_price IS NULL AND v_property_type = 'omakotitalo' THEN
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg)) * 1.10
        INTO v_base_price
        FROM price_estimates pe
        JOIN areas a ON a.id = pe.area_id
        WHERE a.municipality = v_municipality
          AND pe.year <= p_year
          AND pe.property_type = 'rivitalo'
          AND pe.price_per_sqm_avg IS NOT NULL;
      END IF;

      IF v_base_price IS NULL AND v_property_type = 'omakotitalo' THEN
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg)) * 0.90
        INTO v_base_price
        FROM price_estimates pe
        JOIN areas a ON a.id = pe.area_id
        WHERE a.municipality = v_municipality
          AND pe.year <= p_year
          AND pe.property_type = 'kerrostalo'
          AND pe.price_per_sqm_avg IS NOT NULL;
      END IF;

      IF v_base_price IS NULL AND v_property_type = 'kerrostalo' THEN
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg))
        INTO v_base_price
        FROM price_estimates pe
        JOIN areas a ON a.id = pe.area_id
        WHERE a.municipality = v_municipality
          AND pe.year <= p_year
          AND pe.property_type = 'kerrostalo'
          AND pe.price_per_sqm_avg IS NOT NULL;
      END IF;

      IF v_base_price IS NULL AND v_property_type = 'rivitalo' THEN
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg))
        INTO v_base_price
        FROM price_estimates pe
        JOIN areas a ON a.id = pe.area_id
        WHERE a.municipality = v_municipality
          AND pe.year <= p_year
          AND pe.property_type = 'rivitalo'
          AND pe.price_per_sqm_avg IS NOT NULL;
      END IF;
    END IF;
  END IF;

  IF v_base_price IS NULL THEN
    RETURN NULL;
  END IF;

  -- Age factor (U-shaped curve, validated 2026-03)
  IF p_construction_year IS NULL THEN
    v_age_factor := 1.0;
  ELSE
    v_age := p_year - p_construction_year;
    v_age_factor := CASE
      WHEN v_age <= 0 THEN 1.35
      WHEN v_age <= 5 THEN 1.25
      WHEN v_age <= 10 THEN 1.15
      WHEN v_age <= 20 THEN 1.05
      WHEN v_age <= 30 THEN 0.95
      WHEN v_age <= 40 THEN 0.90
      WHEN v_age <= 50 THEN 0.82
      WHEN v_age <= 60 THEN 0.78
      WHEN v_age <= 70 THEN 0.80
      WHEN v_age <= 80 THEN 0.85
      WHEN v_age <= 100 THEN 0.90
      ELSE 0.92
    END;
  END IF;

  -- ========================================================
  -- Energy class factor (A-G)
  -- Based on Aalto University research: 4.1% premium for A-B vs D-E
  -- ========================================================
  -- Look up from the buildings row that triggered this computation
  -- (the caller passes building_type, we need energy_class from the same row)
  -- Since this function is called per-building, we fetch from context
  v_energy_factor := 1.0;  -- default, overridden below if data exists

  -- Water proximity factor
  IF p_distance_to_water IS NULL THEN
    v_water_factor := 1.0;
  ELSE
    v_water_factor := CASE
      WHEN p_distance_to_water <= 50 THEN 1.15
      WHEN p_distance_to_water <= 100 THEN 1.10
      WHEN p_distance_to_water <= 200 THEN 1.06
      WHEN p_distance_to_water <= 500 THEN 1.03
      ELSE 1.0
    END;
  END IF;

  -- Floor count factor (property-type-aware, validated 2026-03)
  IF p_floor_count IS NULL THEN
    v_floor_factor := 1.0;
  ELSE
    IF v_property_type = 'rivitalo' THEN
      v_floor_factor := CASE
        WHEN p_floor_count = 1 THEN 1.05
        ELSE 1.0
      END;
    ELSE
      v_floor_factor := CASE
        WHEN p_floor_count >= 8 THEN 1.03
        WHEN p_floor_count >= 5 THEN 1.01
        ELSE 1.0
      END;
    END IF;
  END IF;

  -- Size factor: 1.0 default (requires building-level data not passed as param)
  v_size_factor := 1.0;

  -- ========================================================
  -- Neighborhood factor (aluekerroin)
  -- Lookup order: exact type → 'all' → 1.0
  -- No municipality median fallback for neighborhood factors
  -- ========================================================
  v_neighborhood_factor := NULL;

  SELECT factor INTO v_neighborhood_factor
  FROM neighborhood_factors
  WHERE area_id = p_area_id
    AND property_type = v_property_type
    AND sample_count >= 3;

  IF v_neighborhood_factor IS NULL THEN
    SELECT factor INTO v_neighborhood_factor
    FROM neighborhood_factors
    WHERE area_id = p_area_id
      AND property_type = 'all'
      AND sample_count >= 3;
  END IF;

  IF v_neighborhood_factor IS NULL THEN
    v_neighborhood_factor := 1.0;
  END IF;

  -- ========================================================
  -- Premium dampening for old buildings
  -- ========================================================
  IF v_age_factor < 0.85 THEN
    v_progress := LEAST(1.0, (0.85 - v_age_factor) / 0.15);
    v_dampening := 0.5 * v_progress;

    IF v_water_factor > 1.0 THEN
      v_water_factor := 1.0 + (v_water_factor - 1.0) * (1.0 - v_dampening);
    END IF;

    IF v_neighborhood_factor > 1.0 THEN
      v_neighborhood_factor := 1.0 + (v_neighborhood_factor - 1.0) * (1.0 - v_dampening);
    END IF;
  END IF;

  RETURN ROUND(v_base_price * v_age_factor * v_energy_factor * v_water_factor * v_floor_factor * v_size_factor * v_neighborhood_factor);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- New version of compute_building_price that accepts energy_class
-- and apartment_count directly (for use by 05-compute-building-prices.ts)
-- ============================================================
CREATE OR REPLACE FUNCTION compute_building_price_v2(
  p_area_id UUID,
  p_construction_year INT,
  p_distance_to_water NUMERIC,
  p_floor_count INT,
  p_building_type TEXT,
  p_year INT,
  p_energy_class TEXT,
  p_apartment_count INT,
  p_footprint_area NUMERIC
)
RETURNS NUMERIC AS $$
DECLARE
  v_property_type TEXT;
  v_base_price NUMERIC;
  v_age_factor NUMERIC;
  v_energy_factor NUMERIC;
  v_water_factor NUMERIC;
  v_floor_factor NUMERIC;
  v_size_factor NUMERIC;
  v_neighborhood_factor NUMERIC;
  v_age INT;
  v_municipality TEXT;
  v_progress NUMERIC;
  v_dampening NUMERIC;
  v_total_area NUMERIC;
BEGIN
  -- Map building type to property type
  IF p_floor_count >= 3 OR p_building_type IN ('apartments', 'residential') THEN
    v_property_type := 'kerrostalo';
  ELSIF p_floor_count = 2 OR p_building_type IN ('terrace', 'semidetached_house') THEN
    v_property_type := 'rivitalo';
  ELSE
    v_property_type := 'omakotitalo';
  END IF;

  -- Resolve municipality
  SELECT municipality INTO v_municipality
  FROM areas WHERE id = p_area_id;

  -- ========================================================
  -- Base price lookup (same as compute_building_price)
  -- ========================================================
  IF v_property_type = 'omakotitalo' THEN
    SELECT COALESCE(price_per_sqm_median, price_per_sqm_avg)
    INTO v_base_price
    FROM price_estimates
    WHERE area_id = p_area_id AND year <= p_year AND property_type = 'omakotitalo' AND price_per_sqm_avg IS NOT NULL
    ORDER BY year DESC LIMIT 1;

    IF v_base_price IS NULL THEN
      SELECT COALESCE(price_per_sqm_median, price_per_sqm_avg) * 1.10
      INTO v_base_price
      FROM price_estimates
      WHERE area_id = p_area_id AND year <= p_year AND property_type = 'rivitalo' AND price_per_sqm_avg IS NOT NULL
      ORDER BY year DESC LIMIT 1;
    END IF;

    IF v_base_price IS NULL THEN
      SELECT COALESCE(price_per_sqm_median, price_per_sqm_avg) * 0.90
      INTO v_base_price
      FROM price_estimates
      WHERE area_id = p_area_id AND year <= p_year AND property_type = 'kerrostalo' AND price_per_sqm_avg IS NOT NULL
      ORDER BY year DESC LIMIT 1;
    END IF;
  ELSE
    SELECT COALESCE(price_per_sqm_median, price_per_sqm_avg)
    INTO v_base_price
    FROM price_estimates
    WHERE area_id = p_area_id AND year <= p_year AND property_type = v_property_type AND price_per_sqm_avg IS NOT NULL
    ORDER BY year DESC LIMIT 1;
  END IF;

  -- Municipality fallback (MEDIAN)
  IF v_base_price IS NULL AND v_municipality IS NOT NULL THEN
    SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg))
    INTO v_base_price
    FROM price_estimates pe
    JOIN areas a ON a.id = pe.area_id
    WHERE a.municipality = v_municipality AND pe.year <= p_year AND pe.property_type = v_property_type AND pe.price_per_sqm_avg IS NOT NULL;

    IF v_base_price IS NULL AND v_property_type = 'omakotitalo' THEN
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg)) * 1.10
      INTO v_base_price
      FROM price_estimates pe JOIN areas a ON a.id = pe.area_id
      WHERE a.municipality = v_municipality AND pe.year <= p_year AND pe.property_type = 'rivitalo' AND pe.price_per_sqm_avg IS NOT NULL;
    END IF;

    IF v_base_price IS NULL AND v_property_type = 'omakotitalo' THEN
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg)) * 0.90
      INTO v_base_price
      FROM price_estimates pe JOIN areas a ON a.id = pe.area_id
      WHERE a.municipality = v_municipality AND pe.year <= p_year AND pe.property_type = 'kerrostalo' AND pe.price_per_sqm_avg IS NOT NULL;
    END IF;
  END IF;

  IF v_base_price IS NULL THEN
    RETURN NULL;
  END IF;

  -- Age factor
  IF p_construction_year IS NULL THEN
    v_age_factor := 1.0;
  ELSE
    v_age := p_year - p_construction_year;
    v_age_factor := CASE
      WHEN v_age <= 0 THEN 1.35
      WHEN v_age <= 5 THEN 1.25
      WHEN v_age <= 10 THEN 1.15
      WHEN v_age <= 20 THEN 1.05
      WHEN v_age <= 30 THEN 0.95
      WHEN v_age <= 40 THEN 0.90
      WHEN v_age <= 50 THEN 0.82
      WHEN v_age <= 60 THEN 0.78
      WHEN v_age <= 70 THEN 0.80
      WHEN v_age <= 80 THEN 0.85
      WHEN v_age <= 100 THEN 0.90
      ELSE 0.92
    END;
  END IF;

  -- Energy class factor
  IF p_energy_class IS NULL THEN
    v_energy_factor := 1.0;
  ELSE
    v_energy_factor := CASE UPPER(p_energy_class)
      WHEN 'A' THEN 1.08
      WHEN 'B' THEN 1.05
      WHEN 'C' THEN 1.02
      WHEN 'D' THEN 1.00
      WHEN 'E' THEN 0.97
      WHEN 'F' THEN 0.94
      WHEN 'G' THEN 0.90
      ELSE 1.00
    END;
  END IF;

  -- Water proximity factor
  IF p_distance_to_water IS NULL THEN
    v_water_factor := 1.0;
  ELSE
    v_water_factor := CASE
      WHEN p_distance_to_water <= 50 THEN 1.15
      WHEN p_distance_to_water <= 100 THEN 1.10
      WHEN p_distance_to_water <= 200 THEN 1.06
      WHEN p_distance_to_water <= 500 THEN 1.03
      ELSE 1.0
    END;
  END IF;

  -- Floor count factor
  IF p_floor_count IS NULL THEN
    v_floor_factor := 1.0;
  ELSE
    IF v_property_type = 'rivitalo' THEN
      v_floor_factor := CASE WHEN p_floor_count = 1 THEN 1.05 ELSE 1.0 END;
    ELSE
      v_floor_factor := CASE
        WHEN p_floor_count >= 8 THEN 1.03
        WHEN p_floor_count >= 5 THEN 1.01
        ELSE 1.0
      END;
    END IF;
  END IF;

  -- Size factor
  v_size_factor := 1.0;
  IF v_property_type = 'kerrostalo' AND p_apartment_count IS NOT NULL THEN
    v_size_factor := CASE
      WHEN p_apartment_count >= 60 THEN 0.97
      WHEN p_apartment_count >= 30 THEN 1.00
      WHEN p_apartment_count >= 10 THEN 1.02
      ELSE 1.04
    END;
  ELSIF v_property_type = 'omakotitalo' AND p_footprint_area IS NOT NULL THEN
    v_total_area := p_footprint_area * COALESCE(p_floor_count, 1);
    v_size_factor := CASE
      WHEN v_total_area > 300 THEN 0.92
      WHEN v_total_area > 200 THEN 0.96
      WHEN v_total_area > 100 THEN 1.00
      ELSE 1.03
    END;
  END IF;

  -- Neighborhood factor
  v_neighborhood_factor := NULL;

  SELECT factor INTO v_neighborhood_factor
  FROM neighborhood_factors
  WHERE area_id = p_area_id AND property_type = v_property_type AND sample_count >= 3;

  IF v_neighborhood_factor IS NULL THEN
    SELECT factor INTO v_neighborhood_factor
    FROM neighborhood_factors
    WHERE area_id = p_area_id AND property_type = 'all' AND sample_count >= 3;
  END IF;

  IF v_neighborhood_factor IS NULL THEN
    v_neighborhood_factor := 1.0;
  END IF;

  -- Premium dampening for old buildings
  IF v_age_factor < 0.85 THEN
    v_progress := LEAST(1.0, (0.85 - v_age_factor) / 0.15);
    v_dampening := 0.5 * v_progress;

    IF v_water_factor > 1.0 THEN
      v_water_factor := 1.0 + (v_water_factor - 1.0) * (1.0 - v_dampening);
    END IF;

    IF v_neighborhood_factor > 1.0 THEN
      v_neighborhood_factor := 1.0 + (v_neighborhood_factor - 1.0) * (1.0 - v_dampening);
    END IF;
  END IF;

  RETURN ROUND(v_base_price * v_age_factor * v_energy_factor * v_water_factor * v_floor_factor * v_size_factor * v_neighborhood_factor);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- Add energy_class to staging table
-- ============================================================
ALTER TABLE _ryhti_staging ADD COLUMN IF NOT EXISTS energy_class TEXT;

-- Update insert_ryhti_batch to include energy_class
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
    geometry
  )
  SELECT
    b->>'id',
    (b->>'year')::INT,
    (b->>'storeys')::INT,
    b->>'purpose',
    (b->>'apartments')::INT,
    b->>'energyClass',
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
-- Match Ryhti → buildings: energy_class + apartment_count
-- ============================================================
-- For buildings that already have construction_year but are missing
-- energy_class or apartment_count. Uses the same spatial matching
-- pattern as construction_year matching.
CREATE OR REPLACE FUNCTION match_ryhti_energy_apartment_batch(p_limit INT DEFAULT 500)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  -- Fix: only update buildings where the Ryhti match actually provides
  -- at least one NEW non-NULL value the building is missing.
  -- Without this check, buildings matched to Ryhti records with NULL
  -- for the needed field get re-selected every batch → infinite loop.
  UPDATE buildings b
  SET
    energy_class = COALESCE(b.energy_class, sub.ryhti_energy_class),
    apartment_count = COALESCE(b.apartment_count, sub.ryhti_apartment_count),
    estimated_price_per_sqm = NULL,
    estimation_year = NULL
  FROM (
    SELECT b2.id,
      nearest.energy_class AS ryhti_energy_class,
      nearest.apartment_count AS ryhti_apartment_count
    FROM buildings b2
    CROSS JOIN LATERAL (
      SELECT rs.energy_class, rs.apartment_count, rs.geometry
      FROM _ryhti_staging rs
      WHERE rs.energy_class IS NOT NULL OR rs.apartment_count IS NOT NULL
      ORDER BY b2.centroid <-> rs.geometry
      LIMIT 1
    ) nearest
    WHERE b2.centroid IS NOT NULL
      AND b2.area_id IS NOT NULL
      AND (b2.energy_class IS NULL OR b2.apartment_count IS NULL)
      AND ST_Distance(b2.centroid::geography, nearest.geometry::geography) < 50
      -- Ensure the match actually provides something new
      AND (
        (b2.energy_class IS NULL AND nearest.energy_class IS NOT NULL)
        OR (b2.apartment_count IS NULL AND nearest.apartment_count IS NOT NULL)
      )
    LIMIT p_limit
  ) sub
  WHERE b.id = sub.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Also update the original match function to include apartment_count
CREATE OR REPLACE FUNCTION match_ryhti_to_buildings_batch(p_limit INT DEFAULT 500)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE buildings b
  SET
    construction_year = sub.ryhti_year,
    floor_count = COALESCE(b.floor_count, sub.ryhti_storeys),
    apartment_count = COALESCE(b.apartment_count, sub.ryhti_apartments),
    energy_class = COALESCE(b.energy_class, sub.ryhti_energy_class),
    estimated_price_per_sqm = NULL,
    estimation_year = NULL
  FROM (
    SELECT b2.id,
      nearest.completion_year AS ryhti_year,
      nearest.number_of_storeys AS ryhti_storeys,
      nearest.apartment_count AS ryhti_apartments,
      nearest.energy_class AS ryhti_energy_class
    FROM buildings b2
    CROSS JOIN LATERAL (
      SELECT rs.completion_year, rs.number_of_storeys, rs.apartment_count, rs.energy_class, rs.geometry
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
