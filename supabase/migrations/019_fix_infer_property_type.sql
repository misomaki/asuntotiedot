-- ============================================================
-- Migration 019: Ryhti-first property type inference
--
-- Fixes: building_type='residential' was always mapped to kerrostalo.
-- Now uses ryhti_main_purpose (authoritative) when available:
--   0110 → omakotitalo
--   0111, 0112, 0120 → rivitalo
--   other 01xx → kerrostalo
-- Falls back to OSM building_type and floor count heuristics.
--
-- After deploying:
--   1. Reset: UPDATE buildings SET estimation_year = NULL, estimated_price_per_sqm = NULL;
--   2. Recompute: npx tsx scripts/data-import/05-compute-building-prices.ts
-- ============================================================

-- Full CREATE OR REPLACE — copy of 017 with Ryhti-first property type logic.
-- New parameter: p_ryhti_main_purpose (7th, with default so existing callers don't break).

CREATE OR REPLACE FUNCTION compute_building_price(
  p_area_id UUID,
  p_construction_year INT,
  p_distance_to_water NUMERIC,
  p_floor_count INT,
  p_building_type TEXT,
  p_year INT,
  p_ryhti_main_purpose TEXT DEFAULT NULL
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
  -- ========================================================
  -- Property type inference (Ryhti-first)
  -- ========================================================
  -- 1. Ryhti main_purpose (authoritative building registry)
  IF p_ryhti_main_purpose IS NOT NULL THEN
    IF p_ryhti_main_purpose = '0110' THEN
      v_property_type := 'omakotitalo';
    ELSIF p_ryhti_main_purpose IN ('0111', '0112', '0120') THEN
      v_property_type := 'rivitalo';
    ELSIF p_ryhti_main_purpose LIKE '01%' THEN
      v_property_type := 'kerrostalo';
    END IF;
  END IF;

  -- 2. Explicit OSM types + floor heuristic (only if Ryhti didn't resolve)
  IF v_property_type IS NULL THEN
    IF p_building_type = 'apartments' THEN
      v_property_type := 'kerrostalo';
    ELSIF p_building_type IN ('terrace', 'semidetached_house') THEN
      v_property_type := 'rivitalo';
    ELSIF p_building_type IN ('detached', 'house') THEN
      v_property_type := 'omakotitalo';
    ELSIF p_floor_count >= 3 THEN
      v_property_type := 'kerrostalo';
    ELSIF p_floor_count = 2 THEN
      v_property_type := 'rivitalo';
    ELSE
      v_property_type := 'omakotitalo';
    END IF;
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
  -- PHASE 2: Municipality-level fallback (median across areas)
  -- ========================================================
  IF v_base_price IS NULL AND v_municipality IS NOT NULL THEN
    IF v_property_type = 'omakotitalo' THEN
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg)) * 1.10
      INTO v_base_price
      FROM price_estimates pe
      JOIN areas a ON a.id = pe.area_id
      WHERE a.municipality = v_municipality
        AND pe.year <= p_year
        AND pe.property_type = 'rivitalo'
        AND pe.price_per_sqm_avg IS NOT NULL;

      IF v_base_price IS NULL THEN
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg)) * 0.90
        INTO v_base_price
        FROM price_estimates pe
        JOIN areas a ON a.id = pe.area_id
        WHERE a.municipality = v_municipality
          AND pe.year <= p_year
          AND pe.property_type = 'kerrostalo'
          AND pe.price_per_sqm_avg IS NOT NULL;
      END IF;
    ELSE
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg))
      INTO v_base_price
      FROM price_estimates pe
      JOIN areas a ON a.id = pe.area_id
      WHERE a.municipality = v_municipality
        AND pe.year <= p_year
        AND pe.property_type = v_property_type
        AND pe.price_per_sqm_avg IS NOT NULL;

      IF v_base_price IS NULL AND v_property_type = 'rivitalo' THEN
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg))
        INTO v_base_price
        FROM price_estimates pe
        JOIN areas a ON a.id = pe.area_id
        WHERE a.municipality = v_municipality
          AND pe.year <= p_year
          AND pe.property_type = 'kerrostalo'
          AND pe.price_per_sqm_avg IS NOT NULL;
      END IF;
    END IF;
  END IF;

  IF v_base_price IS NULL THEN
    RETURN NULL;
  END IF;

  -- ========================================================
  -- Age factor (U-shaped curve, recalibrated 2026-03-21)
  -- ========================================================
  IF p_construction_year IS NULL THEN
    v_age_factor := 1.0;
  ELSE
    v_age := p_year - p_construction_year;
    v_age_factor := CASE
      WHEN v_age <= 0 THEN 1.45
      WHEN v_age <= 5 THEN 1.33
      WHEN v_age <= 10 THEN 1.22
      WHEN v_age <= 20 THEN 1.10
      WHEN v_age <= 30 THEN 0.97
      WHEN v_age <= 40 THEN 0.90
      WHEN v_age <= 50 THEN 0.84
      WHEN v_age <= 60 THEN 0.80
      WHEN v_age <= 70 THEN 0.80
      WHEN v_age <= 80 THEN 0.85
      WHEN v_age <= 100 THEN 0.90
      ELSE 0.92
    END;
  END IF;

  -- Energy class factor (data not yet available, defaults to 1.0)
  v_energy_factor := 1.0;

  -- ========================================================
  -- Water proximity factor (recalibrated 2026-03-21)
  -- ========================================================
  IF p_distance_to_water IS NULL THEN
    v_water_factor := 1.0;
  ELSE
    v_water_factor := CASE
      WHEN p_distance_to_water <= 10 THEN 1.35
      WHEN p_distance_to_water <= 20 THEN 1.28
      WHEN p_distance_to_water <= 50 THEN 1.20
      WHEN p_distance_to_water <= 100 THEN 1.13
      WHEN p_distance_to_water <= 200 THEN 1.07
      WHEN p_distance_to_water <= 500 THEN 1.03
      ELSE 1.0
    END;
  END IF;

  -- Floor count factor (property-type-aware)
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
-- Update compute_all_building_prices to pass ryhti_main_purpose
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
      floor_count, building_type, p_year, ryhti_main_purpose
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
