import { Metadata } from 'next'
import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { getDataProvider } from '@/app/lib/dataProvider'
import { formatNumber } from '@/app/lib/formatters'
import { CITY_SLUGS } from '@/app/lib/citySlugs'

export const revalidate = 86400 // ISR: revalidate every 24h

export const metadata: Metadata = {
  title: 'Alueet – Postinumeroalueiden asuntohinnat',
  description: 'Selaa yli 400 postinumeroalueen asuntohintoja Suomessa. Vertaile naapurustoja Helsingissä, Tampereella, Turussa, Oulussa ja muualla. Hinnat perustuvat Tilastokeskuksen toteutuneisiin kauppahintoihin.',
  keywords: ['asuntohinnat', 'postinumero', 'neliöhinta', 'postinumeroalue', 'Helsinki', 'Tampere', 'Turku', 'Oulu'],
  openGraph: {
    title: 'Alueet – Postinumeroalueiden asuntohinnat | Neliöt',
    description: 'Yli 400 postinumeroalueen asuntohinnat kartalla. Vertaile naapurustoja kaupungeittain.',
  },
  alternates: {
    canonical: '/alue',
  },
}

interface AreaEntry {
  area_code: string
  name: string
  municipality: string
  price: number | null
}

export default async function AreasIndexPage() {
  const provider = getDataProvider()
  const geojson = await provider.getAreasGeoJSON(2024, 'kerrostalo')
  const features = geojson?.features ?? []

  // Deduplicate by area_code and extract data
  const seenCodes = new Set<string>()
  const areas: AreaEntry[] = features
    .map(f => {
      const props = f.properties as Record<string, unknown>
      return {
        area_code: props.area_code as string,
        name: props.name as string,
        municipality: props.municipality as string,
        price: (props.price_per_sqm_avg as number | null) ?? null,
      }
    })
    .filter(a => {
      if (!a.area_code || !a.name || seenCodes.has(a.area_code)) return false
      seenCodes.add(a.area_code)
      return true
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fi'))

  // Group areas by city using postal prefixes
  const cityGroups = CITY_SLUGS.map(city => {
    const cityAreas = areas
      .filter(a => city.postalPrefixes.some(p => a.area_code.startsWith(p)))
      .sort((a, b) => a.name.localeCompare(b.name, 'fi'))
    return { city, areas: cityAreas }
  }).filter(g => g.areas.length > 0)

  const totalAreas = areas.length

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
            href="/"
            className="neo-press inline-flex items-center gap-1.5 bg-[#1a1a1a] text-white font-display font-bold text-xs px-4 py-2 rounded-full border-2 border-[#1a1a1a] hover:bg-pink transition-colors"
          >
            Avaa kartta
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-4xl md:text-5xl font-display font-black text-[#1a1a1a] leading-tight">
          Postinumeroalueiden asuntohinnat
        </h1>
        <p className="text-lg text-muted-foreground mt-3 max-w-2xl">
          {totalAreas} postinumeroaluetta 7 kaupungista. Jokaisen alueen hinnat perustuvat
          Tilastokeskuksen toteutuneisiin kauppahintoihin. Klikkaa aluetta nähdäksesi
          talotyyppikohtaiset hinnat, väestötiedot ja hintakehityksen.
        </p>

        {/* City groups */}
        <div className="mt-10 space-y-10">
          {cityGroups.map(({ city, areas: cityAreas }) => (
            <section key={city.slug}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-display font-bold text-[#1a1a1a]">
                  <Link href={`/kaupunki/${city.slug}`} className="hover:text-pink transition-colors">
                    {city.name}
                  </Link>
                </h2>
                <span className="text-sm text-muted-foreground">{cityAreas.length} aluetta</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {cityAreas.map(area => (
                  <Link
                    key={area.area_code}
                    href={`/alue/${area.area_code}`}
                    className="group flex items-center justify-between py-2 px-3 rounded-lg border border-[#1a1a1a]/8 bg-white hover:border-[#1a1a1a]/20 hover:bg-[#FFFBF5] transition-colors"
                  >
                    <div className="min-w-0">
                      <span className="text-sm text-[#1a1a1a] group-hover:text-pink transition-colors truncate block">
                        {area.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">{area.area_code}</span>
                    </div>
                    {area.price != null && area.price > 0 && (
                      <span className="text-xs font-mono font-medium text-[#1a1a1a] ml-2 flex-shrink-0">
                        {formatNumber(Math.round(area.price))} €
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </section>
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
        <div className="max-w-5xl mx-auto px-4 text-xs text-muted-foreground">
          <p>Lähde: Tilastokeskus (CC BY 4.0) | Rakennukset: MML Maastotietokanta (CC BY 4.0)</p>
        </div>
      </footer>
    </div>
  )
}
