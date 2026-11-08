-- ============================================================
-- Migration 040: Materialized base prices + calibration constants
--
-- Problem: base prices in sparse areas were single-year averages of
-- 3–8 transactions, computed by three divergent cascades (SQL, TS
-- provider, validation script). Migration 038 also silently dropped
-- p_total_area_sqm / p_is_leased_plot from compute_building_price.
--
-- This migration:
--   1. area_base_prices   — one shrunk base price per (area, type),
--                           built by scripts/data-import/13-build-area-base-prices.ts
--   2. price_calibration  — bias, S-curve knots, shrinkage k as DATA
--   3. municipality_prices — StatFin 13mx (KT/RT) + KHR kunta (OKT)
--   4. price_index        — StatFin 13mq annual index (2020=100)
--   5. khr_transaction_stats.region_type ('postal' | 'municipality')
--   6. areas.municipality_code
--   7. compute_building_price() rewritten: reads area_base_prices,
--      restores the full 11-parameter signature from migration 030,
--      applies bias + data-driven S-curve from price_calibration.
--
-- After deploying (see CLAUDE.md "Data-import"):
--   00-fill-municipality-codes → 02b-import-statfin-municipality →
--   10-import-khr-stats → 11-compute-khr-okt-prices →
--   13-build-area-base-prices → 08 → 09 → calibrate-scurve →
--   reset + 05-compute-building-prices
-- ============================================================

-- ------------------------------------------------------------
-- 1. area_base_prices
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS area_base_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  property_type TEXT NOT NULL CHECK (
    property_type IN ('kerrostalo', 'rivitalo', 'omakotitalo')
  ),
  base_price NUMERIC NOT NULL,
  -- 'area'         own data dominates (n_own >= 3k)
  -- 'shrunk'       own data blended with parent (0 < n_own < 3k)
  -- 'nearby'       no own data, IDW of nearby postal codes
  -- 'municipality' no own data, municipality-level price
  -- 'cascade'      no own data, derived from another property type in same area
  source TEXT NOT NULL CHECK (
    source IN ('area', 'shrunk', 'nearby', 'municipality', 'cascade')
  ),
  n_own NUMERIC NOT NULL DEFAULT 0,
  p_own NUMERIC,
  n_effective NUMERIC NOT NULL DEFAULT 0,
  p_parent NUMERIC,
  parent_source TEXT,
  years_used INT[],
  details JSONB,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(area_id, property_type)
);

CREATE INDEX IF NOT EXISTS idx_area_base_prices_area
  ON area_base_prices(area_id);

COMMENT ON TABLE area_base_prices IS
  'Single source of truth for €/m² base prices per postal code + property type. Shrinkage-pooled from price_estimates, municipality_prices and neighbours. Rebuilt by 13-build-area-base-prices.ts.';

-- ------------------------------------------------------------
-- 2. price_calibration
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_calibration (
  key TEXT PRIMARY KEY,
  value NUMERIC NOT NULL,
  note TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE price_calibration IS
  'Calibration constants for compute_building_price() and priceEstimation.ts: bias.<type>, shrink.k.<type>, scurve.<knot>. Written by 09-compute-neighborhood-factors.ts and calibrate-scurve.ts.';

INSERT INTO price_calibration (key, value, note) VALUES
  ('bias.kerrostalo',  1.00, 'Global asking/estimate ratio, KT (09-compute-neighborhood-factors)'),
  ('bias.rivitalo',    1.00, 'Global asking/estimate ratio, RT'),
  ('bias.omakotitalo', 1.00, 'Global asking/estimate ratio, OKT'),
  ('shrink.k.kerrostalo',  10, 'Prior weight (pseudo-transactions) for KT base price shrinkage'),
  ('shrink.k.rivitalo',     8, 'Prior weight for RT'),
  ('shrink.k.omakotitalo',  6, 'Prior weight for OKT'),
  ('scurve.1500', 0.92, 'Price-range correction at raw <= 1500 €/m²'),
  ('scurve.2000', 1.00, 'Price-range correction at 2000 €/m²'),
  ('scurve.4000', 1.00, 'Price-range correction at 4000 €/m²'),
  ('scurve.6000', 1.00, 'Price-range correction at 6000 €/m²'),
  ('scurve.8000', 1.06, 'Price-range correction at raw >= 8000 €/m²')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 3. municipality_prices
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS municipality_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_code TEXT NOT NULL,          -- Tilastokeskus kunta code, e.g. '091'
  municipality TEXT NOT NULL,
  year INT NOT NULL,
  property_type TEXT NOT NULL CHECK (
    property_type IN ('kerrostalo', 'rivitalo', 'omakotitalo')
  ),
  price_per_sqm NUMERIC NOT NULL,
  transaction_count INT,
  source TEXT NOT NULL CHECK (source IN ('statfin_13mx', 'khr_kunta')),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(municipality_code, year, property_type, source)
);

CREATE INDEX IF NOT EXISTS idx_municipality_prices_code
  ON municipality_prices(municipality_code, property_type);

-- ------------------------------------------------------------
-- 4. price_index (StatFin 13mq, 2020 = 100)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_code TEXT NOT NULL,                  -- '091', 'MK06', 'ksu' ...
  area_name TEXT,
  year INT NOT NULL,
  property_type TEXT NOT NULL CHECK (property_type IN ('kerrostalo', 'rivitalo')),
  index_value NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(area_code, year, property_type)
);

-- ------------------------------------------------------------
-- 5. khr_transaction_stats.region_type
-- ------------------------------------------------------------
ALTER TABLE khr_transaction_stats
  ADD COLUMN IF NOT EXISTS region_type TEXT NOT NULL DEFAULT 'postal'
  CHECK (region_type IN ('postal', 'municipality'));

ALTER TABLE khr_transaction_stats
  DROP CONSTRAINT IF EXISTS khr_transaction_stats_area_code_year_location_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS khr_transaction_stats_region_year_key
  ON khr_transaction_stats(area_code, year, location_type, region_type);

-- ------------------------------------------------------------
-- 6. areas.municipality_code
-- ------------------------------------------------------------
ALTER TABLE areas ADD COLUMN IF NOT EXISTS municipality_code TEXT;
CREATE INDEX IF NOT EXISTS idx_areas_municipality_code ON areas(municipality_code);

-- ------------------------------------------------------------
-- 7a. Helper: calibration lookup with default
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION calib(p_key TEXT, p_default NUMERIC)
RETURNS NUMERIC AS $$
  SELECT COALESCE((SELECT value FROM price_calibration WHERE key = p_key), p_default);
$$ LANGUAGE sql STABLE;

-- ------------------------------------------------------------
-- 7b. Helper: data-driven S-curve (piecewise linear between knots)
-- Knots: 1500, 2000, 4000, 6000, 8000 — flat outside.
-- Fallback guard: neutral below 2000 when base is a fallback source.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION price_range_correction(p_raw NUMERIC, p_is_fallback BOOLEAN)
RETURNS NUMERIC AS $$
DECLARE
  k1500 NUMERIC := calib('scurve.1500', 0.92);
  k2000 NUMERIC := calib('scurve.2000', 1.00);
  k4000 NUMERIC := calib('scurve.4000', 1.00);
  k6000 NUMERIC := calib('scurve.6000', 1.00);
  k8000 NUMERIC := calib('scurve.8000', 1.06);
BEGIN
  IF p_is_fallback AND p_raw <= 2000 THEN
    RETURN 1.00;
  END IF;
  IF p_raw <= 1500 THEN RETURN k1500; END IF;
  IF p_raw <= 2000 THEN RETURN k1500 + (k2000 - k1500) * ((p_raw - 1500) / 500.0); END IF;
  IF p_raw <= 4000 THEN RETURN k2000 + (k4000 - k2000) * ((p_raw - 2000) / 2000.0); END IF;
  IF p_raw <= 6000 THEN RETURN k4000 + (k6000 - k4000) * ((p_raw - 4000) / 2000.0); END IF;
  IF p_raw <= 8000 THEN RETURN k6000 + (k8000 - k6000) * ((p_raw - 6000) / 2000.0); END IF;
  RETURN k8000;
END;
$$ LANGUAGE plpgsql STABLE;

-- ------------------------------------------------------------
-- 7c. compute_building_price — full signature restored (migration 030),
--     base price from area_base_prices, bias + S-curve from calibration.
--     Factors are kept in sync with app/lib/priceEstimation.ts.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS compute_building_price(uuid, int, numeric, int, text, int, text, int, numeric);
DROP FUNCTION IF EXISTS compute_building_price(uuid, int, numeric, int, text, int, text, int, numeric, numeric, boolean);

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
  p_total_area_sqm NUMERIC DEFAULT NULL,
  p_is_leased_plot BOOLEAN DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
  v_property_type TEXT;
  v_base_price NUMERIC;
  v_base_source TEXT;
  v_is_fallback BOOLEAN := false;
  v_bias NUMERIC;
  v_age_factor NUMERIC;
  v_energy_factor NUMERIC;
  v_water_factor NUMERIC;
  v_floor_factor NUMERIC;
  v_size_factor NUMERIC;
  v_neighborhood_factor NUMERIC;
  v_tontti_factor NUMERIC;
  v_age INT;
  v_progress NUMERIC;
  v_dampening NUMERIC;
  v_total_area NUMERIC;
  v_raw_estimate NUMERIC;
BEGIN
  -- ========================================================
  -- Property type inference (synced with inferPropertyType in priceEstimation.ts)
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
    ELSIF p_floor_count IS NOT NULL AND p_floor_count >= 3 THEN
      v_property_type := 'kerrostalo';
    ELSIF p_apartment_count IS NOT NULL AND p_apartment_count >= 2 THEN
      v_property_type := 'rivitalo';
    ELSIF p_footprint_area_sqm IS NOT NULL AND p_footprint_area_sqm >= 300 THEN
      v_property_type := 'rivitalo';
    ELSE
      v_property_type := 'omakotitalo';
    END IF;
  END IF;

  -- ========================================================
  -- Base price: single lookup from area_base_prices
  -- ========================================================
  SELECT base_price, source
  INTO v_base_price, v_base_source
  FROM area_base_prices
  WHERE area_id = p_area_id
    AND property_type = v_property_type;

  IF v_base_price IS NULL THEN
    RETURN NULL;
  END IF;

  v_is_fallback := v_base_source IN ('nearby', 'municipality', 'cascade');

  -- Global bias (asking/estimate ratio learned from Etuovi training split)
  v_bias := calib('bias.' || v_property_type, 1.0);
  v_base_price := v_base_price * v_bias;

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
  -- Water proximity factor (recalibrated 2026-03-21, no dampening)
  -- distance 0 = centroid inside simplified water polygon → neutral
  -- ========================================================
  IF p_distance_to_water IS NULL OR p_distance_to_water = 0 THEN
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
  ELSIF v_property_type = 'rivitalo' THEN
    v_floor_factor := CASE WHEN p_floor_count = 1 THEN 1.05 ELSE 1.0 END;
  ELSE
    v_floor_factor := CASE
      WHEN p_floor_count >= 8 THEN 1.03
      WHEN p_floor_count >= 5 THEN 1.01
      ELSE 1.0
    END;
  END IF;

  -- ========================================================
  -- Size factor (synced with computeSizeFactor)
  -- ========================================================
  v_size_factor := 1.0;

  IF v_property_type = 'kerrostalo' AND p_apartment_count IS NOT NULL THEN
    v_size_factor := CASE
      WHEN p_apartment_count >= 60 THEN 0.97
      WHEN p_apartment_count >= 30 THEN 1.00
      WHEN p_apartment_count >= 10 THEN 1.02
      ELSE 1.04
    END;
  ELSIF v_property_type = 'omakotitalo' THEN
    IF p_total_area_sqm IS NOT NULL THEN
      v_total_area := p_total_area_sqm;
    ELSIF p_footprint_area_sqm IS NOT NULL THEN
      v_total_area := p_footprint_area_sqm * COALESCE(p_floor_count, 1);
    END IF;
    IF v_total_area IS NOT NULL THEN
      v_size_factor := CASE
        WHEN v_total_area > 300 THEN 0.92
        WHEN v_total_area > 200 THEN 0.96
        WHEN v_total_area > 100 THEN 1.00
        ELSE 1.03
      END;
    END IF;
  END IF;

  -- ========================================================
  -- Neighborhood factor (already shrunk by sample size in 09-compute)
  -- exact type → 'all' → 1.0
  -- ========================================================
  SELECT factor INTO v_neighborhood_factor
  FROM neighborhood_factors
  WHERE area_id = p_area_id
    AND property_type = v_property_type
    AND sample_count >= 1;

  IF v_neighborhood_factor IS NULL THEN
    SELECT factor INTO v_neighborhood_factor
    FROM neighborhood_factors
    WHERE area_id = p_area_id
      AND property_type = 'all'
      AND sample_count >= 1;
  END IF;

  IF v_neighborhood_factor IS NULL THEN
    v_neighborhood_factor := 1.0;
  END IF;

  -- Premium dampening for old buildings (neighborhood only)
  IF v_age_factor < 0.85 AND v_neighborhood_factor > 1.0 THEN
    v_progress := LEAST(1.0, (0.85 - v_age_factor) / 0.15);
    v_dampening := 0.5 * v_progress;
    v_neighborhood_factor := 1.0 + (v_neighborhood_factor - 1.0) * (1.0 - v_dampening);
  END IF;

  -- ========================================================
  -- Leased plot (vuokratontti) discount — KT and RT only
  -- ========================================================
  v_tontti_factor := 1.0;
  IF p_is_leased_plot = TRUE AND v_property_type <> 'omakotitalo' THEN
    v_tontti_factor := 0.92;
  END IF;

  -- ========================================================
  -- Raw estimate + data-driven S-curve
  -- ========================================================
  v_raw_estimate := v_base_price * v_age_factor * v_energy_factor * v_water_factor
                    * v_floor_factor * v_size_factor * v_neighborhood_factor * v_tontti_factor;

  RETURN ROUND(v_raw_estimate * price_range_correction(v_raw_estimate, v_is_fallback));
END;
$$ LANGUAGE plpgsql STABLE;

-- ------------------------------------------------------------
-- 7d. compute_all_building_prices — passes total_area_sqm + is_leased_plot
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION compute_all_building_prices(
  p_year INT,
  p_limit INT DEFAULT 1000
)
RETURNS INT AS $$
DECLARE
  v_count INT := 0;
BEGIN
  WITH batch AS (
    SELECT b.id, b.area_id, b.construction_year,
           b.min_distance_to_water_m, b.floor_count,
           b.building_type, b.ryhti_main_purpose,
           b.apartment_count, b.footprint_area_sqm,
           b.total_area_sqm, b.is_leased_plot
    FROM buildings b
    WHERE b.estimation_year IS NULL
      AND b.is_residential = true
    LIMIT p_limit
  ),
  computed AS (
    SELECT
      batch.id,
      compute_building_price(
        batch.area_id,
        batch.construction_year,
        batch.min_distance_to_water_m,
        batch.floor_count,
        batch.building_type,
        p_year,
        batch.ryhti_main_purpose,
        batch.apartment_count,
        batch.footprint_area_sqm,
        batch.total_area_sqm,
        batch.is_leased_plot
      ) AS price
    FROM batch
  )
  UPDATE buildings b
  SET estimated_price_per_sqm = computed.price,
      estimation_year = p_year
  FROM computed
  WHERE b.id = computed.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
