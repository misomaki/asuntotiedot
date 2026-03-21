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

/** Finnish labels for OSM building_type values (residential + non-residential). */
const BUILDING_TYPE_LABELS: Record<string, string> = {
  // Residential
  apartments: 'Kerrostalo',
  residential: 'Asuinrakennus',
  house: 'Omakotitalo',
  detached: 'Omakotitalo',
  semidetached_house: 'Paritalo',
  terrace: 'Rivitalo',
  yes: 'Rakennus',
  // Non-residential
  supermarket: 'Supermarket',
  school: 'Koulu',
  church: 'Kirkko',
  hospital: 'Sairaala',
  office: 'Toimistorakennus',
  industrial: 'Teollisuusrakennus',
  warehouse: 'Varasto',
  shed: 'Varasto',
  hotel: 'Hotelli',
  retail: 'Liikerakennus',
  commercial: 'Liikerakennus',
  university: 'Yliopisto',
  kindergarten: 'Päiväkoti',
  garage: 'Autotalli',
  civic: 'Julkinen rakennus',
  public: 'Julkinen rakennus',
  train_station: 'Rautatieasema',
  fire_station: 'Paloasema',
  library: 'Kirjasto',
  sports_hall: 'Liikuntahalli',
  stadium: 'Stadion',
  parking: 'Pysäköintitalo',
}

export function getBuildingTypeLabel(type: string): string {
  return BUILDING_TYPE_LABELS[type] ?? type
}
