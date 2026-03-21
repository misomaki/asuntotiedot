import { formatNumber } from './formatters'

export const PRICE_BREAKS = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 7000]

// Warm spectrum: ivory → sand → amber → dusty rose → rose
// Max capped at rose (#dc98b8) — no bright pink. Matches municipality overview.
// Entirely warm tones — never overlaps with cool basemap (grey roads, blue water, green parks)
export const PRICE_COLORS = [
  '#f2efe8', // < 1000  — warm ivory
  '#efead8', // 1000–1500 — light cream
  '#ece2c4', // 1500–2000 — pale sand
  '#e8d8b0', // 2000–2500 — warm sand
  '#e4cca0', // 2500–3000 — soft amber
  '#e0c098', // 3000–4000 — amber
  '#dcb4a0', // 4000–5000 — amber-peach
  '#dca8a8', // 5000–7000 — dusty rose
  '#dca0b0', // 7000–10000 — rose-pink
  '#dc98b8', // > 10000  — rose (max)
]

export const PRICE_LABELS = [
  '< 1 000',
  '1 000\u20131 500',
  '1 500\u20132 000',
  '2 000\u20132 500',
  '2 500\u20133 000',
  '3 000\u20134 000',
  '4 000\u20135 000',
  '5 000\u20137 000',
  '7 000\u201310 000',
  '> 10 000',
]

export function getColorForPrice(price: number | null): string {
  if (price === null || price === 0) return '#d8d4d0'
  for (let i = 0; i < PRICE_BREAKS.length; i++) {
    if (price < PRICE_BREAKS[i]) return PRICE_COLORS[i]
  }
  return PRICE_COLORS[PRICE_COLORS.length - 1]
}

/**
 * Building palette — slightly deeper than Voronoi for definition.
 * Same ivory→amber→rose gradient, one step more saturated.
 * Index 0 = below PRICE_BREAKS[0], last = above max break.
 */
export const BUILDING_PRICE_COLORS = [
  '#eceae4', // < 1000  — warm off-white
  '#e8e0c8', // 1000–1500 — cream
  '#e4d6b4', // 1500–2000 — pale sand
  '#e0cca0', // 2000–2500 — warm sand
  '#dcc090', // 2500–3000 — soft amber
  '#d8b48c', // 3000–4000 — amber
  '#d4a894', // 4000–5000 — amber-peach
  '#d49c9c', // 5000–7000 — dusty rose
  '#d494a8', // 7000–10000 — rose-pink
  '#d490b0', // > 10000  — rose (max)
]

/** Darker warm tones for building outlines — matches rose-capped palette. */
export const BUILDING_OUTLINE_COLORS = [
  '#a8a69e', // < 1000
  '#a09878', // 1000–1500
  '#988c68', // 1500–2000
  '#908060', // 2000–2500
  '#887858', // 2500–3000
  '#887050', // 3000–4000
  '#886858', // 4000–5000
  '#886060', // 5000–7000
  '#885868', // 7000–10000
  '#885070', // > 10000
]

export function getMapLibreColorExpression(): unknown[] {
  const expr: unknown[] = [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'price_per_sqm_avg'], 0],
  ]
  expr.push(0, '#d8d4d0')
  for (let i = 0; i < PRICE_BREAKS.length; i++) {
    expr.push(PRICE_BREAKS[i], PRICE_COLORS[i])
  }
  expr.push(10000, PRICE_COLORS[PRICE_COLORS.length - 1])
  return expr
}

/**
 * Generate dynamic color breaks and labels from a price range.
 * Uses the same PRICE_COLORS palette but remaps breaks to fit the data.
 * Returns 6 evenly-spaced steps between min and max (rounded to clean numbers).
 */
export function getDynamicScale(minPrice: number, maxPrice: number): {
  breaks: number[]
  colors: string[]
  labels: string[]
} {
  // Round to nice numbers
  const roundTo = (n: number, step: number) => Math.round(n / step) * step
  const range = maxPrice - minPrice
  const step = range > 3000 ? 500 : range > 1500 ? 250 : 100

  const min = roundTo(minPrice, step)
  const max = roundTo(maxPrice, step)
  const span = max - min || step

  // 6 breaks = 7 color bands, sampled from the 10-color PRICE_COLORS palette
  const numBreaks = 6
  const breaks: number[] = []
  for (let i = 1; i <= numBreaks; i++) {
    breaks.push(roundTo(min + (span * i) / (numBreaks + 1), step))
  }

  // Sample 7 colors from the subdued end of the palette (indices 0–7).
  // Skip the bright pink end (8–9) — municipality overview should feel calm.
  const maxPaletteIdx = 7  // up to '#dc98b8' (rose), not bright pink
  const numColors = numBreaks + 1
  const colors: string[] = []
  for (let i = 0; i < numColors; i++) {
    const idx = Math.round((i / (numColors - 1)) * maxPaletteIdx)
    colors.push(PRICE_COLORS[idx])
  }

  // Labels
  const fmt = formatNumber
  const labels: string[] = [
    `< ${fmt(breaks[0])}`,
    ...breaks.slice(0, -1).map((b, i) => `${fmt(b)}\u2013${fmt(breaks[i + 1])}`),
    `> ${fmt(breaks[breaks.length - 1])}`,
  ]

  return { breaks, colors, labels }
}

/** Neutral fill for municipalities without price data */
const NO_DATA_COLOR = '#e8e6e3'

/** Build a MapLibre expression from dynamic breaks + colors.
 *  Municipalities with null price get a neutral fill. */
export function getDynamicColorExpression(
  breaks: number[],
  colors: string[],
): unknown[] {
  // Inner interpolation for priced municipalities
  const interpolate: unknown[] = [
    'interpolate',
    ['linear'],
    ['get', 'price_per_sqm_avg'],
  ]
  interpolate.push(breaks[0], colors[0])
  for (let i = 1; i < breaks.length; i++) {
    interpolate.push(breaks[i], colors[i])
  }
  interpolate.push(breaks[breaks.length - 1] + 1000, colors[colors.length - 1])

  // Wrap: null/0 → neutral, otherwise → interpolated color
  return [
    'case',
    ['==', ['get', 'price_per_sqm_avg'], null], NO_DATA_COLOR,
    ['==', ['get', 'price_per_sqm_avg'], 0], NO_DATA_COLOR,
    interpolate,
  ]
}
