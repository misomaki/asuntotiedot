import dynamic from 'next/dynamic'
import { Header } from '@/app/components/Header'
import { Sidebar } from '@/app/components/sidebar/Sidebar'

const MapContainer = dynamic(
  () => import('@/app/components/map/MapContainer'),
  { ssr: false, loading: () => <MapSkeleton /> }
)

function MapSkeleton() {
  return (
    <div className="w-full h-full bg-bg-primary flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Ladataan karttaa...</p>
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
    </main>
  )
}
