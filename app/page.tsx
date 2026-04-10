import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Header } from '@/app/components/Header'
import { Sidebar } from '@/app/components/sidebar/Sidebar'
import { SearchResultsPanel } from '@/app/components/sidebar/SearchResultsPanel'
import { LogoMark } from '@/app/components/brand/LogoMark'

const MapContainer = dynamic(
  () => import('@/app/components/map/MapContainer'),
  { ssr: false, loading: () => <MapSkeleton /> }
)

const CITY_LINKS = [
  { name: 'Helsinki', slug: 'helsinki' },
  { name: 'Tampere', slug: 'tampere' },
  { name: 'Turku', slug: 'turku' },
  { name: 'Oulu', slug: 'oulu' },
  { name: 'Jyväskylä', slug: 'jyvaskyla' },
  { name: 'Kuopio', slug: 'kuopio' },
  { name: 'Lahti', slug: 'lahti' },
]

function MapSkeleton() {
  return (
    <div className="w-full h-full bg-bg-primary relative overflow-hidden">
      {/* Full-screen warm shimmer wash */}
      <div className="absolute inset-0 bg-gradient-to-r from-bg-primary via-pink-pale to-bg-primary bg-[length:200%_100%] animate-shimmer" />

      {/* Centered loading indicator */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-pink-baby border-t-pink rounded-full animate-spin" />
          <p className="text-muted-foreground text-xs font-body">Ladataan karttaa...</p>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <main className="relative w-screen h-screen overflow-hidden bg-bg-primary">
      <MapContainer />
      <Header />
      <Sidebar />
      <SearchResultsPanel />

      {/* SEO: Server-rendered content visible to crawlers and users */}
      <section className="absolute bottom-8 left-3 z-10 max-w-[280px] bg-white border-2 border-[#1a1a1a] rounded-xl px-4 py-3.5 shadow-hard-sm pointer-events-auto max-md:hidden">
        <div className="flex items-center gap-2">
          <LogoMark size={22} />
          <h1 className="font-display font-black text-sm text-[#1a1a1a] tracking-tight">
            Asuntohinnat kartalla
          </h1>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed font-body">
          266 000 asuinrakennuksen hinta-arviot avoimeen dataan perustuen.
          Hinnat pohjautuvat Tilastokeskuksen toteutuneisiin kauppahintoihin.
        </p>
        <nav className="flex flex-wrap gap-1.5 mt-2.5" aria-label="Kaupungit">
          {CITY_LINKS.map(city => (
            <Link
              key={city.slug}
              href={`/kaupunki/${city.slug}`}
              className="neo-press text-[10px] font-display font-bold text-[#1a1a1a] bg-[#FFFBF5] hover:bg-pink-pale border border-[#1a1a1a]/15 rounded-full px-2.5 py-0.5 transition-colors"
            >
              {city.name}
            </Link>
          ))}
        </nav>
      </section>

      {/* Mobile: minimal H1 for crawlers */}
      <div className="absolute bottom-7 left-3 z-10 md:hidden">
        <h1 className="text-[10px] font-display font-black text-muted-foreground/40">
          Asuntohinnat kartalla — Neliöt
        </h1>
      </div>

      {/* Data attribution — above MapLibre's built-in attribution */}
      <div className="absolute bottom-1 left-1 md:bottom-1 md:right-1 md:left-auto z-10 text-[9px] md:text-[10px] text-muted-foreground/60 pointer-events-none select-none max-w-[60vw] md:max-w-none md:text-right text-left">
        Lähde: Tilastokeskus (CC BY 4.0) | Rakennukset: MML Maastotietokanta (CC BY 4.0)
      </div>
    </main>
  )
}
