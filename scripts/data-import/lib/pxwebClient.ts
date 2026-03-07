/**
 * Helper to query the Statistics Finland PxWeb API.
 *
 * The PxWeb API requires POST requests with a JSON query body.
 * Rate limit: 30 requests per 10 seconds.
 * Cell limit: 100,000 per request.
 */

export interface PxWebQuery {
  query: Array<{
    code: string
    selection: {
      filter: 'item' | 'top' | 'all'
      values: string[]
    }
  }>
  response: {
    format: 'json-stat2' | 'json' | 'csv'
  }
}

export interface JsonStat2Response {
  version: string
  class: string
  label: string
  source: string
  updated: string
  id: string[]
  size: number[]
  dimension: Record<
    string,
    {
      label: string
      category: {
        index: Record<string, number>
        label: Record<string, string>
      }
    }
  >
  value: (number | null)[]
}

/**
 * Execute a PxWeb query and return the response.
 */
export async function queryPxWeb(
  url: string,
  query: PxWebQuery
): Promise<JsonStat2Response> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`PxWeb API error ${response.status}: ${text}`)
  }

  return response.json()
}

/**
 * Parse a json-stat2 response into flat rows.
 * Returns an array of objects with dimension labels + value.
 */
export function parseJsonStat2(
  data: JsonStat2Response
): Array<Record<string, string | number | null>> {
  const dimensions = data.id
  const sizes = data.size
  const rows: Array<Record<string, string | number | null>> = []

  const totalCells = data.value.length

  for (let i = 0; i < totalCells; i++) {
    const row: Record<string, string | number | null> = {}
    let remainder = i

    for (let d = dimensions.length - 1; d >= 0; d--) {
      const dimName = dimensions[d]
      const dimSize = sizes[d]
      const dimIndex = remainder % dimSize
      remainder = Math.floor(remainder / dimSize)

      const dim = data.dimension[dimName]
      const keys = Object.keys(dim.category.index).sort(
        (a, b) => dim.category.index[a] - dim.category.index[b]
      )
      row[dimName] = keys[dimIndex]
      row[`${dimName}_label`] = dim.category.label[keys[dimIndex]]
    }

    row.value = data.value[i]
    rows.push(row)
  }

  return rows
}

/**
 * Sleep for a given number of milliseconds (for rate limiting).
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
