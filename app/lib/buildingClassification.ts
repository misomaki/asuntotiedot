/**
 * Non-residential building type classification — SINGLE SOURCE OF TRUTH.
 *
 * This list defines which OSM building_type values are non-residential.
 * It is used by:
 *   - SQL migration 018 (compute_is_residential_batch) — MUST be manually synced
 *   - scripts/data-import/03-import-buildings.ts (import-time filter)
 *   - app/lib/formatters.ts (tooltip labels)
 *   - scripts/run-migration-018.ts (reclassification script)
 *
 * IMPORTANT: The SQL migration cannot import from TypeScript, so when this
 * list changes, migration 018's denylist MUST be updated manually to match.
 *
 * Classification priority (migration 018):
 *   Tier 1: OSM building_type denylist (THIS LIST) — highest priority
 *   Tier 2: Ryhti main_purpose ('01%' = residential)
 *   Tier 3: Footprint area heuristic (< 30 m² = auxiliary)
 *   Default: assume residential (conservative)
 *
 * Why denylist overrides Ryhti: Ryhti matching is proximity-based (50m radius).
 * In dense areas a supermarket centroid can match a nearby residential Ryhti
 * point. OSM building_type is explicit and reliable for these tagged types.
 */

/** All OSM building_type values classified as non-residential. */
export const NON_RESIDENTIAL_BUILDING_TYPES = [
  // Commercial / retail
  'office', 'hotel', 'civic', 'commercial', 'retail',
  'supermarket', 'shop', 'kiosk', 'market', 'bakery',
  'pharmacy', 'bank', 'post_office', 'restaurant', 'cafe',
  // Industrial / storage
  'industrial', 'warehouse', 'manufacture', 'service',
  'storage_tank', 'silo', 'hangar',
  // Religious
  'church', 'chapel', 'mosque', 'synagogue', 'temple',
  // Education / healthcare
  'hospital', 'school', 'university', 'kindergarten', 'college',
  // Public / government
  'public', 'government', 'transportation', 'train_station',
  'fire_station', 'police', 'library', 'museum',
  // Sports / leisure
  'sports_hall', 'sports_centre', 'grandstand', 'pavilion',
  'stadium', 'swimming_pool',
  // Parking / transport
  'garage', 'garages', 'carport', 'parking',
  // Agricultural / auxiliary
  'shed', 'barn', 'farm_auxiliary', 'greenhouse',
  // Infrastructure
  'transformer_tower', 'water_tower', 'bunker',
  'bridge', 'toilets', 'ruins',
  'roof', 'container', 'construction',
] as const

/** Set version for O(1) lookup. */
export const NON_RESIDENTIAL_BUILDING_TYPES_SET = new Set<string>(NON_RESIDENTIAL_BUILDING_TYPES)

/**
 * Additional types excluded at OSM import time (script 03) but not in the
 * database denylist because they're never imported. These are rare/niche
 * types that don't appear in Finnish OSM data frequently.
 */
export const IMPORT_ONLY_EXCLUDED_TYPES = [
  'collapsed', 'abandoned', 'cabin', 'cowshed', 'hut', 'stable', 'tank',
] as const
