import dynamic from 'next/dynamic'
import { Header } from '@/app/components/Header'
import { Sidebar } from '@/app/components/sidebar/Sidebar'

const MapContainer = dynamic(
  () => import('@/app/components/map/MapContainer'),
  { ssr: false, loading: () => <MapSkeleton /> }
)

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

      {/* Data attribution */}
      <div className="absolute bottom-1 right-1 z-10 text-[10px] text-muted-foreground/60 pointer-events-none select-none">
        Lähde: Tilastokeskus (CC BY 4.0) | Rakennukset: OpenStreetMap
      </div>
    </main>
  )
}
