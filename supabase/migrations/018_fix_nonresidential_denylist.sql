-- ============================================================
-- Migration 018: Fix non-residential building classification
-- ============================================================
-- Problem: Several commercial building types (supermarket, shop,
-- library, stadium, parking, etc.) were missing from the OSM
-- building_type denylist, causing them to fall through as
-- is_residential=true and receive price estimations.
--
-- This migration:
-- 1. Updates compute_is_residential_batch() with expanded denylist
-- 2. Reclassifies affected buildings
-- 3. Resets their price estimations
-- ============================================================

-- ============================================================
-- 1. Replace compute_is_residential_batch with expanded denylist
-- ============================================================
CREATE OR REPLACE FUNCTION compute_is_residential_batch(p_limit INT DEFAULT 5000)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE buildings
  SET is_residential = CASE
    -- Tier 1: Ryhti main_purpose (highest authority)
    -- 01xx = asuinrakennukset (residential buildings)
    WHEN ryhti_main_purpose IS NOT NULL AND ryhti_main_purpose LIKE '01%' THEN true
    WHEN ryhti_main_purpose IS NOT NULL AND ryhti_main_purpose NOT LIKE '01%' THEN false

    -- Tier 2: OSM building_type denylist (expanded 2026-03)
    WHEN building_type IN (
      -- Commercial / retail
      'office', 'hotel', 'civic', 'commercial', 'retail',
      'supermarket', 'shop', 'kiosk', 'market', 'bakery',
      'pharmacy', 'bank', 'post_office', 'restaurant', 'cafe',
      -- Industrial / storage
      'industrial', 'warehouse', 'manufacture', 'service',
      'storage_tank', 'silo', 'hangar',
      -- Religious
      'church', 'chapel', 'mosque', 'synagogue', 'temple',
      -- Education / healthcare
      'hospital', 'school', 'university', 'kindergarten', 'college',
      -- Public / government
      'public', 'government', 'transportation', 'train_station',
      'fire_station', 'police', 'library', 'museum',
      -- Sports / leisure
      'sports_hall', 'sports_centre', 'grandstand', 'pavilion',
      'stadium', 'swimming_pool',
      -- Parking / transport
      'garage', 'garages', 'carport', 'parking',
      -- Agricultural / auxiliary
      'shed', 'barn', 'farm_auxiliary', 'greenhouse',
      -- Infrastructure
      'transformer_tower', 'water_tower', 'bunker',
      'bridge', 'toilets', 'ruins',
      'roof', 'container', 'construction'
    ) THEN false

    -- Tier 3: Footprint area heuristic
    -- Very small buildings (< 30 m²) are typically auxiliary
    WHEN footprint_area_sqm IS NOT NULL AND footprint_area_sqm < 30 THEN false

    -- Default: assume residential (conservative)
    ELSE true
  END
  WHERE is_residential IS NULL
    AND area_id IS NOT NULL
    AND id IN (
      SELECT id FROM buildings
      WHERE is_residential IS NULL AND area_id IS NOT NULL
      LIMIT p_limit
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. Reclassify buildings with newly-denied types
-- ============================================================
-- Reset is_residential for buildings with the newly-added types
-- so compute_is_residential_batch can reclassify them
UPDATE buildings
SET is_residential = NULL
WHERE is_residential = true
  AND ryhti_main_purpose IS NULL
  AND building_type IN (
    'supermarket', 'shop', 'market', 'bakery', 'pharmacy',
    'bank', 'post_office', 'restaurant', 'cafe',
    'mosque', 'synagogue', 'temple',
    'college', 'police', 'library', 'museum',
    'stadium', 'swimming_pool', 'parking'
  );

-- Now reclassify them (they'll hit Tier 2 and get false)
SELECT compute_is_residential_batch(100000);

-- ============================================================
-- 3. Reset price estimations on newly non-residential buildings
-- ============================================================
UPDATE buildings
SET estimation_year = NULL,
    estimated_price_per_sqm = NULL
WHERE is_residential = false
  AND estimated_price_per_sqm IS NOT NULL;
