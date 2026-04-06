import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { MapPin, ArrowRight, TrendingUp, TrendingDown, Building2, Home, Layers } from 'lucide-react'
import { getCityBySlug, CITY_SLUGS } from '@/app/lib/citySlugs'
import { getDataProvider } from '@/app/lib/dataProvider'
import { formatNumber } from '@/app/lib/formatters'
import { CityAISearch } from './CityAISearch'

export const dynamic = 'force-dynamic'

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
  const geojson = await provider.getAreasGeoJSON(2024, 'kerrostalo')
  const features = geojson?.features ?? []

  const cityFeatures = features.filter(f => {
    const code = f.properties?.area_code as string
    return code && city.postalPrefixes.some(p => code.startsWith(p))
  })

  const areaPrices: CityAreaPrice[] = cityFeatures.map(f => {
    const props = f.properties as Record<string, unknown>
    return {
      area_code: props.area_code as string,
      name: props.name as string,
      municipality: props.municipality as string,
      kerrostalo: props.price_kerrostalo as number | null,
      rivitalo: props.price_rivitalo as number | null,
      omakotitalo: props.price_omakotitalo as number | null,
    }
  }).filter(a => a.name)

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

  const title = `${city.name} \u2013 Asuntohinnat${medianPrice ? ` ${formatNumber(medianPrice)} \u20ac/m\u00b2` : ''}`
  const description = `${city.name}: asuntojen hinta-arviot ${data?.areaCount ?? ''} alueella. ${medianPrice ? `Kerrostalojen mediaanihinta ${formatNumber(medianPrice)} \u20ac/m\u00b2.` : ''} Vertaile alueita, tutki hintoja ja löydä unelma-asuntosi.`

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
      title: `${city.name} \u2013 Asuntohinnat | Neliöt`,
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

function PriceCard({ label, icon, median, min, max, count }: {
  label: string
  icon: React.ReactNode
  median: number | null
  min: number | null
  max: number | null
  count: number
}) {
  if (!median) return null
  return (
    <div className="bg-white border-2 border-[#1a1a1a] rounded-xl p-5 shadow-hard-sm">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="font-display font-bold text-sm text-[#1a1a1a]">{label}</h3>
      </div>
      <div className="font-mono font-bold text-2xl text-[#1a1a1a]">
        {formatNumber(median)} <span className="text-sm font-normal text-muted-foreground">\u20ac/m\u00b2</span>
      </div>
      {min != null && max != null && (
        <div className="text-xs text-muted-foreground mt-1 font-mono">
          {formatNumber(min)} \u2013 {formatNumber(max)} \u20ac/m\u00b2
        </div>
      )}
      <div className="text-xs text-muted-foreground mt-2">
        {count} aluetta
      </div>
    </div>
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
                {area.price ? `${formatNumber(area.price)} \u20ac` : '\u2013'}
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

  const { city, areaCount, prices, topAreas, cheapestAreas, allAreas } = data
  const primaryPrice = prices.kerrostalo.median ?? prices.rivitalo.median

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
            {city.seoDescription} {areaCount} postinumeroaluetta, jokaisen rakennuksen hinta-arvio.
          </p>
          {primaryPrice && (
            <div className="mt-4 inline-flex items-baseline gap-2 bg-white border-2 border-[#1a1a1a] rounded-xl px-5 py-3 shadow-hard-sm">
              <span className="text-sm text-muted-foreground">Kerrostalojen mediaanihinta</span>
              <span className="font-mono font-bold text-2xl text-[#1a1a1a]">{formatNumber(primaryPrice)}</span>
              <span className="text-sm text-muted-foreground">\u20ac/m\u00b2</span>
            </div>
          )}
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
              count={prices.kerrostalo.count}
            />
            <PriceCard
              label="Rivitalo"
              icon={<Layers size={16} className="text-[#8cc8b8]" />}
              median={prices.rivitalo.median}
              min={prices.rivitalo.min}
              max={prices.rivitalo.max}
              count={prices.rivitalo.count}
            />
            <PriceCard
              label="Omakotitalo"
              icon={<Home size={16} className="text-[#e8d098]" />}
              median={prices.omakotitalo.median}
              min={prices.omakotitalo.min}
              max={prices.omakotitalo.max}
              count={prices.omakotitalo.count}
            />
          </div>
        </section>

        {/* Area rankings */}
        <section className="mb-10">
          <h2 className="text-xl font-display font-bold text-[#1a1a1a] mb-4">Alueet hintatason mukaan</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AreaRankingList
              title="Kalleimmat alueet"
              icon={<TrendingUp size={16} className="text-[#e8917a]" />}
              areas={topAreas}
              variant="expensive"
            />
            <AreaRankingList
              title="Edullisimmat alueet"
              icon={<TrendingDown size={16} className="text-[#8cc8b8]" />}
              areas={cheapestAreas}
              variant="affordable"
            />
          </div>
        </section>

        {/* AI Search */}
        <section className="mb-10">
          <h2 className="text-xl font-display font-bold text-[#1a1a1a] mb-2">Etsi asuntoja {city.name}sta</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Kuvaile millaista asuntoa etsit — tekoäly hakee sopivat kohteet.
          </p>
          <CityAISearch cityName={city.name} areaCodes={allAreas.map(a => a.area_code)} />
        </section>

        {/* All areas */}
        <section className="mb-10">
          <h2 className="text-xl font-display font-bold text-[#1a1a1a] mb-4">Kaikki {areaCount} aluetta</h2>
          <div className="bg-white border-2 border-[#1a1a1a] rounded-xl overflow-hidden shadow-hard-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-[#1a1a1a]/10 bg-[#FFFBF5]">
                    <th className="text-left px-4 py-3 font-display font-bold text-xs text-muted-foreground uppercase tracking-wider">Alue</th>
                    <th className="text-right px-4 py-3 font-display font-bold text-xs text-muted-foreground uppercase tracking-wider">Kerrostalo</th>
                    <th className="text-right px-4 py-3 font-display font-bold text-xs text-muted-foreground uppercase tracking-wider">Rivitalo</th>
                    <th className="text-right px-4 py-3 font-display font-bold text-xs text-muted-foreground uppercase tracking-wider">Omakotitalo</th>
                  </tr>
                </thead>
                <tbody>
                  {allAreas.map((area, i) => (
                    <tr key={area.area_code} className={`border-b border-[#1a1a1a]/5 ${i % 2 === 0 ? '' : 'bg-[#FFFBF5]/50'} hover:bg-[#fff5eb] transition-colors`}>
                      <td className="px-4 py-2.5">
                        <Link href={`/alue/${area.area_code}`} className="hover:underline text-[#1a1a1a] font-medium">
                          {area.name}
                        </Link>
                        <span className="text-xs text-muted-foreground ml-1.5">{area.area_code}</span>
                      </td>
                      <td className="text-right px-4 py-2.5 font-mono text-sm">
                        {area.kerrostalo ? `${formatNumber(Math.round(area.kerrostalo))}` : '\u2013'}
                      </td>
                      <td className="text-right px-4 py-2.5 font-mono text-sm">
                        {area.rivitalo ? `${formatNumber(Math.round(area.rivitalo))}` : '\u2013'}
                      </td>
                      <td className="text-right px-4 py-2.5 font-mono text-sm">
                        {area.omakotitalo ? `${formatNumber(Math.round(area.omakotitalo))}` : '\u2013'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
              '@type': 'Place',
              name: city.name,
              address: {
                '@type': 'PostalAddress',
                addressLocality: city.name,
                addressCountry: 'FI',
              },
              description: `Asuntohinnat ${city.name}: ${areaCount} aluetta. ${prices.kerrostalo.median ? `Kerrostalojen mediaanihinta ${formatNumber(prices.kerrostalo.median)} \u20ac/m\u00b2.` : ''}`,
              geo: {
                '@type': 'GeoCoordinates',
                latitude: city.center[1],
                longitude: city.center[0],
              },
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
