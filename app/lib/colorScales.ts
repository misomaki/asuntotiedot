export const PRICE_BREAKS = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 7000]

export const PRICE_COLORS = [
  '#b8d8c8', // < 1000  (pale sage — cheapest)
  '#c8daba', // 1000-1500 (soft green)
  '#dce0a8', // 1500-2000 (hay)
  '#e8daa0', // 2000-2500 (warm sand)
  '#e4cca0', // 2500-3000 (wheat)
  '#e0bca8', // 3000-4000 (soft clay)
  '#dca8b0', // 4000-5000 (dusty rose)
  '#d498b0', // 5000-7000 (muted rose)
  '#c888a8', // 7000-10000 (antique mauve)
  '#b478a0', // > 10000  (deep mauve — most expensive)
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
  '> 7 000',
]

export function getColorForPrice(price: number | null): string {
  if (price === null || price === 0) return '#dcd8d4'
  for (let i = 0; i < PRICE_BREAKS.length; i++) {
    if (price < PRICE_BREAKS[i]) return PRICE_COLORS[i]
  }
  return PRICE_COLORS[PRICE_COLORS.length - 1]
}

/**
 * Building palette — same sage→plum hue range as Voronoi but deeper/crisper.
 * Index 0 = below PRICE_BREAKS[0], last = above max break.
 */
export const BUILDING_PRICE_COLORS = [
  '#88c4a4',   // < 1000  — sage (cheapest)
  '#a0c890',   // 1000-1500 — green tea
  '#c0c880',   // 1500-2000 — olive hay
  '#d0c080',   // 2000-2500 — warm ochre
  '#ccb088',   // 2500-3000 — clay
  '#c89898',   // 3000-4000 — terracotta rose
  '#c08498',   // 4000-5000 — rose
  '#b47498',   // 5000-7000 — berry
  '#a06898',   // > 7000   — plum (most expensive)
]

export function getMapLibreColorExpression(): unknown[] {
  const expr: unknown[] = [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'price_per_sqm_avg'], 0],
  ]
  expr.push(0, '#dcd8d4')
  for (let i = 0; i < PRICE_BREAKS.length; i++) {
    expr.push(PRICE_BREAKS[i], PRICE_COLORS[i])
  }
  expr.push(10000, PRICE_COLORS[PRICE_COLORS.length - 1])
  return expr
}
