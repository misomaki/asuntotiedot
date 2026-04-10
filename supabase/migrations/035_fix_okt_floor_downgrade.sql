-- ============================================================
-- Migration 035: Prevent Ryhti from downgrading OKT floor counts
--
-- Problem: Ryhti reports number_of_storeys=1 for most Finnish
-- detached houses, including 1.5-story (puolitoistakerroksinen)
-- and 2-story houses. This overwrites correct OSM building:levels
-- data, making 99.7% of OKT show floor_count=1.
--
-- Fix: match_ryhti_floors_batch now refuses to downgrade
-- floor_count when the building already has a higher value from
-- OSM. Ryhti can still upgrade (e.g. NULL → 1, or 1 → 2).
--
-- After deploying:
--   1. Re-run enrichment: npx tsx scripts/data-import/06-enrich-from-ryhti.ts
--   2. OR run the one-shot fix query at the bottom of this migration
-- ============================================================

-- ============================================================
-- Updated match_ryhti_floors_batch: don't downgrade floor_count
-- ============================================================
CREATE OR REPLACE FUNCTION match_ryhti_floors_batch(p_limit INT DEFAULT 500)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE buildings b
  SET
    -- Ryhti overrides MML floor count, but NEVER downgrades
    floor_count = CASE
      WHEN b.floor_count IS NOT NULL AND sub.ryhti_storeys < b.floor_count
        THEN b.floor_count  -- keep existing higher value
      ELSE sub.ryhti_storeys
    END,
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
      -- Target buildings without floor_count OR where Ryhti disagrees
      AND (b2.floor_count IS NULL OR b2.floor_count != nearest.number_of_storeys)
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
-- One-shot fix: restore floor_count for OKT where Ryhti's
-- total_area_sqm proves the building has more than 1 floor.
-- If total_area > footprint * 1.3, the building has ≥2 floors.
-- ============================================================
UPDATE buildings
SET floor_count = GREATEST(2, ROUND(total_area_sqm / NULLIF(footprint_area_sqm, 0))::INT)
WHERE floor_count = 1
  AND apartment_count = 1
  AND footprint_area_sqm IS NOT NULL
  AND total_area_sqm IS NOT NULL
  AND total_area_sqm > footprint_area_sqm * 1.3;

-- ============================================================
-- Also update match_ryhti_to_buildings_batch: don't downgrade
-- ============================================================
CREATE OR REPLACE FUNCTION match_ryhti_to_buildings_batch(p_limit INT DEFAULT 500)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE buildings b
  SET
    construction_year = sub.ryhti_year,
    -- Ryhti overrides MML floor count, but NEVER downgrades
    floor_count = CASE
      WHEN _ryhti_floor_plausible(sub.ryhti_storeys, sub.ryhti_purpose, b.building_type, b.footprint_area_sqm)
        THEN CASE
          WHEN b.floor_count IS NOT NULL AND sub.ryhti_storeys IS NOT NULL AND sub.ryhti_storeys < b.floor_count
            THEN b.floor_count  -- keep existing higher value
          ELSE COALESCE(sub.ryhti_storeys, b.floor_count)
        END
      ELSE b.floor_count  -- keep existing if Ryhti is implausible
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
