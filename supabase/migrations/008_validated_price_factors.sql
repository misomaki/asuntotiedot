-- ============================================================
-- Validated price factors (2026-03 Etuovi validation)
-- ============================================================
-- Updates compute_building_price() based on validation against
-- 82 Etuovi.fi listing prices. Key changes:
--
-- 1. Age factors: increased new construction premium (1.15→1.35),
--    softened age valley (0.72→0.78), raised old building factors
-- 2. OKT fallback: rivitalo×0.85→×1.10, kerrostalo×0.75→×0.90
--    (OKT prices are typically ABOVE RT in same area)
-- 3. Floor factor: rivitalo 1-floor gets ×1.05 premium
--    (yksitasoinen ~10% more expensive than kaksitasoinen)
--
-- After deploying this, re-run price computation:
--   UPDATE buildings SET estimation_year = NULL;
--   Then run: npx tsx scripts/data-import/05-compute-building-prices.ts
-- ============================================================

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
  v_water_factor NUMERIC;
  v_floor_factor NUMERIC;
  v_age INT;
  v_municipality TEXT;
BEGIN
  -- Map building type to property type
  IF p_floor_count >= 3 OR p_building_type IN ('apartments', 'residential') THEN
    v_property_type := 'kerrostalo';
  ELSIF p_floor_count = 2 OR p_building_type IN ('terrace', 'semidetached_house') THEN
    v_property_type := 'rivitalo';
  ELSE
    v_property_type := 'omakotitalo';
  END IF;

  -- ========================================================
  -- PHASE 1: Area-level lookup (specific postal code)
  -- ========================================================
  IF v_property_type = 'omakotitalo' THEN
    -- Try omakotitalo first (future-proofing)
    SELECT COALESCE(price_per_sqm_median, price_per_sqm_avg)
    INTO v_base_price
    FROM price_estimates
    WHERE area_id = p_area_id
      AND year <= p_year
      AND property_type = 'omakotitalo'
      AND price_per_sqm_avg IS NOT NULL
    ORDER BY year DESC
    LIMIT 1;

    -- Fallback to rivitalo × 1.10 (OKT typically above RT in same area)
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

    -- Fallback to kerrostalo × 0.90
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
    -- Direct lookup for kerrostalo / rivitalo
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
  -- PHASE 2: Municipality-level fallback (average across postal codes)
  -- ========================================================
  IF v_base_price IS NULL THEN
    SELECT municipality INTO v_municipality
    FROM areas WHERE id = p_area_id;

    IF v_municipality IS NOT NULL THEN
      -- Try exact property type at municipality level
      SELECT AVG(COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg))
      INTO v_base_price
      FROM price_estimates pe
      JOIN areas a ON a.id = pe.area_id
      WHERE a.municipality = v_municipality
        AND pe.year <= p_year
        AND pe.property_type = v_property_type
        AND pe.price_per_sqm_avg IS NOT NULL;

      -- Omakotitalo municipality fallback: rivitalo × 1.10
      IF v_base_price IS NULL AND v_property_type = 'omakotitalo' THEN
        SELECT AVG(COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg)) * 1.10
        INTO v_base_price
        FROM price_estimates pe
        JOIN areas a ON a.id = pe.area_id
        WHERE a.municipality = v_municipality
          AND pe.year <= p_year
          AND pe.property_type = 'rivitalo'
          AND pe.price_per_sqm_avg IS NOT NULL;
      END IF;

      -- Omakotitalo municipality fallback: kerrostalo × 0.90
      IF v_base_price IS NULL AND v_property_type = 'omakotitalo' THEN
        SELECT AVG(COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg)) * 0.90
        INTO v_base_price
        FROM price_estimates pe
        JOIN areas a ON a.id = pe.area_id
        WHERE a.municipality = v_municipality
          AND pe.year <= p_year
          AND pe.property_type = 'kerrostalo'
          AND pe.price_per_sqm_avg IS NOT NULL;
      END IF;

      -- Non-omakotitalo municipality fallback: try any available type
      IF v_base_price IS NULL AND v_property_type = 'kerrostalo' THEN
        SELECT AVG(COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg))
        INTO v_base_price
        FROM price_estimates pe
        JOIN areas a ON a.id = pe.area_id
        WHERE a.municipality = v_municipality
          AND pe.year <= p_year
          AND pe.property_type = 'kerrostalo'
          AND pe.price_per_sqm_avg IS NOT NULL;
      END IF;

      IF v_base_price IS NULL AND v_property_type = 'rivitalo' THEN
        SELECT AVG(COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg))
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
      WHEN v_age <= 0 THEN 1.35    -- brand new / under construction
      WHEN v_age <= 5 THEN 1.25    -- very new
      WHEN v_age <= 10 THEN 1.15   -- recent
      WHEN v_age <= 20 THEN 1.05   -- modern
      WHEN v_age <= 30 THEN 0.95   -- keep
      WHEN v_age <= 40 THEN 0.90   -- aging
      WHEN v_age <= 50 THEN 0.82   -- late 70s panels
      WHEN v_age <= 60 THEN 0.78   -- 60s-70s panels (valley)
      WHEN v_age <= 70 THEN 0.80   -- post-war, starting recovery
      WHEN v_age <= 80 THEN 0.85   -- 1940s-50s recovery
      WHEN v_age <= 100 THEN 0.90  -- pre-war, good value retention
      ELSE 0.92                     -- historical, character premium
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

  -- Floor count factor (property-type-aware, validated 2026-03)
  IF p_floor_count IS NULL THEN
    v_floor_factor := 1.0;
  ELSE
    IF v_property_type = 'rivitalo' THEN
      -- Single-story rivitalo command ~10% premium over two-story
      v_floor_factor := CASE
        WHEN p_floor_count = 1 THEN 1.05   -- yksitasoinen premium
        ELSE 1.0                             -- kaksitasoinen baseline
      END;
    ELSE
      -- Kerrostalo: taller buildings get slight premium
      v_floor_factor := CASE
        WHEN p_floor_count >= 8 THEN 1.03
        WHEN p_floor_count >= 5 THEN 1.01
        ELSE 1.0
      END;
    END IF;
  END IF;

  RETURN ROUND(v_base_price * v_age_factor * v_water_factor * v_floor_factor);
END;
$$ LANGUAGE plpgsql STABLE;
