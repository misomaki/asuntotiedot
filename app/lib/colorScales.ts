import { formatNumber } from './formatters'

export const PRICE_BREAKS = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 7000]

// Warm spectrum: ivory → sand → amber → dusty rose → brand pink
// Entirely warm tones — never overlaps with cool basemap (grey roads, blue water, green parks)
export const PRICE_COLORS = [
  '#f2efe8', // < 1000  — warm ivory
  '#efe6d4', // 1000–1500 — light cream
  '#ecdcc0', // 1500–2000 — pale sand
  '#e8d0ac', // 2000–2500 — warm sand
  '#e4c49c', // 2500–3000 — soft amber
  '#e0b498', // 3000–4000 — amber-peach
  '#dca4a0', // 4000–5000 — dusty rose
  '#dc98b8', // 5000–7000 — rose
  '#e488cc', // 7000–10000 — soft pink
  '#f080e0', // > 10000  — brand pink
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
 * Same ivory→amber→pink gradient, one step more saturated.
 * Index 0 = below PRICE_BREAKS[0], last = above max break.
 */
export const BUILDING_PRICE_COLORS = [
  '#eceae4', // < 1000  — warm off-white
  '#eadec8', // 1000–1500 — cream
  '#e6d4b4', // 1500–2000 — pale sand
  '#e2c8a0', // 2000–2500 — warm sand
  '#debb90', // 2500–3000 — soft amber
  '#daac8c', // 3000–4000 — amber-peach
  '#d69c98', // 4000–5000 — dusty rose
  '#d690b0', // 5000–7000 — rose
  '#de80c4', // 7000–10000 — soft pink
  '#ea78d8', // > 10000  — brand pink
]

/** Darker warm tones for building outlines. */
export const BUILDING_OUTLINE_COLORS = [
  '#a8a69e', // < 1000
  '#a09878', // 1000–1500
  '#988c68', // 1500–2000
  '#908060', // 2000–2500
  '#887458', // 2500–3000
  '#886850', // 3000–4000
  '#885858', // 4000–5000
  '#884c70', // 5000–7000
  '#984088', // 7000–10000
  '#a83898', // > 10000
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

  // Sample 7 colors evenly from the 10-color palette
  const numColors = numBreaks + 1
  const colors: string[] = []
  for (let i = 0; i < numColors; i++) {
    const idx = Math.round((i / (numColors - 1)) * (PRICE_COLORS.length - 1))
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
