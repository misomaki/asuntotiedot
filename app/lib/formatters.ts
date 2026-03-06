const fiFormatter = new Intl.NumberFormat('fi-FI')
const fiCurrencyFormatter = new Intl.NumberFormat('fi-FI', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

export function formatNumber(value: number): string {
  return fiFormatter.format(value)
}

export function formatPrice(value: number): string {
  return fiCurrencyFormatter.format(value)
}

export function formatPricePerSqm(value: number | null): string {
  if (value === null) return 'Ei tietoa'
  return `${fiFormatter.format(Math.round(value))} €/m²`
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)} %`
}

export function formatChange(current: number, previous: number): string {
  const change = ((current - previous) / previous) * 100
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(1)} %`
}

export function getPropertyTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    kerrostalo: 'Kerrostalo',
    rivitalo: 'Rivitalo',
    omakotitalo: 'Omakotitalo',
  }
  return labels[type] ?? type
}
