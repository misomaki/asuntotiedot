/**
 * Deterministic hold-out split for Etuovi listings.
 *
 * 20 % of listings (hash % 5 === 0) are reserved for validation and must
 * never be used when computing neighborhood factors, bias constants or the
 * S-curve. The split is a pure function of the listing identity so it is
 * stable across re-imports and needs no schema change.
 *
 * Used by:
 *   scripts/data-import/09-compute-neighborhood-factors.ts  (excludes hold-out)
 *   scripts/validation/calibrate-scurve.ts                   (excludes hold-out)
 *   scripts/validation/validate-holdout.ts                   (includes ONLY hold-out)
 */

export const HOLDOUT_MODULUS = 5

/** FNV-1a 32-bit hash — small, dependency-free, stable across runtimes. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

function normalize(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Identity key for a listing: address + city + property type. */
export function listingKey(
  address: string | null | undefined,
  city: string | null | undefined,
  propertyType: string | null | undefined
): string {
  return `${normalize(address)}|${normalize(city)}|${normalize(propertyType)}`
}

/** True when the listing belongs to the 20 % validation split. */
export function isHoldout(
  address: string | null | undefined,
  city: string | null | undefined,
  propertyType: string | null | undefined
): boolean {
  return fnv1a(listingKey(address, city, propertyType)) % HOLDOUT_MODULUS === 0
}
