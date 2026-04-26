-- ============================================================
-- Migration 038: Nearby postal code interpolation + S-curve guard + latest-year fix
--
-- Fixes for sparse-data areas (e.g. Espoo rivitalos showing ~€1500/m²):
--
--   1. Phase 1.5: IDW interpolation from nearest postal codes
--      when area-level price is missing (before municipality fallback)
--
--   2. S-curve guard: don't apply low-end discount (0.92) when
--      base price came from a fallback source
--
--   3. Municipality fallback latest-year fix: filter to max year
--      per area before computing PERCENTILE_CONT (was mixing all years)
--
-- After deploying:
--   1. Reset: UPDATE buildings SET estimation_year = NULL, estimated_price_per_sqm = NULL;
--   2. Recompute: npx tsx scripts/data-import/05-compute-building-prices.ts
-- ============================================================

-- Helper: get nearby area prices for IDW interpolation
CREATE OR REPLACE FUNCTION get_nearby_area_prices(
  p_area_id UUID,
  p_property_type TEXT,
  p_year INT
)
RETURNS TABLE(area_id UUID, price NUMERIC, distance_m DOUBLE PRECISION) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a_nbr.id AS area_id,
    COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg) AS price,
    GREATEST(ST_Distance(a_target.centroid::geography, a_nbr.centroid::geography), 100)::double precision AS distance_m
  FROM areas a_target
  CROSS JOIN LATERAL (
    SELECT a2.id, a2.centroid
    FROM areas a2
    WHERE a2.id != p_area_id
      AND a2.centroid IS NOT NULL
      AND ST_DWithin(a_target.centroid::geography, a2.centroid::geography, 10000)
    ORDER BY a_target.centroid::geography <-> a2.centroid::geography
    LIMIT 5
  ) a_nbr
  JOIN LATERAL (
    SELECT pe2.price_per_sqm_median, pe2.price_per_sqm_avg
    FROM price_estimates pe2
    WHERE pe2.area_id = a_nbr.id
      AND pe2.property_type = p_property_type
      AND pe2.year = (
        SELECT MAX(pe3.year)
        FROM price_estimates pe3
        WHERE pe3.area_id = a_nbr.id
          AND pe3.property_type = p_property_type
          AND pe3.year <= p_year
          AND pe3.price_per_sqm_avg IS NOT NULL
      )
      AND pe2.price_per_sqm_avg IS NOT NULL
    LIMIT 1
  ) pe ON true
  WHERE a_target.id = p_area_id
    AND a_target.centroid IS NOT NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Updated compute_building_price with Phase 1.5 + S-curve guard + latest-year fix
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
  v_lookup_type TEXT;
  v_base_price NUMERIC;
  v_is_fallback BOOLEAN := false;
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
  v_idw_numerator NUMERIC;
  v_idw_denominator NUMERIC;
  v_neighbor_count INT;
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

  SELECT municipality INTO v_municipality
  FROM areas WHERE id = p_area_id;

  -- ========================================================
  -- PHASE 1: Area-level base price lookup
  -- OKT fallback: rivitalo × 1.00, kerrostalo × 0.75
  -- (synced with OKT_FALLBACK in priceEstimation.ts)
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
  -- PHASE 1.5: Nearby postal code interpolation (IDW)
  -- Max 5 neighbors within 10km, min 2 required
  -- IDW power=2, min distance clamped to 100m
  -- ========================================================
  IF v_base_price IS NULL THEN
    -- Try exact property type first
    v_lookup_type := v_property_type;

    SELECT SUM(nbr.price / nbr.distance_m) AS idw_num,
           SUM(1.0 / nbr.distance_m) AS idw_den,
           COUNT(*) AS cnt
    INTO v_idw_numerator, v_idw_denominator, v_neighbor_count
    FROM get_nearby_area_prices(p_area_id, v_lookup_type, p_year) nbr;

    IF v_neighbor_count >= 2 AND v_idw_denominator > 0 THEN
      v_base_price := v_idw_numerator / v_idw_denominator;
      v_is_fallback := true;
    END IF;

    -- OKT cascade: try rivitalo neighbors, then kerrostalo neighbors
    IF v_base_price IS NULL AND v_property_type = 'omakotitalo' THEN
      SELECT SUM(nbr.price / nbr.distance_m) / NULLIF(SUM(1.0 / nbr.distance_m), 0),
             COUNT(*)
      INTO v_base_price, v_neighbor_count
      FROM get_nearby_area_prices(p_area_id, 'rivitalo', p_year) nbr;

      IF v_neighbor_count >= 2 AND v_base_price IS NOT NULL THEN
        v_base_price := v_base_price * 1.00;  -- OKT_FALLBACK.fromRivitalo
        v_is_fallback := true;
      ELSE
        v_base_price := NULL;
      END IF;
    END IF;

    IF v_base_price IS NULL AND v_property_type = 'omakotitalo' THEN
      SELECT SUM(nbr.price / nbr.distance_m) / NULLIF(SUM(1.0 / nbr.distance_m), 0),
             COUNT(*)
      INTO v_base_price, v_neighbor_count
      FROM get_nearby_area_prices(p_area_id, 'kerrostalo', p_year) nbr;

      IF v_neighbor_count >= 2 AND v_base_price IS NOT NULL THEN
        v_base_price := v_base_price * 0.75;  -- OKT_FALLBACK.fromKerrostalo
        v_is_fallback := true;
      ELSE
        v_base_price := NULL;
      END IF;
    END IF;

    -- RT cascade: try kerrostalo neighbors × 0.85
    IF v_base_price IS NULL AND v_property_type = 'rivitalo' THEN
      SELECT SUM(nbr.price / nbr.distance_m) / NULLIF(SUM(1.0 / nbr.distance_m), 0),
             COUNT(*)
      INTO v_base_price, v_neighbor_count
      FROM get_nearby_area_prices(p_area_id, 'kerrostalo', p_year) nbr;

      IF v_neighbor_count >= 2 AND v_base_price IS NOT NULL THEN
        v_base_price := v_base_price * 0.85;
        v_is_fallback := true;
      ELSE
        v_base_price := NULL;
      END IF;
    END IF;
  END IF;

  -- ========================================================
  -- PHASE 2: Municipality-level fallback (median)
  -- FIXED: filter to latest year per area before PERCENTILE_CONT
  -- (was mixing all years, diluting with older cheaper prices)
  -- OKT fallback: rivitalo × 1.00, kerrostalo × 0.75
  -- ========================================================
  IF v_base_price IS NULL AND v_municipality IS NOT NULL THEN
    v_is_fallback := true;

    IF v_property_type = 'omakotitalo' THEN
      -- OKT: try rivitalo municipality median × 1.00
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latest.price) * 1.00
      INTO v_base_price
      FROM (
        SELECT DISTINCT ON (a.id)
          COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg) AS price
        FROM price_estimates pe
        JOIN areas a ON a.id = pe.area_id
        WHERE a.municipality = v_municipality
          AND pe.property_type = 'rivitalo'
          AND pe.price_per_sqm_avg IS NOT NULL
          AND pe.year = (
            SELECT MAX(pe2.year)
            FROM price_estimates pe2
            WHERE pe2.area_id = pe.area_id
              AND pe2.property_type = 'rivitalo'
              AND pe2.year <= p_year
              AND pe2.price_per_sqm_avg IS NOT NULL
          )
        ORDER BY a.id
      ) latest;

      IF v_base_price IS NULL THEN
        -- OKT: try kerrostalo municipality median × 0.75
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latest.price) * 0.75
        INTO v_base_price
        FROM (
          SELECT DISTINCT ON (a.id)
            COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg) AS price
          FROM price_estimates pe
          JOIN areas a ON a.id = pe.area_id
          WHERE a.municipality = v_municipality
            AND pe.property_type = 'kerrostalo'
            AND pe.price_per_sqm_avg IS NOT NULL
            AND pe.year = (
              SELECT MAX(pe2.year)
              FROM price_estimates pe2
              WHERE pe2.area_id = pe.area_id
                AND pe2.property_type = 'kerrostalo'
                AND pe2.year <= p_year
                AND pe2.price_per_sqm_avg IS NOT NULL
            )
          ORDER BY a.id
        ) latest;
      END IF;
    ELSE
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latest.price)
      INTO v_base_price
      FROM (
        SELECT DISTINCT ON (a.id)
          COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg) AS price
        FROM price_estimates pe
        JOIN areas a ON a.id = pe.area_id
        WHERE a.municipality = v_municipality
          AND pe.property_type = v_property_type
          AND pe.price_per_sqm_avg IS NOT NULL
          AND pe.year = (
            SELECT MAX(pe2.year)
            FROM price_estimates pe2
            WHERE pe2.area_id = pe.area_id
              AND pe2.property_type = v_property_type
              AND pe2.year <= p_year
              AND pe2.price_per_sqm_avg IS NOT NULL
          )
        ORDER BY a.id
      ) latest;

      IF v_base_price IS NULL AND v_property_type = 'rivitalo' THEN
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latest.price)
        INTO v_base_price
        FROM (
          SELECT DISTINCT ON (a.id)
            COALESCE(pe.price_per_sqm_median, pe.price_per_sqm_avg) AS price
          FROM price_estimates pe
          JOIN areas a ON a.id = pe.area_id
          WHERE a.municipality = v_municipality
            AND pe.property_type = 'kerrostalo'
            AND pe.price_per_sqm_avg IS NOT NULL
            AND pe.year = (
              SELECT MAX(pe2.year)
              FROM price_estimates pe2
              WHERE pe2.area_id = pe.area_id
                AND pe2.property_type = 'kerrostalo'
                AND pe2.year <= p_year
                AND pe2.price_per_sqm_avg IS NOT NULL
            )
          ORDER BY a.id
        ) latest;
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
  -- NO dampening — waterfront is permanent physical attribute
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
  -- Clamp [0.50, 1.50]
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
  -- Only neighborhood factor is dampened (market sentiment).
  -- Water factor is NOT dampened (permanent physical attribute).
  -- ========================================================
  IF v_age_factor < 0.85 THEN
    v_progress := LEAST(1.0, (0.85 - v_age_factor) / 0.15);
    v_dampening := 0.5 * v_progress;

    IF v_neighborhood_factor > 1.0 THEN
      v_neighborhood_factor := 1.0 + (v_neighborhood_factor - 1.0) * (1.0 - v_dampening);
    END IF;
  END IF;

  -- ========================================================
  -- Price-range correction (S-curve) with fallback guard
  -- When base price is from fallback (Phase 1.5 or 2),
  -- don't apply low-end discount — it compounds the error
  -- ========================================================
  v_raw_estimate := v_base_price * v_age_factor * v_energy_factor * v_water_factor * v_floor_factor * v_size_factor * v_neighborhood_factor;

  v_price_range_correction := CASE
    WHEN v_is_fallback AND v_raw_estimate <= 2000 THEN 1.00
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
-- Re-declare compute_all_building_prices to pick up changes
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
  v_count := 0;
  v_skipped := 0;

  WITH batch AS (
    SELECT b.id, b.area_id, b.construction_year,
           b.min_distance_to_water_m, b.floor_count,
           b.building_type, b.ryhti_main_purpose,
           b.apartment_count, b.footprint_area_sqm
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
        batch.footprint_area_sqm
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
