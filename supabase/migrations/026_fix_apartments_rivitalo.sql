-- ============================================================
-- Migration 026: Fix rivitalo misclassification
--
-- OSM building_type='apartments' mapped unconditionally to
-- kerrostalo, but many 2-floor row houses are tagged 'apartments'.
-- Fix: apartments + ≤2 floors + ≤7 apartments → rivitalo.
-- Matches inferPropertyType() in priceEstimation.ts.
--
-- After deploying:
--   1. Reset: UPDATE buildings SET estimation_year = NULL
--      WHERE building_type = 'apartments' AND floor_count <= 2;
--   2. Recompute: npx tsx scripts/data-import/05-compute-building-prices.ts
-- ============================================================

CREATE OR REPLACE FUNCTION compute_building_price(
  p_area_id UUID,
  p_construction_year INT,
  p_distance_to_water NUMERIC,
  p_floor_count INT,
  p_building_type TEXT,
  p_year INT,
  p_ryhti_main_purpose TEXT DEFAULT NULL,
  p_apartment_count INT DEFAULT NULL,
  p_footprint_area_sqm NUMERIC DEFAULT NULL,
  p_is_leased_plot BOOLEAN DEFAULT NULL
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
  v_tontti_factor NUMERIC;
  v_age INT;
  v_municipality TEXT;
  v_progress NUMERIC;
  v_dampening NUMERIC;
  v_total_area NUMERIC;
BEGIN
  -- ========================================================
  -- Property type inference (Ryhti-first)
  -- ========================================================
  IF p_ryhti_main_purpose IS NOT NULL THEN
    IF p_ryhti_main_purpose = '0110' THEN
      v_property_type := 'omakotitalo';
    ELSIF p_ryhti_main_purpose IN ('0111', '0112', '0120') THEN
      v_property_type := 'rivitalo';
    ELSIF p_ryhti_main_purpose LIKE '01%' THEN
      v_property_type := 'kerrostalo';
    END IF;
  END IF;

  IF v_property_type IS NULL THEN
    IF p_building_type = 'apartments' THEN
      -- Low-rise 'apartments' with few units are rivitalo (row houses tagged as apartments in OSM).
      -- Data: 57% of 2-floor 'apartments' have ≤7 apts (classic RT: 2-3 per floor).
      IF p_floor_count IS NOT NULL AND p_floor_count <= 2 THEN
        IF p_apartment_count IS NOT NULL AND p_apartment_count > 7 THEN
          v_property_type := 'kerrostalo';
        ELSE
          v_property_type := 'rivitalo';
        END IF;
      ELSE
        v_property_type := 'kerrostalo';
      END IF;
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

  SELECT municipality INTO v_municipality
  FROM areas WHERE id = p_area_id;

  -- ========================================================
  -- PHASE 1: Area-level base price lookup
  -- OKT fallback: RT × 1.00, KT × 0.75 (recalibrated 2026-04)
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
      SELECT COALESCE(price_per_sqm_median, price_per_sqm_avg) * 1.00
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
      SELECT COALESCE(price_per_sqm_median, price_per_sqm_avg) * 0.75
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
  -- PHASE 2: Municipality-level fallback (median)
  -- ========================================================
  IF v_base_price IS NULL AND v_municipality IS NOT NULL THEN
    IF v_property_type = 'omakotitalo' THEN
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg)) * 1.00
      INTO v_base_price
      FROM price_estimates pe
      JOIN areas a ON a.id = pe.area_id
      WHERE a.municipality = v_municipality
        AND pe.year <= p_year
        AND pe.property_type = 'rivitalo'
        AND pe.price_per_sqm_avg IS NOT NULL;

      IF v_base_price IS NULL THEN
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg)) * 0.75
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
  -- Age factor (U-shaped curve, recalibrated 2026-04-01)
  -- ========================================================
  IF p_construction_year IS NULL THEN
    v_age_factor := 1.0;
  ELSE
    v_age := p_year - p_construction_year;
    v_age_factor := CASE
      WHEN v_age <= 0 THEN 1.55
      WHEN v_age <= 5 THEN 1.47
      WHEN v_age <= 10 THEN 1.32
      WHEN v_age <= 20 THEN 1.18
      WHEN v_age <= 30 THEN 1.00
      WHEN v_age <= 40 THEN 0.90
      WHEN v_age <= 50 THEN 0.86
      WHEN v_age <= 60 THEN 0.82
      WHEN v_age <= 70 THEN 0.80
      WHEN v_age <= 80 THEN 0.85
      WHEN v_age <= 100 THEN 0.88
      ELSE 0.88
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

  -- ========================================================
  -- Floor count factor (property-type-aware)
  -- ========================================================
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

  -- ========================================================
  -- Size factor (building size, matches priceEstimation.ts)
  -- ========================================================
  v_size_factor := 1.0;

  IF v_property_type = 'kerrostalo' AND p_apartment_count IS NOT NULL THEN
    v_size_factor := CASE
      WHEN p_apartment_count >= 60 THEN 0.97
      WHEN p_apartment_count >= 30 THEN 1.00
      WHEN p_apartment_count >= 10 THEN 1.02
      ELSE 1.04
    END;
  ELSIF v_property_type = 'omakotitalo' AND p_footprint_area_sqm IS NOT NULL THEN
    v_total_area := p_footprint_area_sqm * COALESCE(p_floor_count, 1);
    v_size_factor := CASE
      WHEN v_total_area > 300 THEN 0.92
      WHEN v_total_area > 200 THEN 0.96
      WHEN v_total_area > 100 THEN 1.00
      ELSE 1.03
    END;
  END IF;

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

    IF v_neighborhood_factor > 1.0 THEN
      v_neighborhood_factor := 1.0 + (v_neighborhood_factor - 1.0) * (1.0 - v_dampening);
    END IF;
  END IF;

  -- ========================================================
  -- Tontti factor (vuokratontti = municipality-owned plot)
  -- Applied to kerrostalo + rivitalo only. OKT excluded.
  -- Matches TONTTI_FACTOR_LEASED = 0.92 in priceEstimation.ts
  -- ========================================================
  v_tontti_factor := 1.0;
  IF p_is_leased_plot = true AND v_property_type IN ('kerrostalo', 'rivitalo') THEN
    v_tontti_factor := 0.92;
  END IF;

  RETURN ROUND(v_base_price * v_age_factor * v_energy_factor * v_water_factor
               * v_floor_factor * v_size_factor * v_neighborhood_factor * v_tontti_factor);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- Re-create compute_all_building_prices (unchanged from 025)
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
      floor_count, building_type, p_year, ryhti_main_purpose,
      apartment_count, footprint_area_sqm, is_leased_plot
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
