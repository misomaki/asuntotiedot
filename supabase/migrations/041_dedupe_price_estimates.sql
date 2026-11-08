-- ============================================================
-- Migration 041: Deduplicate price_estimates + NULL-safe uniqueness
--
-- UNIQUE (area_id, year, quarter, property_type) treats NULL quarters as
-- distinct, so every re-run of the yearly imports (02, 11) that used
-- upsert(onConflict: 'area_id,year,quarter,property_type') inserted a new
-- duplicate instead of updating: 17 786 KT rows for 6 442 keys (2026-11-08).
-- The duplicates are identical, but they inflated transaction counts in any
-- aggregate that summed them.
--
-- Postgres 15+ supports UNIQUE NULLS NOT DISTINCT, which makes the upserts
-- behave as intended.
-- ============================================================

-- 1. Remove duplicates, keeping the most recently updated row per key
DELETE FROM price_estimates p
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY area_id, year, quarter, property_type
           ORDER BY updated_at DESC NULLS LAST, id
         ) AS rn
  FROM price_estimates
) d
WHERE p.id = d.id AND d.rn > 1;

-- 2. Replace the constraint with a NULL-safe one
ALTER TABLE price_estimates
  DROP CONSTRAINT IF EXISTS price_estimates_area_id_year_quarter_property_type_key;

ALTER TABLE price_estimates
  ADD CONSTRAINT price_estimates_area_id_year_quarter_property_type_key
  UNIQUE NULLS NOT DISTINCT (area_id, year, quarter, property_type);
