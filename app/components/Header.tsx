'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Search, X, ChevronDown } from 'lucide-react'
import { useMapContext } from '@/app/contexts/MapContext'
import { useMediaQuery } from '@/app/hooks/useMediaQuery'
import { useMapData } from '@/app/hooks/useMapData'
import { LogoMark } from '@/app/components/brand/LogoMark'
import { cn } from '@/app/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal area info extracted from GeoJSON features for search results. */
interface SearchableArea {
  areaCode: string
  name: string
  municipality: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025] as const

/** Shared search result item */
function SearchResultItem({
  area,
  compact,
  index,
  onSelect,
}: {
  area: SearchableArea
  compact: boolean
  index?: number
  onSelect: (area: SearchableArea) => void
}) {
  return (
    <button
      key={area.areaCode}
      type="button"
      onClick={() => onSelect(area)}
      className={cn(
        'w-full px-3 text-left',
        'flex items-center gap-2',
        compact ? 'py-2 text-xs' : 'py-3 text-sm',
        'text-[#1a1a1a]',
        'hover:bg-pink-baby transition-colors',
        'focus-visible:outline-none focus-visible:bg-pink-baby',
        compact && 'animate-slide-up',
      )}
      style={compact && index !== undefined ? { animationDelay: `${index * 30}ms`, animationFillMode: 'both' } : undefined}
    >
      <span className={cn('font-mono text-[#999] flex-shrink-0', !compact && 'text-sm')} data-number>
        {area.areaCode}
      </span>
      <span className="truncate">{area.name}</span>
      <span className={cn('text-[#999] ml-auto flex-shrink-0', !compact && 'text-sm')}>
        {area.municipality}
      </span>
    </button>
  )
}

/** Shared "no results" empty state */
function SearchNoResults({ compact }: { compact: boolean }) {
  return (
    <div className={cn(
      'px-3 py-4 text-muted-foreground text-center',
      compact ? 'text-xs animate-fade-in' : 'text-sm',
    )}>
      <p className="font-medium">Ei tuloksia</p>
      <p className={cn('mt-0.5', compact ? 'text-[10px]' : 'text-sm')}>
        Kokeile postinumeroa tai alueen nimeä
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Header component
// ---------------------------------------------------------------------------

/**
 * Header – Floating header bar at the top of the map.
 *
 * Contains the app logo, year selector, and a search input for finding
 * postal code areas. Controls are inline on both mobile and desktop.
 */
export function Header() {
  const {
    filters,
    updateFilter,
    setSelectedArea,
    setIsSidebarOpen,
    viewport: { zoom: currentZoom },
    flyTo,
  } = useMapContext()

  const isDesktop = useMediaQuery('(min-width: 768px)')

  // Year picker state
  const [isYearOpen, setIsYearOpen] = useState(false)
  const yearContainerRef = useRef<HTMLDivElement>(null)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  // Fetch GeoJSON features for client-side search filtering
  const { geojson } = useMapData(filters.year, filters.propertyType)

  // Extract searchable areas from GeoJSON features
  const searchableAreas: SearchableArea[] = useMemo(() => {
    if (!geojson?.features) return []
    return geojson.features
      .filter((feature) => feature.properties != null)
      .map((feature) => {
        const props = feature.properties as Record<string, string>
        return {
          areaCode: props['area_code'] ?? '',
          name: props['name'] ?? '',
          municipality: props['municipality'] ?? '',
        }
      })
  }, [geojson])

  // Filter areas based on search query
  const searchResults: SearchableArea[] = useMemo(() => {
    if (!searchQuery.trim()) return []
    const query = searchQuery.toLowerCase().trim()
    return searchableAreas
      .filter(
        (area) =>
          area.areaCode.includes(query) ||
          area.name.toLowerCase().includes(query) ||
          area.municipality.toLowerCase().includes(query)
      )
      .slice(0, 8)
  }, [searchQuery, searchableAreas])

  // Select an area from search results
  const handleSelectArea = useCallback(
    (area: SearchableArea) => {
      setSelectedArea({
        id: area.areaCode,
        areaCode: area.areaCode,
        name: area.name,
      })
      setIsSidebarOpen(true)
      setSearchQuery('')
      setIsSearchFocused(false)
      searchInputRef.current?.blur()

      // Find the feature to get its center coordinates for animated fly-to
      const feature = geojson?.features.find(
        (f) => f.properties != null && f.properties['area_code'] === area.areaCode
      )
      if (feature && feature.geometry.type !== 'GeometryCollection') {
        const geom = feature.geometry as { coordinates: number[][][] | number[][][][] }
        const coords = geom.coordinates
        const flatCoords = (coords as number[][][][]).flat(3) as unknown as number[]
        const pairs: number[][] = []
        for (let i = 0; i + 1 < flatCoords.length; i += 2) {
          pairs.push([flatCoords[i], flatCoords[i + 1]])
        }
        if (pairs.length > 0) {
          let sumLng = 0
          let sumLat = 0
          for (const coord of pairs) {
            sumLng += coord[0]
            sumLat += coord[1]
          }
          const centerLng = sumLng / pairs.length
          const centerLat = sumLat / pairs.length

          flyTo({
            longitude: centerLng,
            latitude: centerLat,
            zoom: Math.max(currentZoom, 13),
          })
        }
      }
    },
    [geojson, setSelectedArea, setIsSidebarOpen, flyTo, currentZoom]
  )

  // Handle search on Enter key
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && searchResults.length > 0) {
        handleSelectArea(searchResults[0])
      }
      if (e.key === 'Escape') {
        setSearchQuery('')
        setIsSearchFocused(false)
        searchInputRef.current?.blur()
      }
    },
    [searchResults, handleSelectArea]
  )

  // Close dropdowns when clicking/tapping outside
  useEffect(() => {
    function handleClickOutside(e: PointerEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsSearchFocused(false)
      }
      if (
        yearContainerRef.current &&
        !yearContainerRef.current.contains(e.target as Node)
      ) {
        setIsYearOpen(false)
      }
    }

    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [])

  const showSearchDropdown =
    isSearchFocused && searchQuery.trim().length > 0
  const showNoResults =
    showSearchDropdown && searchResults.length === 0

  return (
    <header className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
      <div className="pointer-events-auto mx-2 mt-2 md:mx-4 md:mt-4">
        {/* Main header bar */}
        <div
          className={cn(
            'bg-bg-primary border-2 border-[#1a1a1a] rounded-xl h-14 md:h-14 px-3 md:px-4',
            'flex items-center gap-3 md:gap-4',
            'shadow-hard-sm'
          )}
        >
          {/* Left: Logo + Brand name */}
          <h1 className="flex-shrink-0 flex items-center gap-2">
            <LogoMark size={isDesktop ? 32 : 28} />
            <span className="font-brand text-xl tracking-tight text-[#1a1a1a] hidden md:inline">
              Neliöt
            </span>
          </h1>

          {/* Search + Year selector — inline on both mobile and desktop */}
          <div className="flex items-center gap-2 md:gap-2 ml-auto flex-1 md:flex-none justify-end">
            {/* Search input */}
            <div ref={searchContainerRef} className="relative flex-1 md:flex-none">
              <div
                className={cn(
                  'neo-press',
                  'flex items-center gap-1.5 md:gap-2 h-10 md:h-9 rounded-lg border-2 bg-bg-primary',
                  'border-[#1a1a1a] shadow-hard-sm',
                  'transition-all duration-200',
                  isDesktop
                    ? isSearchFocused ? 'w-64' : 'w-48'
                    : 'w-full'
                )}
              >
                <Search
                  size={isDesktop ? 14 : 16}
                  className="ml-2.5 md:ml-2.5 text-[#999] md:text-[#1a1a1a] flex-shrink-0"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={isDesktop ? 'Hae postinumeroa...' : 'Hae...'}
                  className={cn(
                    'w-full pr-2 md:pr-2.5 bg-transparent text-[#1a1a1a]',
                    'placeholder:text-[#999] md:placeholder:text-[#666]',
                    'focus:outline-none',
                    isDesktop
                      ? 'text-xs font-mono font-bold'
                      : 'text-sm font-body'
                  )}
                />
                {/* Mobile: clear button when searching */}
                {!isDesktop && searchQuery && (
                  <button
                    type="button"
                    onClick={() => { setSearchQuery(''); searchInputRef.current?.focus() }}
                    className="pr-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#999] hover:text-[#1a1a1a] flex-shrink-0"
                    aria-label="Tyhjennä haku"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>

              {/* Search results dropdown */}
              {showSearchDropdown && (
                <div
                  className={cn(
                    'absolute top-full left-0 right-0 mt-1.5 z-50',
                    'rounded-lg border-2 border-[#1a1a1a] bg-bg-primary',
                    'shadow-hard overflow-hidden',
                    !isDesktop && 'animate-fade-in'
                  )}
                >
                  {showNoResults ? (
                    <SearchNoResults compact={isDesktop} />
                  ) : (
                    searchResults.map((area, i) => (
                      <SearchResultItem
                        key={area.areaCode}
                        area={area}
                        compact={isDesktop}
                        index={isDesktop ? i : undefined}
                        onSelect={handleSelectArea}
                      />
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Year selector */}
            <div ref={yearContainerRef} className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setIsYearOpen((prev) => !prev)}
                aria-label="Valitse vuosi"
                aria-expanded={isYearOpen}
                className={cn(
                  'neo-press',
                  'h-10 md:h-9 px-3 md:px-3 text-sm md:text-xs font-mono font-bold rounded-lg',
                  'border-2 border-[#1a1a1a] bg-pink-baby text-[#1a1a1a]',
                  'shadow-hard-sm',
                  'flex items-center gap-1.5 md:gap-1.5',
                  'focus:outline-none focus:ring-2 focus:ring-pink-baby',
                  'cursor-pointer select-none'
                )}
              >
                {filters.year}
                <ChevronDown size={isDesktop ? 11 : 14} className={cn('transition-transform', isYearOpen && 'rotate-180')} />
              </button>

              {isYearOpen && (
                <div
                  className={cn(
                    'absolute top-full right-0 mt-1.5 z-50',
                    'rounded-lg border-2 border-[#1a1a1a] bg-bg-primary',
                    'shadow-hard overflow-hidden',
                    'min-w-[90px] md:min-w-[80px]',
                  )}
                >
                  {YEARS.map((year, i) => (
                    <button
                      key={year}
                      type="button"
                      onClick={() => {
                        updateFilter('year', year)
                        setIsYearOpen(false)
                      }}
                      className={cn(
                        'w-full px-3 py-2.5 md:py-1.5 text-left',
                        'text-sm md:text-xs font-mono font-bold text-[#1a1a1a]',
                        'hover:bg-pink-baby transition-colors',
                        'focus-visible:outline-none focus-visible:bg-pink-baby',
                        year === filters.year && 'bg-pink-baby text-[#1a1a1a]',
                        'animate-slide-up',
                      )}
                      style={{ animationDelay: `${i * 20}ms`, animationFillMode: 'both' }}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </header>
  )
}
