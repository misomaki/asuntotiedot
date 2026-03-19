/**
 * Configuration for data import scripts.
 * Re-exports shared city config and adds script-specific constants.
 */

// Cities, prefixes, and postal check are defined in the shared module
export { CITIES, ALL_POSTAL_PREFIXES, isTargetPostalCode } from '../../app/lib/cities'
export type { CityConfig } from '../../app/lib/cities'

/** StatFin PxWeb API base URL */
export const PXWEB_BASE_URL =
  'https://pxdata.stat.fi/PXWeb/api/v1/fi/StatFin/ashi/statfin_ashi_pxt_13mu.px'

/** Paavo WFS base URL */
export const PAAVO_WFS_URL =
  'https://geo.stat.fi/geoserver/postialue/ows'
