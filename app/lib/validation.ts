/**
 * Input validation and sanitization utilities for API routes.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Validate that a string is a valid UUID v4 format */
export function isValidUUID(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value)
}

/** Strip HTML tags from a string to prevent stored XSS */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '')
}

/** Sanitize a user-provided note: strip HTML, trim, enforce max length */
export function sanitizeNote(note: unknown, maxLength: number): string | null {
  if (note == null || typeof note !== 'string') return null
  const cleaned = stripHtml(note).trim()
  if (cleaned.length === 0) return null
  return cleaned.slice(0, maxLength)
}

/** Validate a positive numeric value */
export function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/** Validate a non-negative numeric value */
export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
