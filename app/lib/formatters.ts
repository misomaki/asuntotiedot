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

/**
 * Finnish labels for OSM building_type values.
 *
 * Non-residential types MUST be a superset of NON_RESIDENTIAL_BUILDING_TYPES
 * from buildingClassification.ts. When adding a new non-residential type to
 * the denylist, add a Finnish label here too.
 */
const BUILDING_TYPE_LABELS: Record<string, string> = {
  // Residential
  apartments: 'Kerrostalo',
  residential: 'Asuinrakennus',
  house: 'Omakotitalo',
  detached: 'Omakotitalo',
  semidetached_house: 'Paritalo',
  terrace: 'Rivitalo',
  yes: 'Rakennus',
  // Non-residential (keep in sync with NON_RESIDENTIAL_BUILDING_TYPES)
  office: 'Toimistorakennus',
  hotel: 'Hotelli',
  civic: 'Julkinen rakennus',
  commercial: 'Liikerakennus',
  retail: 'Liikerakennus',
  supermarket: 'Supermarket',
  shop: 'Kauppa',
  kiosk: 'Kioski',
  market: 'Tori',
  bakery: 'Leipomo',
  pharmacy: 'Apteekki',
  bank: 'Pankki',
  post_office: 'Posti',
  restaurant: 'Ravintola',
  cafe: 'Kahvila',
  industrial: 'Teollisuusrakennus',
  warehouse: 'Varasto',
  manufacture: 'Tehdas',
  service: 'Huoltorakennus',
  storage_tank: 'Säiliö',
  silo: 'Siilo',
  hangar: 'Lentokonehalli',
  church: 'Kirkko',
  chapel: 'Kappeli',
  mosque: 'Moskeija',
  synagogue: 'Synagoga',
  temple: 'Temppeli',
  hospital: 'Sairaala',
  school: 'Koulu',
  university: 'Yliopisto',
  kindergarten: 'Päiväkoti',
  college: 'Oppilaitos',
  public: 'Julkinen rakennus',
  government: 'Virastorakennus',
  transportation: 'Liikennerakennus',
  train_station: 'Rautatieasema',
  fire_station: 'Paloasema',
  police: 'Poliisiasema',
  library: 'Kirjasto',
  museum: 'Museo',
  sports_hall: 'Liikuntahalli',
  sports_centre: 'Urheilukeskus',
  grandstand: 'Katsomo',
  pavilion: 'Paviljonki',
  stadium: 'Stadion',
  swimming_pool: 'Uimahalli',
  garage: 'Autotalli',
  garages: 'Autotalli',
  carport: 'Autokatos',
  parking: 'Pysäköintitalo',
  shed: 'Varasto',
  barn: 'Lato',
  farm_auxiliary: 'Maatalousrakennus',
  greenhouse: 'Kasvihuone',
  transformer_tower: 'Muuntamo',
  water_tower: 'Vesitorni',
  bunker: 'Bunkkeri',
}

export function getBuildingTypeLabel(type: string): string {
  return BUILDING_TYPE_LABELS[type] ?? type
}
