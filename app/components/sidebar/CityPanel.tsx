'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useMapContext } from '@/app/contexts/MapContext'
import { formatNumber } from '@/app/lib/formatters'
import { Skeleton } from '@/app/components/ui/skeleton'
import { AnimatedNumber } from '@/app/components/ui/AnimatedNumber'
import { cn } from '@/app/lib/utils'
import {
  Building2,
  Home,
  Layers,
  MapPin,
  TrendingUp,
  TrendingDown,
  ArrowRight,
} from 'lucide-react'
import type { CitySlugConfig } from '@/app/lib/citySlugs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CityData {
  city: string
  slug: string
  areaCount: number
  center: [number, number]
  zoom: number
  prices: {
    kerrostalo: { median: number | null; avg: number | null; count: number }
    rivitalo: { median: number | null; avg: number | null; count: number }
    omakotitalo: { median: number | null; avg: number | null; count: number }
  }
  topAreas: { area_code: string; name: string; price: number | null }[]
  cheapestAreas: { area_code: string; name: string; price: number | null }[]
}

// ---------------------------------------------------------------------------
// CityPanel
// ---------------------------------------------------------------------------

export function CityPanel({ city }: { city: CitySlugConfig }) {
  const [data, setData] = useState<CityData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const {
    setSelectedArea,
    setIsSidebarOpen,
    setSelectedCity,
  } = useMapContext()

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setData(null)
    fetch(`/api/cities/${city.slug}`, { signal: controller.signal })
      .then(r => r.json())
      .then((d: CityData) => {
        setData(d)
        setIsLoading(false)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setIsLoading(false)
      })
    return () => controller.abort()
  }, [city.slug])

  function handleAreaClick(areaCode: string, name: string) {
    setSelectedCity(null)
    setSelectedArea({ id: areaCode, areaCode, name })
    setIsSidebarOpen(true)
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Tietoja ei saatavilla.</p>
  }

  const priceTypes = [
    { key: 'kerrostalo' as const, label: 'Kerrostalo', icon: <Building2 size={14} /> },
    { key: 'rivitalo' as const, label: 'Rivitalo', icon: <Layers size={14} /> },
    { key: 'omakotitalo' as const, label: 'Omakotitalo', icon: <Home size={14} /> },
  ]

  return (
    <div className="space-y-5">
      {/* City header */}
      <div>
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-pink" />
          <h2 className="text-lg font-display font-black text-[#1a1a1a]">
            {city.name}
          </h2>
        </div>
        {city.municipalities.length > 1 && (
          <p className="text-xs text-muted-foreground mt-0.5 ml-6">
            {city.municipalities.join(', ')}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1 ml-6">
          {data.areaCount} naapurustoa
        </p>
      </div>

      {/* Price overview cards */}
      <div className="space-y-2">
        {priceTypes.map(({ key, label, icon }) => {
          const p = data.prices[key]
          if (!p.median) return null
          return (
            <div
              key={key}
              className={cn(
                'rounded-xl border-2 border-[#1a1a1a]/10 p-3',
                'bg-white',
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{icon}</span>
                  <span className="text-xs font-display font-bold text-[#1a1a1a]">{label}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {p.count} aluetta
                  </span>
                </div>
                <span className="font-mono font-bold text-sm text-[#1a1a1a]">
                  <AnimatedNumber value={p.median} /> <span className="text-xs font-normal text-muted-foreground">€/m²</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Top areas (most expensive) */}
      {data.topAreas.length > 0 && (
        <AreaList
          title="Kalleimmat naapurustot"
          icon={<TrendingUp size={14} className="text-pink" />}
          areas={data.topAreas}
          onAreaClick={handleAreaClick}
        />
      )}

      {/* Cheapest areas */}
      {data.cheapestAreas.length > 0 && (
        <AreaList
          title="Edullisimmat naapurustot"
          icon={<TrendingDown size={14} className="text-mint" />}
          areas={data.cheapestAreas}
          onAreaClick={handleAreaClick}
        />
      )}

      {/* Link to full city page */}
      <Link
        href={`/kaupunki/${city.slug}`}
        className={cn(
          'flex items-center justify-center gap-2',
          'w-full px-3 py-2.5 rounded-lg text-xs font-display font-bold',
          'bg-[#1a1a1a] text-white',
          'hover:bg-pink transition-colors',
          'border-2 border-[#1a1a1a]',
        )}
      >
        {city.name} – kaikki tiedot
        <ArrowRight size={14} />
      </Link>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Area list sub-component
// ---------------------------------------------------------------------------

function AreaList({
  title,
  icon,
  areas,
  onAreaClick,
}: {
  title: string
  icon: React.ReactNode
  areas: { area_code: string; name: string; price: number | null }[]
  onAreaClick: (code: string, name: string) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-xs font-display font-bold text-[#1a1a1a] uppercase tracking-wider">{title}</h3>
      </div>
      <div className="space-y-0.5">
        {areas.map((area, i) => (
          <button
            key={area.area_code}
            type="button"
            onClick={() => onAreaClick(area.area_code, area.name)}
            className={cn(
              'w-full flex items-center justify-between px-3 py-2 rounded-lg',
              'text-left text-xs',
              'hover:bg-pink-baby/50 transition-colors',
              'group',
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] text-muted-foreground font-mono w-4 text-right flex-shrink-0">
                {i + 1}
              </span>
              <span className="font-medium text-[#1a1a1a] truncate group-hover:text-pink transition-colors">
                {area.name}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0">
                {area.area_code}
              </span>
            </div>
            {area.price != null && (
              <span className="font-mono font-bold text-[#1a1a1a] flex-shrink-0 ml-2">
                {formatNumber(Math.round(area.price))} €/m²
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
