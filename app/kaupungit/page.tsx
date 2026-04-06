import { Metadata } from 'next'
import Link from 'next/link'
import { MapPin, ArrowRight } from 'lucide-react'
import { CITY_SLUGS } from '@/app/lib/citySlugs'
import { getDataProvider } from '@/app/lib/dataProvider'
import { formatNumber } from '@/app/lib/formatters'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Kaupungit',
  description: 'Vertaile asuntojen hintoja Suomen suurimmissa kaupungeissa. Helsinki, Tampere, Turku, Oulu, Jyväskylä, Kuopio ja Lahti.',
  keywords: ['asuntohinnat', 'Suomi', 'kaupungit', 'neliöhinta', 'Helsinki', 'Tampere', 'Turku', 'Oulu'],
  openGraph: {
    title: 'Kaupungit – Neliöt',
    description: 'Vertaile asuntojen hintoja Suomen suurimmissa kaupungeissa.',
  },
  alternates: {
    canonical: '/kaupungit',
  },
}

async function getCityPrices() {
  const provider = getDataProvider()
  const geojson = await provider.getAreasGeoJSON(2024, 'kerrostalo')
  const features = geojson?.features ?? []

  return CITY_SLUGS.map(city => {
    const cityFeatures = features.filter(f => {
      const code = f.properties?.area_code as string
      return code && city.postalPrefixes.some(p => code.startsWith(p))
    })

    const prices = cityFeatures
      .map(f => f.properties?.price_kerrostalo as number | null)
      .filter((p): p is number => p != null && p > 0)

    const sorted = [...prices].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 ? sorted[mid] : sorted.length ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : null

    return {
      ...city,
      areaCount: cityFeatures.length,
      medianPrice: median,
    }
  })
}

export default async function CitiesPage() {
  const cities = await getCityPrices()

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      {/* Header */}
      <header className="border-b-2 border-[#1a1a1a]/10 bg-white/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-[#1a1a1a]">
            <MapPin size={18} />
            <span className="font-display font-bold text-sm">Neliöt</span>
          </Link>
          <Link
            href="/"
            className="neo-press inline-flex items-center gap-1.5 bg-[#1a1a1a] text-white font-display font-bold text-xs px-4 py-2 rounded-full border-2 border-[#1a1a1a] hover:bg-pink transition-colors"
          >
            Avaa kartta
            <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-4xl md:text-5xl font-display font-black text-[#1a1a1a] leading-tight">
          Asuntohinnat kaupungeittain
        </h1>
        <p className="text-lg text-muted-foreground mt-3 max-w-2xl">
          Vertaile Suomen suurimpien kaupunkien asuntohintoja. Jokaisen alueen hinnat perustuvat Tilastokeskuksen toteutuneisiin kauppahintoihin.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
          {cities.map(city => (
            <Link
              key={city.slug}
              href={`/kaupunki/${city.slug}`}
              className="group bg-white border-2 border-[#1a1a1a] rounded-xl p-5 shadow-hard-sm hover:shadow-hard transition-all hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-display font-bold text-[#1a1a1a] group-hover:text-pink transition-colors">
                    {city.name}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    {city.areaCount} aluetta &middot; {city.municipalities.join(', ')}
                  </p>
                </div>
                <ArrowRight size={18} className="text-muted-foreground group-hover:text-[#1a1a1a] transition-colors mt-1" />
              </div>
              {city.medianPrice && (
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="font-mono font-bold text-2xl text-[#1a1a1a]">
                    {formatNumber(city.medianPrice)}
                  </span>
                  <span className="text-sm text-muted-foreground">&euro;/m&sup2;</span>
                  <span className="text-xs text-muted-foreground ml-1">kerrostalo mediaani</span>
                </div>
              )}
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center py-10">
          <Link
            href="/"
            className="neo-press inline-flex items-center gap-2 bg-[#1a1a1a] text-white font-display font-bold text-base px-6 py-3 rounded-full border-2 border-[#1a1a1a] hover:bg-pink hover:text-white transition-colors"
          >
            <MapPin size={18} />
            Tutki hintoja kartalla
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-[#1a1a1a]/10 bg-[#FFFBF5] py-6">
        <div className="max-w-4xl mx-auto px-4 text-xs text-muted-foreground">
          <p>Lähde: Tilastokeskus (CC BY 4.0) | Rakennukset: OpenStreetMap &amp; MML</p>
        </div>
      </footer>
    </div>
  )
}
