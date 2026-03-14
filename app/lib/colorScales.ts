export const PRICE_BREAKS = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 7000]

export const PRICE_COLORS = [
  '#a8e8d0', // < 1000  (pale mint — cheapest)
  '#b0e4c0', // 1000-1500 (soft mint-green)
  '#c8e4a8', // 1500-2000 (mint-lime)
  '#dce498', // 2000-2500 (lime-gold)
  '#ecdca0', // 2500-3000 (warm gold)
  '#f0cca0', // 3000-4000 (peach-gold)
  '#f0b8b0', // 4000-5000 (soft peach-rose)
  '#eca8c0', // 5000-7000 (rose)
  '#e898c4', // 7000-10000 (candy rose)
  '#e088c0', // > 10000  (deep rose-pink — most expensive)
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
 * Building palette — lighter fills that pop via outline contrast.
 * Same mint→pink hue range as Voronoi, slightly more saturated.
 * Index 0 = below PRICE_BREAKS[0], last = above max break.
 */
export const BUILDING_PRICE_COLORS = [
  '#90e8c8',   // < 1000  — light mint
  '#a0e0b8',   // 1000-1500 — soft green-mint
  '#b8e098',   // 1500-2000 — light lime
  '#d0dc88',   // 2000-2500 — lime-gold
  '#e4d498',   // 2500-3000 — warm gold
  '#ecc098',   // 3000-4000 — peach-gold
  '#ecaaa8',   // 4000-5000 — soft rose
  '#e498b8',   // 5000-7000 — rose
  '#dc88b8',   // 7000-10000 — rose-pink
  '#d078b0',   // > 10000  — deep rose-pink
]

/** Darker versions of BUILDING_PRICE_COLORS for outlines — same hue, more contrast. */
export const BUILDING_OUTLINE_COLORS = [
  '#48a880',   // < 1000
  '#58a070',   // 1000-1500
  '#70a050',   // 1500-2000
  '#889838',   // 2000-2500
  '#a09050',   // 2500-3000
  '#a87850',   // 3000-4000
  '#a86060',   // 4000-5000
  '#a05070',   // 5000-7000
  '#984878',   // 7000-10000
  '#883870',   // > 10000
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
