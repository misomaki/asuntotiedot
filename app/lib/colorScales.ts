export const PRICE_BREAKS = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 7000]

export const PRICE_COLORS = [
  '#1a237e', // < 1000
  '#1565c0', // 1000-1500
  '#42a5f5', // 1500-2000
  '#66bb6a', // 2000-2500
  '#ffee58', // 2500-3000
  '#ffa726', // 3000-4000
  '#ef5350', // 4000-5000
  '#b71c1c', // 5000-7000
  '#4a0072', // > 7000
]

export const PRICE_LABELS = [
  '< 1 000',
  '1 000–1 500',
  '1 500–2 000',
  '2 000–2 500',
  '2 500–3 000',
  '3 000–4 000',
  '4 000–5 000',
  '5 000–7 000',
  '> 7 000',
]

export function getColorForPrice(price: number | null): string {
  if (price === null || price === 0) return '#374151'
  for (let i = 0; i < PRICE_BREAKS.length; i++) {
    if (price < PRICE_BREAKS[i]) return PRICE_COLORS[i]
  }
  return PRICE_COLORS[PRICE_COLORS.length - 1]
}

export function getMapLibreColorExpression(): unknown[] {
  const expr: unknown[] = [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'price_per_sqm_avg'], 0],
  ]
  expr.push(0, '#374151')
  for (let i = 0; i < PRICE_BREAKS.length; i++) {
    expr.push(PRICE_BREAKS[i], PRICE_COLORS[i])
  }
  expr.push(10000, PRICE_COLORS[PRICE_COLORS.length - 1])
  return expr
}
