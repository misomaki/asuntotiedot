import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { MapPin, ArrowRight, TrendingUp, TrendingDown, Building2, Home, Layers, Flame, Snowflake } from 'lucide-react'
import { getCityBySlug, CITY_SLUGS } from '@/app/lib/citySlugs'
import { getDataProvider } from '@/app/lib/dataProvider'
import { getSupabaseAdmin } from '@/app/lib/supabaseClient'
import { formatNumber } from '@/app/lib/formatters'
import { CityAISearch } from './CityAISearch'

export const revalidate = 86400 // ISR: revalidate every 24h

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CityAreaPrice {
  area_code: string
  name: string
  municipality: string
  kerrostalo: number | null
  rivitalo: number | null
  omakotitalo: number | null
}

interface AreaTrend {
  area_code: string
  name: string
  currentPrice: number
  previousPrice: number
  trendPct: number
  propertyType: string
}

interface PageProps {
  params: Promise<{ slug: string }>
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function getCityData(slug: string) {
  const city = getCityBySlug(slug)
  if (!city) return null

  const provider = getDataProvider()

  // Fetch all 3 property types in parallel — each GeoJSON only has a single `price` field
  const [ktGeo, rtGeo, oktGeo] = await Promise.all([
    provider.getAreasGeoJSON(2024, 'kerrostalo'),
    provider.getAreasGeoJSON(2024, 'rivitalo'),
    provider.getAreasGeoJSON(2024, 'omakotitalo'),
  ])

  // Build price maps by area_code for rivitalo and omakotitalo
  const rtPriceMap = new Map<string, number | null>()
  const oktPriceMap = new Map<string, number | null>()

  for (const f of (rtGeo?.features ?? [])) {
    const code = f.properties?.area_code as string
    if (code && !rtPriceMap.has(code)) {
      rtPriceMap.set(code, (f.properties?.price_per_sqm_avg as number | null) ?? null)
    }
  }
  for (const f of (oktGeo?.features ?? [])) {
    const code = f.properties?.area_code as string
    if (code && !oktPriceMap.has(code)) {
      oktPriceMap.set(code, (f.properties?.price_per_sqm_avg as number | null) ?? null)
    }
  }

  const features = ktGeo?.features ?? []
  const cityFeatures = features.filter(f => {
    const code = f.properties?.area_code as string
    return code && city.postalPrefixes.some(p => code.startsWith(p))
  })

  // Deduplicate by area_code (Voronoi GeoJSON has multiple cells per postal code)
  const seenCodes = new Set<string>()
  const areaPrices: CityAreaPrice[] = cityFeatures
    .map(f => {
      const props = f.properties as Record<string, unknown>
      const areaCode = props.area_code as string
      return {
        area_code: areaCode,
        name: props.name as string,
        municipality: props.municipality as string,
        kerrostalo: (props.price_per_sqm_avg as number | null) ?? null,
        rivitalo: rtPriceMap.get(areaCode) ?? null,
        omakotitalo: oktPriceMap.get(areaCode) ?? null,
      }
    })
    .filter(a => {
      if (!a.name || !a.area_code || seenCodes.has(a.area_code)) return false
      seenCodes.add(a.area_code)
      return true
    })

  // Also add areas that only have RT/OKT prices (not in KT features)
  for (const f of (rtGeo?.features ?? [])) {
    const code = f.properties?.area_code as string
    if (code && city.postalPrefixes.some(p => code.startsWith(p)) && !seenCodes.has(code)) {
      seenCodes.add(code)
      areaPrices.push({
        area_code: code,
        name: f.properties?.name as string,
        municipality: f.properties?.municipality as string,
        kerrostalo: null,
        rivitalo: rtPriceMap.get(code) ?? null,
        omakotitalo: oktPriceMap.get(code) ?? null,
      })
    }
  }

  const median = (arr: number[]) => {
    if (arr.length === 0) return null
    const sorted = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  }

  const ktPrices = areaPrices.map(a => a.kerrostalo).filter((p): p is number => p != null && p > 0)
  const rtPrices = areaPrices.map(a => a.rivitalo).filter((p): p is number => p != null && p > 0)
  const oktPrices = areaPrices.map(a => a.omakotitalo).filter((p): p is number => p != null && p > 0)

  const areasWithPrice = areaPrices
    .map(a => ({ ...a, price: a.kerrostalo ?? a.rivitalo ?? a.omakotitalo }))
    .filter(a => a.price != null && a.price > 0)
    .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))

  // -----------------------------------------------------------------------
  // Fetch price trends: compare 2020 vs 2024 (kerrostalo primary)
  // -----------------------------------------------------------------------
  const supabase = getSupabaseAdmin()
  const areaCodes = areaPrices.map(a => a.area_code)

  // Get area IDs for our postal codes
  const { data: areaRows } = await supabase
    .from('areas')
    .select('id, area_code')
    .in('area_code', areaCodes)

  const areaCodeToId = new Map<string, string>()
  const areaIdToCode = new Map<string, string>()
  for (const a of areaRows ?? []) {
    areaCodeToId.set(a.area_code, a.id)
    areaIdToCode.set(a.id, a.area_code)
  }

  const areaIds = [...areaCodeToId.values()]

  // Fetch prices for both years in one query
  const { data: trendPrices } = await supabase
    .from('price_estimates')
    .select('area_id, year, property_type, price_per_sqm_avg')
    .in('area_id', areaIds)
    .in('year', [2020, 2024])
    .eq('property_type', 'kerrostalo')
    .not('price_per_sqm_avg', 'is', null)

  // Build trend data per area
  const priceByAreaYear = new Map<string, Map<number, number>>()
  for (const p of trendPrices ?? []) {
    const code = areaIdToCode.get(p.area_id)
    if (!code) continue
    if (!priceByAreaYear.has(code)) priceByAreaYear.set(code, new Map())
    priceByAreaYear.get(code)!.set(p.year, Number(p.price_per_sqm_avg))
  }

  const nameMap = new Map(areaPrices.map(a => [a.area_code, a.name]))
  const trends: AreaTrend[] = []
  for (const [code, yearPrices] of priceByAreaYear) {
    const p2020 = yearPrices.get(2020)
    const p2024 = yearPrices.get(2024)
    if (p2020 && p2024 && p2020 > 0) {
      trends.push({
        area_code: code,
        name: nameMap.get(code) ?? code,
        currentPrice: p2024,
        previousPrice: p2020,
        trendPct: ((p2024 - p2020) / p2020) * 100,
        propertyType: 'kerrostalo',
      })
    }
  }

  trends.sort((a, b) => b.trendPct - a.trendPct)
  const trendingUp = trends.filter(t => t.trendPct > 0).slice(0, 5)
  const trendingDown = trends.filter(t => t.trendPct < 0).slice(-3).reverse()

  return {
    city,
    areaCount: areaPrices.length,
    prices: {
      kerrostalo: { median: median(ktPrices), count: ktPrices.length, min: ktPrices.length ? Math.min(...ktPrices) : null, max: ktPrices.length ? Math.max(...ktPrices) : null },
      rivitalo: { median: median(rtPrices), count: rtPrices.length, min: rtPrices.length ? Math.min(...rtPrices) : null, max: rtPrices.length ? Math.max(...rtPrices) : null },
      omakotitalo: { median: median(oktPrices), count: oktPrices.length, min: oktPrices.length ? Math.min(...oktPrices) : null, max: oktPrices.length ? Math.max(...oktPrices) : null },
    },
    topAreas: areasWithPrice.slice(0, 8),
    cheapestAreas: areasWithPrice.slice(-8).reverse(),
    trendingUp,
    trendingDown,
    allAreas: areaPrices.sort((a, b) => a.name.localeCompare(b.name, 'fi')),
  }
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const city = getCityBySlug(slug)
  if (!city) return { title: 'Kaupunkia ei löytynyt' }

  const data = await getCityData(slug)
  const medianPrice = data?.prices.kerrostalo.median

  const title = `${city.name} – Asuntohinnat${medianPrice ? ` ${formatNumber(medianPrice)} €/m²` : ''}`
  const description = `${city.name}: asuntojen hinta-arviot ${data?.areaCount ?? ''} naapurustossa. ${medianPrice ? `Kerrostalojen mediaanihinta ${formatNumber(medianPrice)} €/m².` : ''} Vertaile naapurustoja, tutki hintoja ja löydä unelma-asuntosi.`

  return {
    title,
    description,
    keywords: [
      `${city.name} asuntohinnat`,
      `${city.name} neliöhinta`,
      `${city.name} asunnot`,
      `asuntohinnat ${city.name}`,
      'neliöhinta',
      'hinta-arvio',
      'asuntokauppa',
    ],
    openGraph: {
      title: `${city.name} – Asuntohinnat | Neliöt`,
      description,
    },
    alternates: {
      canonical: `/kaupunki/${slug}`,
    },
  }
}

export function generateStaticParams() {
  return CITY_SLUGS.map(c => ({ slug: c.slug }))
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function PriceCard({ label, icon, median, min, max }: {
  label: string
  icon: React.ReactNode
  median: number | null
  min: number | null
  max: number | null
}) {
  if (!median) return null
  return (
    <div className="bg-white border-2 border-[#1a1a1a] rounded-xl p-5 shadow-hard-sm">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="font-display font-bold text-sm text-[#1a1a1a]">{label}</h3>
      </div>
      <div className="font-mono font-bold text-2xl text-[#1a1a1a]">
        {formatNumber(median)} <span className="text-sm font-normal text-muted-foreground">€/m²</span>
      </div>
      {min != null && max != null && (
        <div className="text-xs text-muted-foreground mt-1 font-mono">
          {formatNumber(min)} – {formatNumber(max)} €/m²
        </div>
      )}
    </div>
  )
}

function TrendCard({ area, rank }: { area: AreaTrend; rank: number }) {
  const isUp = area.trendPct > 0
  const absChange = Math.abs(area.trendPct)
  const priceChange = area.currentPrice - area.previousPrice

  return (
    <Link
      href={`/alue/${area.area_code}`}
      className="group flex items-stretch gap-0 rounded-xl border-2 border-[#1a1a1a] bg-white overflow-hidden shadow-hard-sm hover:translate-y-[-2px] hover:shadow-hard transition-all duration-200"
    >
      {/* Rank strip */}
      <div className={`flex items-center justify-center w-12 flex-shrink-0 ${
        isUp
          ? 'bg-gradient-to-b from-[#ff90e8] to-[#ffc900]'
          : 'bg-gradient-to-b from-[#b8d4e3] to-[#8cc8b8]'
      }`}>
        <span className="font-mono font-black text-lg text-white drop-shadow-sm">{rank}</span>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-3.5 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="font-display font-bold text-[#1a1a1a] text-sm truncate group-hover:text-pink transition-colors">
              {area.name}
            </h4>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="font-mono text-base font-bold text-[#1a1a1a]">
                {formatNumber(Math.round(area.currentPrice))}
              </span>
              <span className="text-xs text-muted-foreground">€/m²</span>
            </div>
          </div>

          {/* Trend badge */}
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg flex-shrink-0 border ${
            isUp
              ? 'bg-[#ff90e8]/10 border-[#ff90e8]/30 text-[#c44da0]'
              : 'bg-[#8cc8b8]/15 border-[#8cc8b8]/30 text-[#4a8a72]'
          }`}>
            {isUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            <span className="font-mono font-bold text-sm">
              {isUp ? '+' : '−'}{absChange.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Price change in euros */}
        <div className="mt-1.5">
          <span className={`text-xs font-mono ${isUp ? 'text-[#c44da0]' : 'text-[#4a8a72]'}`}>
            {isUp ? '+' : '−'}{formatNumber(Math.abs(Math.round(priceChange)))} €/m² vuodesta 2020
          </span>
        </div>
      </div>
    </Link>
  )
}

function AreaRankingList({ title, icon, areas, variant }: {
  title: string
  icon: React.ReactNode
  areas: { area_code: string; name: string; price: number | null }[]
  variant: 'expensive' | 'affordable'
}) {
  if (areas.length === 0) return null
  return (
    <div className="bg-white border-2 border-[#1a1a1a] rounded-xl p-5 shadow-hard-sm">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="font-display font-bold text-sm text-[#1a1a1a]">{title}</h3>
      </div>
      <ol className="space-y-2">
        {areas.map((area, i) => (
          <li key={area.area_code}>
            <Link
              href={`/alue/${area.area_code}`}
              className="flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg hover:bg-[#FFFBF5] transition-colors group"
            >
              <span className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold text-white ${
                  variant === 'expensive' ? 'bg-[#e8917a]' : 'bg-[#8cc8b8]'
                }`}>
                  {i + 1}
                </span>
                <span className="text-sm text-[#1a1a1a] group-hover:underline">{area.name}</span>
              </span>
              <span className="font-mono text-sm font-medium text-[#1a1a1a]">
                {area.price ? `${formatNumber(area.price)} €` : '–'}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function CityPage({ params }: PageProps) {
  const { slug } = await params
  const data = await getCityData(slug)

  if (!data) notFound()

  const { city, areaCount, prices, topAreas, cheapestAreas, trendingUp, trendingDown, allAreas } = data

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      {/* Header */}
      <header className="border-b-2 border-[#1a1a1a]/10 bg-white/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-[#1a1a1a]">
            <MapPin size={18} />
            <span className="font-display font-bold text-sm">Neliöt</span>
          </Link>
          <Link
            href={`/?city=${slug}`}
            className="neo-press inline-flex items-center gap-1.5 bg-[#1a1a1a] text-white font-display font-bold text-xs px-4 py-2 rounded-full border-2 border-[#1a1a1a] hover:bg-pink transition-colors"
          >
            Avaa kartalla
            <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Hero */}
        <section className="mb-10">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <Link href="/kaupungit" className="hover:underline">Kaupungit</Link>
            <span>/</span>
            <span>{city.name}</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-black text-[#1a1a1a] leading-tight">
            Asuntohinnat {city.name}
          </h1>
          <p className="text-lg text-muted-foreground mt-3 max-w-2xl">
            {city.seoDescription} {areaCount} naapurustoa, jokaisen rakennuksen hinta-arvio.
          </p>
        </section>

        {/* AI Search */}
        <section className="mb-10">
          <h2 className="text-xl font-display font-bold text-[#1a1a1a] mb-2">Etsi asuntoja {city.name}sta</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Kuvaile millaista asuntoa etsit — tekoäly hakee sopivat kohteet.
          </p>
          <CityAISearch cityName={city.name} areaCodes={allAreas.map(a => a.area_code)} />
        </section>

        {/* Price overview */}
        <section className="mb-10">
          <h2 className="text-xl font-display font-bold text-[#1a1a1a] mb-4">Hintataso talotyypeittäin</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PriceCard
              label="Kerrostalo"
              icon={<Building2 size={16} className="text-[#e8917a]" />}
              median={prices.kerrostalo.median}
              min={prices.kerrostalo.min}
              max={prices.kerrostalo.max}
            />
            <PriceCard
              label="Rivitalo"
              icon={<Layers size={16} className="text-[#8cc8b8]" />}
              median={prices.rivitalo.median}
              min={prices.rivitalo.min}
              max={prices.rivitalo.max}
            />
            <PriceCard
              label="Omakotitalo"
              icon={<Home size={16} className="text-[#e8d098]" />}
              median={prices.omakotitalo.median}
              min={prices.omakotitalo.min}
              max={prices.omakotitalo.max}
            />
          </div>
        </section>

        {/* Trending areas — popularity by price trend */}
        {(trendingUp.length > 0 || trendingDown.length > 0) && (
          <section className="mb-10">
            <h2 className="text-xl font-display font-bold text-[#1a1a1a] mb-1">Hintakehitys 2020–2024</h2>
            <p className="text-sm text-muted-foreground mb-5">Kerrostalojen neliöhinnan muutos naapurustoittain</p>

            {trendingUp.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Flame size={16} className="text-[#ff90e8]" />
                  <h3 className="font-display font-bold text-sm text-[#1a1a1a]">Nousussa</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {trendingUp.map((area, i) => (
                    <TrendCard key={area.area_code} area={area} rank={i + 1} />
                  ))}
                </div>
              </div>
            )}

            {trendingDown.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Snowflake size={16} className="text-[#8cc8b8]" />
                  <h3 className="font-display font-bold text-sm text-[#1a1a1a]">Laskussa</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {trendingDown.map((area, i) => (
                    <TrendCard key={area.area_code} area={area} rank={i + 1} />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Area rankings by price level */}
        <section className="mb-10">
          <h2 className="text-xl font-display font-bold text-[#1a1a1a] mb-4">Naapurustot hintatason mukaan</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AreaRankingList
              title="Kalleimmat naapurustot"
              icon={<TrendingUp size={16} className="text-[#e8917a]" />}
              areas={topAreas}
              variant="expensive"
            />
            <AreaRankingList
              title="Edullisimmat naapurustot"
              icon={<TrendingDown size={16} className="text-[#8cc8b8]" />}
              areas={cheapestAreas}
              variant="affordable"
            />
          </div>
        </section>

        {/* CTA */}
        <section className="text-center py-8">
          <Link
            href={`/?city=${slug}`}
            className="neo-press inline-flex items-center gap-2 bg-[#1a1a1a] text-white font-display font-bold text-base px-6 py-3 rounded-full border-2 border-[#1a1a1a] hover:bg-pink hover:text-white transition-colors"
          >
            <MapPin size={18} />
            Tutki {city.name}a kartalla
          </Link>
          <p className="text-xs text-muted-foreground mt-3">
            Karttanäkymässä näet yksittäisten rakennusten hinta-arviot
          </p>
        </section>

        {/* JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'City',
              name: city.name,
              url: `https://www.neliohinnat.fi/kaupunki/${slug}`,
              address: {
                '@type': 'PostalAddress',
                addressLocality: city.name,
                addressCountry: 'FI',
              },
              description: `Asuntohinnat ${city.name}: ${areaCount} naapurustoa. ${prices.kerrostalo.median ? `Kerrostalojen mediaanihinta ${formatNumber(prices.kerrostalo.median)} €/m².` : ''}`,
              geo: {
                '@type': 'GeoCoordinates',
                latitude: city.center[1],
                longitude: city.center[0],
              },
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Neliöt', item: 'https://www.neliohinnat.fi' },
                { '@type': 'ListItem', position: 2, name: 'Kaupungit', item: 'https://www.neliohinnat.fi/kaupungit' },
                { '@type': 'ListItem', position: 3, name: city.name },
              ],
            }),
          }}
        />
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-[#1a1a1a]/10 bg-[#FFFBF5] py-6">
        <div className="max-w-5xl mx-auto px-4 text-xs text-muted-foreground">
          <p>Lähde: Tilastokeskus (CC BY 4.0) | Rakennukset: OpenStreetMap & MML | Osoitteet: MML</p>
          <p className="mt-1">Hinta-arviot ovat suuntaa-antavia eivätkä korvaa virallista arviota.</p>
        </div>
      </footer>
    </div>
  )
}
