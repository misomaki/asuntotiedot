-- ============================================================
-- Migration 018: Fix non-residential building classification
-- ============================================================
-- Problem: Several commercial building types (supermarket, shop,
-- library, stadium, parking, etc.) were missing from the OSM
-- building_type denylist. Additionally, Ryhti proximity matching
-- can misclassify commercial buildings as residential when a
-- nearby residential Ryhti point is within 50m.
--
-- Fix: OSM denylist now takes PRIORITY over Ryhti for explicit
-- commercial/public types. This prevents Ryhti mismatch from
-- overriding a clear OSM supermarket/school/church tag.
--
-- Steps:
-- 0. Ensure all required columns exist (idempotent)
-- 1. Update compute_is_residential_batch() — denylist BEFORE Ryhti
-- 2. Reclassify ALL buildings with denied types (including Ryhti-matched)
-- 3. Reset their price estimations
-- ============================================================

-- ============================================================
-- 0. Ensure all required columns exist (idempotent)
-- ============================================================
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS ryhti_main_purpose TEXT;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS is_residential BOOLEAN;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS energy_class TEXT;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS apartment_count INT;

CREATE INDEX IF NOT EXISTS idx_buildings_is_residential
  ON buildings (is_residential) WHERE is_residential = true;
CREATE INDEX IF NOT EXISTS idx_buildings_ryhti_main_purpose
  ON buildings (ryhti_main_purpose) WHERE ryhti_main_purpose IS NOT NULL;

-- ============================================================
-- 1. Replace compute_is_residential_batch
--    NEW ORDER: OSM denylist FIRST, then Ryhti, then heuristic
-- ============================================================
CREATE OR REPLACE FUNCTION compute_is_residential_batch(p_limit INT DEFAULT 5000)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE buildings
  SET is_residential = CASE
    -- Tier 1 (NEW): OSM building_type denylist — highest priority
    -- These tags are explicit and reliable. Ryhti proximity matching
    -- can mismatch in dense areas, but OSM "supermarket" is always a supermarket.
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

    -- Tier 2: Ryhti main_purpose (for buildings without explicit OSM type)
    -- 01xx = asuinrakennukset (residential buildings)
    WHEN ryhti_main_purpose IS NOT NULL AND ryhti_main_purpose LIKE '01%' THEN true
    WHEN ryhti_main_purpose IS NOT NULL AND ryhti_main_purpose NOT LIKE '01%' THEN false

    -- Tier 3: Footprint area heuristic
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
-- 2. Reclassify ALL buildings with denied types
--    (regardless of ryhti_main_purpose — that was the bug)
-- ============================================================
UPDATE buildings
SET is_residential = NULL
WHERE is_residential = true
  AND building_type IN (
    'office', 'hotel', 'civic', 'commercial', 'retail',
    'supermarket', 'shop', 'kiosk', 'market', 'bakery',
    'pharmacy', 'bank', 'post_office', 'restaurant', 'cafe',
    'industrial', 'warehouse', 'manufacture', 'service',
    'storage_tank', 'silo', 'hangar',
    'church', 'chapel', 'mosque', 'synagogue', 'temple',
    'hospital', 'school', 'university', 'kindergarten', 'college',
    'public', 'government', 'transportation', 'train_station',
    'fire_station', 'police', 'library', 'museum',
    'sports_hall', 'sports_centre', 'grandstand', 'pavilion',
    'stadium', 'swimming_pool',
    'garage', 'garages', 'carport', 'parking',
    'shed', 'barn', 'farm_auxiliary', 'greenhouse',
    'transformer_tower', 'water_tower', 'bunker',
    'bridge', 'toilets', 'ruins',
    'roof', 'container', 'construction'
  );

-- Reclassify — they'll all hit the new Tier 1 denylist and get false
SELECT compute_is_residential_batch(500000);

-- ============================================================
-- 3. Reset price estimations on all non-residential buildings
-- ============================================================
UPDATE buildings
SET estimation_year = NULL,
    estimated_price_per_sqm = NULL
WHERE is_residential = false
  AND estimated_price_per_sqm IS NOT NULL;
