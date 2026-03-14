-- ============================================================
-- Neighborhood factors (aluekerroin)
-- ============================================================
-- Adds per-postal-code-area correction factors computed from
-- real Etuovi.fi market data. Captures neighborhood-level
-- price variation that StatFin postal code averages miss.
--
-- New formula:
--   estimated = base × age × water × floor × neighborhood
--
-- After deploying this:
--   1. Populate neighborhood_factors from Etuovi data
--   2. UPDATE buildings SET estimation_year = NULL;
--   3. npx tsx scripts/data-import/05-compute-building-prices.ts
-- ============================================================

-- Staging table for Etuovi listings
CREATE TABLE IF NOT EXISTS _etuovi_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT,
  neighborhood TEXT,
  city TEXT,
  postal_code TEXT,
  property_type TEXT,
  construction_year INT,
  asking_price_total NUMERIC,
  size_sqm NUMERIC,
  asking_price_per_sqm NUMERIC,
  area_id UUID REFERENCES areas(id),
  collected_at TIMESTAMPTZ DEFAULT NOW()
);

-- Neighborhood correction factors
CREATE TABLE IF NOT EXISTS neighborhood_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  property_type TEXT NOT NULL,
  factor NUMERIC NOT NULL DEFAULT 1.0,
  sample_count INT NOT NULL DEFAULT 0,
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low', 'default')),
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(area_id, property_type)
);

CREATE INDEX IF NOT EXISTS idx_neighborhood_factors_area
  ON neighborhood_factors(area_id);

CREATE INDEX IF NOT EXISTS idx_etuovi_staging_area
  ON _etuovi_staging(area_id);

CREATE INDEX IF NOT EXISTS idx_etuovi_staging_postal
  ON _etuovi_staging(postal_code);

-- ============================================================
-- Updated compute_building_price() with neighborhood factor
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
  v_neighborhood_factor NUMERIC;
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
  -- PHASE 2: Municipality-level fallback
  -- ========================================================
  IF v_base_price IS NULL THEN
    IF v_municipality IS NOT NULL THEN
      SELECT AVG(COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg))
      INTO v_base_price
      FROM price_estimates pe
      JOIN areas a ON a.id = pe.area_id
      WHERE a.municipality = v_municipality
        AND pe.year <= p_year
        AND pe.property_type = v_property_type
        AND pe.price_per_sqm_avg IS NOT NULL;

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

  -- ========================================================
  -- Neighborhood factor (aluekerroin)
  -- Lookup order: exact type → 'all' → municipality median → 1.0
  -- ========================================================
  v_neighborhood_factor := NULL;

  -- Try exact area + property type (require ≥3 samples for reliability)
  SELECT factor INTO v_neighborhood_factor
  FROM neighborhood_factors
  WHERE area_id = p_area_id
    AND property_type = v_property_type
    AND sample_count >= 3;

  -- Fallback: universal factor for this area (require ≥3 samples)
  IF v_neighborhood_factor IS NULL THEN
    SELECT factor INTO v_neighborhood_factor
    FROM neighborhood_factors
    WHERE area_id = p_area_id
      AND property_type = 'all'
      AND sample_count >= 3;
  END IF;

  -- Fallback: municipality median (from high/medium confidence areas)
  IF v_neighborhood_factor IS NULL AND v_municipality IS NOT NULL THEN
    SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY nf.factor)
    INTO v_neighborhood_factor
    FROM neighborhood_factors nf
    JOIN areas a ON a.id = nf.area_id
    WHERE a.municipality = v_municipality
      AND nf.confidence IN ('high', 'medium')
      AND nf.property_type = v_property_type;
  END IF;

  -- Final fallback
  IF v_neighborhood_factor IS NULL THEN
    v_neighborhood_factor := 1.0;
  END IF;

  RETURN ROUND(v_base_price * v_age_factor * v_water_factor * v_floor_factor * v_neighborhood_factor);
END;
$$ LANGUAGE plpgsql STABLE;
