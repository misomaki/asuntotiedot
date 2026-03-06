'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Search, Menu, X } from 'lucide-react'
import { useMapContext } from '@/app/contexts/MapContext'
import { useMediaQuery } from '@/app/hooks/useMediaQuery'
import { useMapData } from '@/app/hooks/useMapData'
import { FilterBar } from '@/app/components/sidebar/FilterBar'
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

type PropertyTypeOption = 'kerrostalo' | 'rivitalo' | 'omakotitalo'

interface PropertyTypeButton {
  value: PropertyTypeOption
  label: string
  shortLabel: string
}

const PROPERTY_TYPE_OPTIONS: PropertyTypeButton[] = [
  { value: 'kerrostalo', label: 'Kerrostalo', shortLabel: 'Kerros.' },
  { value: 'rivitalo', label: 'Rivitalo', shortLabel: 'Rivi.' },
  { value: 'omakotitalo', label: 'Omakotitalo', shortLabel: 'OKT' },
]

// ---------------------------------------------------------------------------
// Header component
// ---------------------------------------------------------------------------

/**
 * Header – Floating header bar at the top of the map.
 *
 * Contains the app logo, filter controls (year + property type), and a
 * search input for finding postal code areas. On mobile it collapses to
 * just the logo and a hamburger menu that opens the filter controls.
 */
export function Header() {
  const {
    filters,
    updateFilter,
    setSelectedArea,
    setIsSidebarOpen,
    viewport,
    setViewport,
  } = useMapContext()

  const isDesktop = useMediaQuery('(min-width: 768px)')

  // Mobile menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

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
      .slice(0, 8) // Limit to 8 results
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

      // Find the feature to get its center coordinates for fly-to
      const feature = geojson?.features.find(
        (f) => f.properties != null && f.properties['area_code'] === area.areaCode
      )
      if (feature && feature.geometry.type !== 'GeometryCollection') {
        // Calculate rough center from geometry coordinates
        const geom = feature.geometry as { coordinates: number[][][] | number[][][][] }
        const coords = geom.coordinates
        const flatCoords = (coords as number[][][][]).flat(3) as unknown as number[]
        // flatCoords is now [lng, lat, lng, lat, ...]
        // Re-chunk as coordinate pairs
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

          setViewport({
            ...viewport,
            longitude: centerLng,
            latitude: centerLat,
            zoom: Math.max(viewport.zoom, 13),
          })
        }
      }
    },
    [geojson, setSelectedArea, setIsSidebarOpen, setViewport, viewport]
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

  // Close search dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsSearchFocused(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close mobile menu when switching to desktop
  useEffect(() => {
    if (isDesktop) {
      setIsMobileMenuOpen(false)
    }
  }, [isDesktop])

  const showSearchDropdown =
    isSearchFocused && searchQuery.trim().length > 0 && searchResults.length > 0

  return (
    <header className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
      <div className="pointer-events-auto mx-3 mt-3 md:mx-4 md:mt-4">
        {/* Main header bar */}
        <div
          className={cn(
            'glass rounded-xl h-14 px-4',
            'flex items-center gap-4',
            'shadow-glass-sm'
          )}
        >
          {/* Left: Logo / title */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <h1 className="font-heading font-bold text-lg text-foreground tracking-tight">
              <span className="text-gradient">Asuntokartta</span>
            </h1>
          </div>

          {/* Center: Filter controls (desktop only) */}
          {isDesktop && (
            <div className="flex items-center gap-3 flex-1 justify-center">
              {/* Year selector */}
              <select
                value={filters.year}
                onChange={(e) => updateFilter('year', Number(e.target.value))}
                aria-label="Valitse vuosi"
                className={cn(
                  'h-8 px-2 text-xs rounded-lg',
                  'border border-border bg-bg-secondary text-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                  'transition-colors cursor-pointer'
                )}
              >
                {YEARS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>

              {/* Property type buttons */}
              <div
                className="flex items-center rounded-lg border border-border bg-bg-secondary p-0.5"
                role="group"
                aria-label="Asuntotyyppi"
              >
                {PROPERTY_TYPE_OPTIONS.map((option) => {
                  const isActive = filters.propertyType === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateFilter('propertyType', option.value)}
                      aria-pressed={isActive}
                      className={cn(
                        'px-2.5 py-1 text-[11px] rounded-md font-medium',
                        'transition-all duration-200',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isActive
                          ? 'bg-accent text-white shadow-glow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      )}
                    >
                      {option.shortLabel}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Right: Search input (desktop) / Hamburger (mobile) */}
          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            {isDesktop ? (
              <div ref={searchContainerRef} className="relative">
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-lg border bg-bg-secondary',
                    'transition-all duration-200',
                    isSearchFocused
                      ? 'border-accent w-64'
                      : 'border-border w-48'
                  )}
                >
                  <Search
                    size={14}
                    className="ml-2.5 text-muted-foreground flex-shrink-0"
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Hae postinumeroa..."
                    className={cn(
                      'w-full h-8 pr-2.5 text-xs bg-transparent text-foreground',
                      'placeholder:text-muted-foreground',
                      'focus:outline-none'
                    )}
                  />
                </div>

                {/* Search results dropdown */}
                {showSearchDropdown && (
                  <div
                    className={cn(
                      'absolute top-full left-0 right-0 mt-1.5',
                      'rounded-lg border border-border bg-bg-secondary',
                      'shadow-glass overflow-hidden',
                      'animate-fade-in'
                    )}
                  >
                    {searchResults.map((area) => (
                      <button
                        key={area.areaCode}
                        type="button"
                        onClick={() => handleSelectArea(area)}
                        className={cn(
                          'w-full px-3 py-2 text-left',
                          'flex items-center gap-2',
                          'text-xs text-foreground',
                          'hover:bg-muted/50 transition-colors',
                          'focus-visible:outline-none focus-visible:bg-muted/50'
                        )}
                      >
                        <span
                          className="font-mono text-muted-foreground flex-shrink-0"
                          data-number
                        >
                          {area.areaCode}
                        </span>
                        <span className="truncate">{area.name}</span>
                        <span className="text-muted-foreground ml-auto flex-shrink-0">
                          {area.municipality}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen((prev) => !prev)}
                className={cn(
                  'h-8 w-8 rounded-md flex items-center justify-center',
                  'text-muted-foreground hover:text-foreground',
                  'hover:bg-muted/50 transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                )}
                aria-label={isMobileMenuOpen ? 'Sulje valikko' : 'Avaa valikko'}
                aria-expanded={isMobileMenuOpen}
              >
                {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            )}
          </div>
        </div>

        {/* Mobile expanded menu */}
        {!isDesktop && isMobileMenuOpen && (
          <div
            className={cn(
              'glass rounded-xl mt-2 p-4',
              'shadow-glass-sm',
              'space-y-3',
              'animate-slide-down'
            )}
          >
            {/* Mobile search */}
            <div ref={searchContainerRef} className="relative">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-secondary">
                <Search
                  size={14}
                  className="ml-2.5 text-muted-foreground flex-shrink-0"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Hae postinumeroa..."
                  className={cn(
                    'w-full h-9 pr-2.5 text-sm bg-transparent text-foreground',
                    'placeholder:text-muted-foreground',
                    'focus:outline-none'
                  )}
                />
              </div>

              {/* Mobile search results dropdown */}
              {showSearchDropdown && (
                <div
                  className={cn(
                    'absolute top-full left-0 right-0 mt-1.5 z-50',
                    'rounded-lg border border-border bg-bg-secondary',
                    'shadow-glass overflow-hidden',
                    'animate-fade-in'
                  )}
                >
                  {searchResults.map((area) => (
                    <button
                      key={area.areaCode}
                      type="button"
                      onClick={() => {
                        handleSelectArea(area)
                        setIsMobileMenuOpen(false)
                      }}
                      className={cn(
                        'w-full px-3 py-2.5 text-left',
                        'flex items-center gap-2',
                        'text-sm text-foreground',
                        'hover:bg-muted/50 transition-colors',
                        'focus-visible:outline-none focus-visible:bg-muted/50'
                      )}
                    >
                      <span
                        className="font-mono text-muted-foreground flex-shrink-0"
                        data-number
                      >
                        {area.areaCode}
                      </span>
                      <span className="truncate">{area.name}</span>
                      <span className="text-muted-foreground ml-auto flex-shrink-0 text-xs">
                        {area.municipality}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Mobile filters */}
            <FilterBar compact={false} />
          </div>
        )}
      </div>
    </header>
  )
}
