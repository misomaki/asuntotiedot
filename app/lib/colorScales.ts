export const PRICE_BREAKS = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 7000]

export const PRICE_COLORS = [
  '#b84080', // < 1000  (deep pink)
  '#d4508c', // 1000-1500
  '#ff6b9d', // 1500-2000
  '#ff90b8', // 2000-2500 (medium pink)
  '#ffb0c8', // 2500-3000
  '#ffd4a8', // 3000-4000 (peach transition)
  '#ffe08a', // 4000-5000 (warm yellow)
  '#e8f060', // 5000-7000 (yellow-green)
  '#a8e8a0', // 7000-10000 (light mint)
  '#60d4a0', // > 10000  (mint)
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
  if (price === null || price === 0) return '#e0e0e0'
  for (let i = 0; i < PRICE_BREAKS.length; i++) {
    if (price < PRICE_BREAKS[i]) return PRICE_COLORS[i]
  }
  return PRICE_COLORS[PRICE_COLORS.length - 1]
}

/**
 * Warm-shifted building palette — contrasts against the Voronoi cool teals.
 * Uses emerald→green→lime→yellow→orange instead of matching Voronoi teal tones.
 * Index 0 = below PRICE_BREAKS[0], last = above max break.
 */
export const BUILDING_PRICE_COLORS = [
  '#6366f1',   // < 1000  — indigo-500
  '#818cf8',   // 1000-1500 — indigo-400
  '#34d399',   // 1500-2000 — emerald-400
  '#4ade80',   // 2000-2500 — green-400
  '#a3e635',   // 2500-3000 — lime-400
  '#facc15',   // 3000-4000 — yellow-400
  '#fb923c',   // 4000-5000 — orange-400
  '#f97316',   // 5000-7000 — orange-500
  '#ea580c',   // > 7000   — orange-600
]

export function getMapLibreColorExpression(): unknown[] {
  const expr: unknown[] = [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'price_per_sqm_avg'], 0],
  ]
  expr.push(0, '#e0e0e0')
  for (let i = 0; i < PRICE_BREAKS.length; i++) {
    expr.push(PRICE_BREAKS[i], PRICE_COLORS[i])
  }
  expr.push(10000, PRICE_COLORS[PRICE_COLORS.length - 1])
  return expr
}
