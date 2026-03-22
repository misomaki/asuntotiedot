import { Metadata } from 'next'
import Link from 'next/link'
import { getDataProvider } from '@/app/lib/dataProvider'
import { CITIES } from '@/app/lib/cities'
import { formatNumber, formatPricePerSqm } from '@/app/lib/formatters'
import { MapPin } from 'lucide-react'

export const revalidate = 86400 // 24h ISR

export const metadata: Metadata = {
  title: 'Kaikki alueet – Neliöt',
  description: 'Selaa Suomen postinumeroalueita ja vertaile asuntojen hintoja kaupungeittain. Helsinki, Tampere, Turku, Oulu, Jyväskylä, Kuopio ja Lahti.',
  keywords: ['asuntohinnat', 'postinumero', 'neliöhinta', 'Helsinki', 'Tampere', 'Turku', 'Oulu'],
}

interface AreaSummary {
  code: string
  name: string
  municipality: string
  price: number | null
}

export default async function AreasIndexPage() {
  const provider = getDataProvider()

  // Fetch all area GeoJSON to get codes + prices
  const geojson = await provider.getAreasGeoJSON(2024, 'kerrostalo')
  const features = geojson?.features ?? []

  // Group areas by city
  const areasByCity = new Map<string, AreaSummary[]>()
  for (const city of CITIES) {
    areasByCity.set(city.name, [])
  }

  for (const f of features) {
    const props = f.properties
    if (!props) continue
    const code = props.area_code as string
    const name = props.name as string
    const municipality = props.municipality as string
    const price = (props.price_per_sqm_median ?? props.price_per_sqm_avg ?? null) as number | null

    // Find which city this belongs to
    for (const city of CITIES) {
      if (city.postalPrefixes.some(p => code.startsWith(p))) {
        areasByCity.get(city.name)?.push({ code, name, municipality, price })
        break
      }
    }
  }

  // Sort areas by code within each city
  for (const areas of areasByCity.values()) {
    areas.sort((a, b) => a.code.localeCompare(b.code))
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      {/* Header */}
      <header className="border-b-2 border-[#1a1a1a] bg-[#FFFBF5]">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-display font-bold text-lg text-[#1a1a1a] hover:text-pink transition-colors">
            Neliöt
          </Link>
          <Link
            href="/"
            className="flex items-center gap-2 bg-[#1a1a1a] text-white font-display font-bold text-sm px-4 py-2 rounded-full border-2 border-[#1a1a1a] hover:bg-pink transition-colors"
          >
            <MapPin size={16} />
            Karttanäkymä
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-display font-black text-[#1a1a1a]">Alueet</h1>
        <p className="text-muted-foreground mt-2 text-base">
          Selaa postinumeroalueita ja vertaile asuntojen hintoja {CITIES.length} kaupungissa.
        </p>

        <div className="mt-8 space-y-10">
          {CITIES.map(city => {
            const areas = areasByCity.get(city.name) ?? []
            if (areas.length === 0) return null
            return (
              <section key={city.name}>
                <h2 className="text-xl font-display font-bold text-[#1a1a1a] mb-3">{city.name}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {areas.map(area => (
                    <Link
                      key={area.code}
                      href={`/alue/${area.code}`}
                      className="flex items-center justify-between rounded-xl border-2 border-[#1a1a1a]/10 bg-white px-4 py-3 hover:border-pink hover:shadow-hard-sm transition-all group"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-display font-bold text-[#1a1a1a] truncate group-hover:text-pink transition-colors">
                          {area.name}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">{area.code}</div>
                      </div>
                      {area.price != null && area.price > 0 && (
                        <div className="text-sm font-mono font-bold tabular-nums text-[#1a1a1a] flex-shrink-0 ml-3">
                          {formatNumber(Math.round(area.price))} €/m²
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-[#1a1a1a]/10 bg-[#FFFBF5] py-6 mt-8">
        <div className="max-w-5xl mx-auto px-4 text-xs text-muted-foreground">
          <p>Lähde: Tilastokeskus (CC BY 4.0) | Rakennukset: OpenStreetMap | Osoitteet: MML</p>
        </div>
      </footer>
    </div>
  )
}
