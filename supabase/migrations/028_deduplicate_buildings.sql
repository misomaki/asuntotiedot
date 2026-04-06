-- Migration 028: Deduplicate buildings and add unique constraint on osm_id
--
-- The import script (03-import-buildings.ts) was run multiple times without
-- deduplication, creating ~318K duplicate buildings (~45% of the table).
-- This migration:
--   1. Deletes duplicate rows, keeping the one with the most enriched data
--   2. Adds a unique constraint on osm_id to prevent future duplicates
--
-- Safe to run: no building_interests or building_sell_intents reference
-- any building_id yet (both tables are empty).

BEGIN;

-- Step 1: Delete duplicates, keeping the "best" row per osm_id.
-- "Best" = most non-null enrichment fields, then lowest id as tiebreaker.
DELETE FROM buildings
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY osm_id
        ORDER BY
          -- Prefer rows with more enrichment data (all nullable columns)
          (CASE WHEN construction_year IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN floor_count IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN apartment_count IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN energy_class IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN address IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN estimated_price_per_sqm IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN is_residential IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN ryhti_main_purpose IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN min_distance_to_water_m IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN footprint_area_sqm IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN min_distance_to_school_m IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN min_distance_to_kindergarten_m IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN min_distance_to_grocery_m IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN min_distance_to_transit_m IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN min_distance_to_park_m IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN min_distance_to_health_m IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN renovation_year IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN total_area_sqm IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN is_leased_plot IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN heating_method IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN construction_method IS NOT NULL THEN 1 ELSE 0 END
          ) DESC,
          id ASC  -- tiebreaker: keep the older row
      ) AS rn
    FROM buildings
    WHERE osm_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Step 2: Add unique constraint on osm_id to prevent future duplicates.
-- Full constraint (not partial) so Supabase .upsert({onConflict:'osm_id'}) works.
-- Also used for MML mtk_id (stored in osm_id column).
ALTER TABLE buildings ADD CONSTRAINT buildings_osm_id_unique UNIQUE (osm_id);

COMMIT;
