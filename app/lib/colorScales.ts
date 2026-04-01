import { formatNumber } from './formatters'

/** Dusty pastel palette for demographic/socioeconomic charts.
 *  Harmonizes with warm paper background #FFFBF5. */
export const CHART_COLORS = {
  sage:   '#8cc8b8',  // dusty sage — positive/high (income, education, new buildings)
  sand:   '#e8d098',  // warm sand — neutral/medium
  rose:   '#d4a0b8',  // dusty rose — low/negative
  violet: '#b898c0',  // muted lavender — oldest/weakest
  stone:  '#c8c0b4',  // warm grey — neutral/other
} as const

// 12 breakpoints → 13 color bands. Denser steps in the 2000–5000 critical range
// where most residential buildings cluster.
export const PRICE_BREAKS = [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 6000, 7500, 10000]

// Voronoi palette — warm spectrum, slightly muted for terrain wash (opacity 0.7).
// Hue shifts: ivory → gold → amber → terracotta → rose → plum.
// NO greens or blues — basemap owns cool tones.
export const PRICE_COLORS = [
  '#f2efe8', // < 1000   — warm ivory
  '#ede8d0', // 1000–1500 — cream
  '#e5ddb0', // 1500–2000 — pale gold
  '#dcd098', // 2000–2500 — warm gold
  '#d2c080', // 2500–3000 — amber-gold
  '#ccb070', // 3000–3500 — clear amber
  '#c8a068', // 3500–4000 — deep amber
  '#c49070', // 4000–4500 — amber-terracotta
  '#c08078', // 4500–5000 — terracotta
  '#b87088', // 5000–6000 — dusty rose
  '#ac5890', // 6000–7500 — rose-plum
  '#a04898', // 7500–10000 — plum
  '#9040a0', // > 10000  — deep plum
]

export const PRICE_LABELS = [
  '< 1 000',
  '1 000\u20131 500',
  '1 500\u20132 000',
  '2 000\u20132 500',
  '2 500\u20133 000',
  '3 000\u20133 500',
  '3 500\u20134 000',
  '4 000\u20134 500',
  '4 500\u20135 000',
  '5 000\u20136 000',
  '6 000\u20137 500',
  '7 500\u201310 000',
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
 * Building palette — deeper and crisper than Voronoi for definition at zoom ≥14.
 * Same hue progression (ivory→gold→amber→terracotta→rose→plum), one step more saturated.
 * Index 0 = below PRICE_BREAKS[0], last = above max break.
 */
export const BUILDING_PRICE_COLORS = [
  '#eceae4', // < 1000   — warm off-white
  '#e6e0c4', // 1000–1500 — cream
  '#ddd4a0', // 1500–2000 — clear sand-gold
  '#d4c484', // 2000–2500 — warm gold
  '#c8b46c', // 2500–3000 — amber-gold
  '#c0a460', // 3000–3500 — clear amber
  '#b89458', // 3500–4000 — deep amber
  '#b48464', // 4000–4500 — amber-terracotta
  '#b0746c', // 4500–5000 — terracotta
  '#a8607c', // 5000–6000 — dusty rose
  '#9c4888', // 6000–7500 — rose-plum
  '#903c90', // 7500–10000 — plum
  '#843498', // > 10000  — deep plum
]

/** Building outlines — darker version of fill, same hue per price band. Never black. */
export const BUILDING_OUTLINE_COLORS = [
  '#a8a69e', // < 1000
  '#9c9878', // 1000–1500
  '#948860', // 1500–2000
  '#8c7c50', // 2000–2500
  '#847044', // 2500–3000
  '#7c643c', // 3000–3500
  '#745838', // 3500–4000
  '#705040', // 4000–4500
  '#6c4848', // 4500–5000
  '#683c54', // 5000–6000
  '#603060', // 6000–7500
  '#582868', // 7500–10000
  '#502470', // > 10000
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
  expr.push(12000, PRICE_COLORS[PRICE_COLORS.length - 1])
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
  // Round to even numbers for clean legend labels
  const roundTo = (n: number, s: number) => Math.round(n / s) * s
  const range = maxPrice - minPrice
  const step = range > 3000 ? 1000 : range > 1500 ? 500 : 200

  const min = roundTo(minPrice, step)
  const max = roundTo(maxPrice, step)
  const span = max - min || step

  // 10 breaks = 11 color bands, sampled from the 13-color PRICE_COLORS palette
  const numBreaks = 10
  const breaks: number[] = []
  for (let i = 1; i <= numBreaks; i++) {
    breaks.push(roundTo(min + (span * i) / (numBreaks + 1), step))
  }

  // Sample colors from the full palette (0–12) for clear visual range
  const maxPaletteIdx = PRICE_COLORS.length - 1
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

/**
 * Generate hybrid quantile+linear breaks from actual price values.
 *
 * Lower half: quantile breaks (equal-count bins) to spread out
 * the many low-price municipalities.
 * Upper half: finer linear breaks so the high-price range (where most
 * residential buildings cluster) gets more color distinction.
 */
export function getQuantileScale(sortedValues: number[]): {
  breaks: number[]
  colors: string[]
  labels: string[]
} | null {
  if (sortedValues.length < 2) return null

  // Split: 4 quantile breaks for the lower half, 6 linear breaks for the upper half
  const quantileCount = 4
  const linearCount = 6
  // --- Lower half: quantile breaks ---
  const medianIdx = Math.floor(sortedValues.length / 2)
  const medianValue = sortedValues[medianIdx]
  const rawBreaks: number[] = []

  for (let i = 1; i <= quantileCount; i++) {
    const idx = Math.floor((i / (quantileCount + 1)) * medianIdx)
    const raw = sortedValues[Math.min(idx, sortedValues.length - 1)]
    rawBreaks.push(raw)
  }

  // --- Upper half: linear breaks from median to max ---
  const maxValue = sortedValues[sortedValues.length - 1]
  const upperSpan = maxValue - medianValue
  for (let i = 1; i <= linearCount; i++) {
    rawBreaks.push(medianValue + (upperSpan * i) / (linearCount + 1))
  }

  // Round to even numbers for clean legend labels and deduplicate
  const breaks: number[] = []
  for (const raw of rawBreaks) {
    const step = raw > 5000 ? 1000 : raw > 2000 ? 500 : 200
    const rounded = Math.round(raw / step) * step
    if (breaks.length === 0 || rounded > breaks[breaks.length - 1]) {
      breaks.push(rounded)
    }
  }

  // If we lost too many breaks to deduplication, fall back to linear
  if (breaks.length < 4) return null

  // Build labels that show actual data extremes in first/last band
  const fmt = formatNumber
  const actualMin = Math.round(sortedValues[0])
  const actualMax = Math.round(sortedValues[sortedValues.length - 1])
  const labels: string[] = [
    `${fmt(actualMin)}\u2013${fmt(breaks[0])}`,
    ...breaks.slice(0, -1).map((b, i) => `${fmt(b)}\u2013${fmt(breaks[i + 1])}`),
    `${fmt(breaks[breaks.length - 1])}\u2013${fmt(actualMax)}`,
  ]

  // Sample colors from the FULL palette (0–12) for maximum contrast
  const colors: string[] = []
  const maxIdx = PRICE_COLORS.length - 1
  const numBands = breaks.length + 1
  for (let i = 0; i < numBands; i++) {
    const idx = Math.round((i / (numBands - 1)) * maxIdx)
    colors.push(PRICE_COLORS[idx])
  }

  return { breaks, colors, labels }
}

/** Neutral fill for municipalities without price data */
const NO_DATA_COLOR = '#e8e6e3'

/** Build a MapLibre step expression from dynamic breaks + colors.
 *  Uses discrete color bands (step) for clear visual distinction.
 *  Municipalities with null price get a neutral fill. */
export function getDynamicColorExpression(
  breaks: number[],
  colors: string[],
): unknown[] {
  // Step expression: discrete bands (no blending between colors)
  const stepExpr: unknown[] = [
    'step',
    ['get', 'price_per_sqm_avg'],
    colors[0], // default (below first break)
  ]
  for (let i = 0; i < breaks.length; i++) {
    stepExpr.push(breaks[i], colors[Math.min(i + 1, colors.length - 1)])
  }

  // Wrap: null/0 → neutral, otherwise → stepped color
  return [
    'case',
    ['==', ['get', 'price_per_sqm_avg'], null], NO_DATA_COLOR,
    ['==', ['get', 'price_per_sqm_avg'], 0], NO_DATA_COLOR,
    stepExpr,
  ]
}
