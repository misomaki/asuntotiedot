-- ============================================================
-- Fix: Omakotitalo fallback pricing + U-shaped age curve
-- ============================================================
-- 1. Omakotitalo cascading fallback: rivitalo×0.85, kerrostalo×0.75
-- 2. U-shaped age curve: 1960s-70s panels cheapest, pre-war recovers
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
BEGIN
  -- Map building type to property type
  IF p_floor_count >= 3 OR p_building_type IN ('apartments', 'residential') THEN
    v_property_type := 'kerrostalo';
  ELSIF p_floor_count = 2 OR p_building_type IN ('terrace', 'semidetached_house') THEN
    v_property_type := 'rivitalo';
  ELSE
    v_property_type := 'omakotitalo';
  END IF;

  -- Get base price from real StatFin data.
  -- Omakotitalo uses cascading fallback: rivitalo×0.85 → kerrostalo×0.75.
  IF v_property_type = 'omakotitalo' THEN
    -- Try omakotitalo first (future-proofing if data becomes available)
    SELECT COALESCE(price_per_sqm_median, price_per_sqm_avg)
    INTO v_base_price
    FROM price_estimates
    WHERE area_id = p_area_id
      AND year <= p_year
      AND property_type = 'omakotitalo'
      AND price_per_sqm_avg IS NOT NULL
    ORDER BY year DESC
    LIMIT 1;

    -- Fallback to rivitalo × 0.85
    IF v_base_price IS NULL THEN
      SELECT COALESCE(price_per_sqm_median, price_per_sqm_avg) * 0.85
      INTO v_base_price
      FROM price_estimates
      WHERE area_id = p_area_id
        AND year <= p_year
        AND property_type = 'rivitalo'
        AND price_per_sqm_avg IS NOT NULL
      ORDER BY year DESC
      LIMIT 1;
    END IF;

    -- Fallback to kerrostalo × 0.75
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

  IF v_base_price IS NULL THEN
    RETURN NULL;
  END IF;

  -- Age factor (U-shaped curve)
  -- 1960s-70s panel houses are cheapest; pre-war buildings recover value.
  IF p_construction_year IS NULL THEN
    v_age_factor := 1.0;
  ELSE
    v_age := p_year - p_construction_year;
    v_age_factor := CASE
      WHEN v_age <= 0 THEN 1.15
      WHEN v_age <= 5 THEN 1.10
      WHEN v_age <= 10 THEN 1.05
      WHEN v_age <= 20 THEN 1.00
      WHEN v_age <= 30 THEN 0.95
      WHEN v_age <= 40 THEN 0.88
      WHEN v_age <= 50 THEN 0.78   -- late 70s panels
      WHEN v_age <= 60 THEN 0.72   -- 60s-70s panels (valley — cheapest)
      WHEN v_age <= 70 THEN 0.75   -- post-war, starting recovery
      WHEN v_age <= 80 THEN 0.80   -- 1940s-50s recovery
      WHEN v_age <= 100 THEN 0.85  -- pre-war, good value retention
      ELSE 0.88                     -- historical, character premium
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
    v_floor_factor := CASE
      WHEN p_floor_count >= 8 THEN 1.03
      WHEN p_floor_count >= 5 THEN 1.01
      ELSE 1.0
    END;
  END IF;

  RETURN ROUND(v_base_price * v_age_factor * v_water_factor * v_floor_factor);
END;
$$ LANGUAGE plpgsql STABLE;
