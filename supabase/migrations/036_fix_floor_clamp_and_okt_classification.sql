-- ============================================================
-- Migration 036: Fix systematic floor_count=2 and OKT→rivitalo errors
--
-- Two linked bugs introduced by migrations 030/034/035:
--
--   1. Migration 035's one-shot UPDATE used
--        GREATEST(2, ROUND(total_area_sqm / footprint_area_sqm))
--      which clamps the computed floor count to a minimum of 2.
--      1-story OKTs whose kerrosala is only 30-50% above footprint
--      (attic/extensions/data noise — ratio 1.3-1.5) were rounded to
--      1 by ROUND(), then forced to 2 by GREATEST(). Result: many
--      single-story houses now show floor_count=2.
--
--   2. compute_building_price() in 030/034 classifies ANY building
--      with floor_count=2 as rivitalo when no Ryhti/OSM type is
--      available, ignoring apartment_count. Combined with bug #1,
--      2-story OKTs with apartment_count=1 ended up priced and
--      displayed as rivitalo. The TS inferPropertyType() had the
--      same bug (fixed in app/lib/priceEstimation.ts).
--
-- Fix:
--   - Rewrite compute_building_price() property-type inference to
--     check apartment_count BEFORE using floor_count as a rivitalo
--     signal. Matches app/lib/priceEstimation.ts.
--   - Revert floor_count=2 → 1 for OKTs where the kerrosala ratio
--     is in [1.3, 1.5) (where migration 035's clamp did its damage).
--   - Reset estimation_year for affected buildings so the next
--     run of compute_all_building_prices() picks up the corrected
--     classification and floor count.
--
-- After deploying:
--   1. Run this migration in Supabase SQL Editor.
--   2. Recompute: npx tsx scripts/data-import/05-compute-building-prices.ts
--   3. Bump TILE_VERSION in app/components/map/MapContainer.tsx.
-- ============================================================

-- ============================================================
-- Fix: compute_building_price — apartment_count-aware inference
-- Synced with inferPropertyType() in app/lib/priceEstimation.ts
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
  p_footprint_area_sqm NUMERIC DEFAULT NULL
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
  v_raw_estimate NUMERIC;
  v_price_range_correction NUMERIC;
BEGIN
  -- ========================================================
  -- Property type inference (Ryhti > OSM type > heuristics)
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
      -- Low-rise 'apartments' with few units are rivitalo (OSM tag misuse)
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
    -- 2+ apartments at any small floor count → paritalo/rivitalo.
    -- Takes precedence over floor_count so 2-story single-family homes
    -- (apartment_count=1) are not mislabeled as rivitalo.
    ELSIF p_apartment_count IS NOT NULL AND p_apartment_count >= 2 THEN
      v_property_type := 'rivitalo';
    ELSIF p_footprint_area_sqm IS NOT NULL AND p_footprint_area_sqm >= 300 THEN
      v_property_type := 'rivitalo';
    ELSE
      -- Default (incl. 2-story single-apartment buildings) → omakotitalo
      v_property_type := 'omakotitalo';
    END IF;
  END IF;

  SELECT municipality INTO v_municipality
  FROM areas WHERE id = p_area_id;

  -- ========================================================
  -- PHASE 1: Area-level base price lookup
  -- OKT fallback: rivitalo × 1.00, kerrostalo × 0.75
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

  v_energy_factor := 1.0;

  -- ========================================================
  -- Water proximity factor
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
  -- Size factor
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
    AND sample_count >= 2;

  IF v_neighborhood_factor IS NULL THEN
    SELECT factor INTO v_neighborhood_factor
    FROM neighborhood_factors
    WHERE area_id = p_area_id
      AND property_type = 'all'
      AND sample_count >= 2;
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
  -- Price-range correction (S-curve)
  -- ========================================================
  v_raw_estimate := v_base_price * v_age_factor * v_energy_factor * v_water_factor * v_floor_factor * v_size_factor * v_neighborhood_factor;

  v_price_range_correction := CASE
    WHEN v_raw_estimate <= 1500 THEN 0.92
    WHEN v_raw_estimate <= 2000 THEN 0.92 + 0.08 * ((v_raw_estimate - 1500) / 500.0)
    WHEN v_raw_estimate <= 6000 THEN 1.00
    WHEN v_raw_estimate <= 8000 THEN 1.00 + 0.06 * ((v_raw_estimate - 6000) / 2000.0)
    ELSE 1.06
  END;

  RETURN ROUND(v_raw_estimate * v_price_range_correction);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- One-shot data repair: revert migration 035's floor_count=2
-- over-clamp for OKTs whose kerrosala ratio indicates 1 story.
--
-- Migration 035 used GREATEST(2, ROUND(total/footprint)) which
-- promoted ratios 1.3-1.5 (ROUND → 1) all the way up to 2.
-- Ratios ≥ 1.5 legitimately round to 2+ and are left alone.
-- ============================================================
UPDATE buildings
SET
  floor_count = 1,
  estimation_year = NULL,
  estimated_price_per_sqm = NULL
WHERE floor_count = 2
  AND apartment_count = 1
  AND footprint_area_sqm IS NOT NULL
  AND total_area_sqm IS NOT NULL
  AND total_area_sqm > footprint_area_sqm * 1.3
  AND total_area_sqm < footprint_area_sqm * 1.5;

-- ============================================================
-- Reset prices for 2-story single-apartment buildings that were
-- mis-classified as rivitalo under the old logic. The corrected
-- compute_building_price() will re-resolve them as omakotitalo
-- when Ryhti/OSM don't say otherwise.
-- ============================================================
UPDATE buildings
SET
  estimation_year = NULL,
  estimated_price_per_sqm = NULL
WHERE floor_count = 2
  AND apartment_count = 1
  AND (ryhti_main_purpose IS NULL OR ryhti_main_purpose NOT LIKE '01%')
  AND (building_type IS NULL
       OR building_type NOT IN ('terrace', 'semidetached_house', 'apartments'));
