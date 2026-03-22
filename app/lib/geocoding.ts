/**
 * Address geocoding using OpenStreetMap Nominatim.
 * Free, no API key required. Rate limit: 1 req/sec.
 * https://nominatim.org/release-docs/develop/api/Search/
 */

export interface GeocodingResult {
  /** Display name (e.g. "Mannerheimintie 1, Helsinki") */
  label: string
  /** Short name for display (street + number + city) */
  shortLabel: string
  longitude: number
  latitude: number
  /** Result type: 'address' | 'place' | 'poi' */
  type: string
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

/**
 * Search for Finnish addresses via Nominatim.
 * Returns up to `limit` results. Abortable via AbortSignal.
 */
export async function searchAddresses(
  query: string,
  signal?: AbortSignal,
  limit = 5
): Promise<GeocodingResult[]> {
  if (!query || query.trim().length < 3) return []

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    countrycodes: 'fi',
    limit: String(limit),
    addressdetails: '1',
    'accept-language': 'fi',
  })

  const response = await fetch(`${NOMINATIM_URL}?${params}`, {
    signal,
    headers: {
      // Nominatim requires a valid User-Agent
      'User-Agent': 'Neliot-Asuntokartta/1.0',
    },
  })

  if (!response.ok) return []

  const data = await response.json() as NominatimResult[]

  return data.map((item) => {
    const addr = item.address
    const parts: string[] = []

    // Build short label: road + house_number, city
    if (addr?.road) {
      parts.push(addr.house_number ? `${addr.road} ${addr.house_number}` : addr.road)
    } else if (addr?.neighbourhood) {
      parts.push(addr.neighbourhood)
    } else if (addr?.suburb) {
      parts.push(addr.suburb)
    }

    const city = addr?.city || addr?.town || addr?.municipality || addr?.village
    if (city) parts.push(city)

    return {
      label: item.display_name,
      shortLabel: parts.length > 0 ? parts.join(', ') : item.display_name.split(',').slice(0, 2).join(','),
      longitude: parseFloat(item.lon),
      latitude: parseFloat(item.lat),
      type: categorizeType(item.type, item.class),
    }
  })
}

function categorizeType(type: string, cls: string): string {
  if (cls === 'place' || cls === 'boundary') return 'place'
  if (cls === 'building' || type === 'house' || type === 'residential') return 'address'
  if (cls === 'highway') return 'address'
  return 'place'
}

/** Raw Nominatim response shape */
interface NominatimResult {
  display_name: string
  lat: string
  lon: string
  type: string
  class: string
  address?: {
    road?: string
    house_number?: string
    neighbourhood?: string
    suburb?: string
    city?: string
    town?: string
    municipality?: string
    village?: string
    postcode?: string
    country?: string
  }
}
