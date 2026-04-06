'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Search, X, ChevronDown, MapPin, Navigation, Sparkles } from 'lucide-react'
import { useMapContext } from '@/app/contexts/MapContext'
import { useAISearch } from '@/app/contexts/AISearchContext'
import { useMediaQuery } from '@/app/hooks/useMediaQuery'
import { useMapData } from '@/app/hooks/useMapData'
import { LogoMark } from '@/app/components/brand/LogoMark'
import { CITIES, CityConfig } from '@/app/lib/cities'
import { cn } from '@/app/lib/utils'
import { searchAddresses, type GeocodingResult } from '@/app/lib/geocoding'
import { UserMenu } from '@/app/components/UserMenu'
import { trackAreaClick, trackCityClick, trackAddressClick, trackFilterChange, trackSearch } from '@/app/lib/analytics'

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
// Helpers
// ---------------------------------------------------------------------------

/** Highlight matching substring within text. */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow/40 text-inherit rounded-sm px-px">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025] as const

/** Shared "no results" empty state */
function SearchNoResults({ compact }: { compact: boolean }) {
  return (
    <div className={cn(
      'px-3 py-4 text-muted-foreground text-center',
      compact ? 'text-xs animate-fade-in' : 'text-sm',
    )}>
      <p className="font-medium">Ei tuloksia</p>
      <p className={cn('mt-0.5', compact ? 'text-[10px]' : 'text-sm')}>
        Kokeile osoitetta, postinumeroa tai alueen nimeä
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

  const { search: aiSearch, isLoading: isAILoading } = useAISearch()

  const isDesktop = useMediaQuery('(min-width: 768px)')

  // Year picker state
  const [isYearOpen, setIsYearOpen] = useState(false)
  const yearContainerRef = useRef<HTMLDivElement>(null)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const resultsContainerRef = useRef<HTMLDivElement>(null)

  // Fetch GeoJSON features for client-side search filtering
  const { geojson } = useMapData(filters.year, filters.propertyType)

  // Extract searchable areas from GeoJSON features (deduplicated by area_code)
  const searchableAreas: SearchableArea[] = useMemo(() => {
    if (!geojson?.features) return []
    const seen = new Set<string>()
    const areas: SearchableArea[] = []
    for (const feature of geojson.features) {
      if (!feature.properties) continue
      const props = feature.properties as Record<string, string>
      const code = props['area_code'] ?? ''
      if (!code || seen.has(code)) continue
      seen.add(code)
      areas.push({
        areaCode: code,
        name: props['name'] ?? '',
        municipality: props['municipality'] ?? '',
      })
    }
    return areas
  }, [geojson])

  // Filter cities based on search query
  const cityResults: CityConfig[] = useMemo(() => {
    if (!searchQuery.trim()) return []
    const query = searchQuery.toLowerCase().trim()
    return CITIES.filter((city) => city.name.toLowerCase().includes(query))
  }, [searchQuery])

  // Filter areas based on search query with relevance sorting
  const searchResults: SearchableArea[] = useMemo(() => {
    if (!searchQuery.trim()) return []
    const query = searchQuery.toLowerCase().trim()
    const maxResults = cityResults.length > 0 ? 6 : 8

    // Score each matching area for relevance ranking:
    // Lower score = higher relevance (sorted ascending)
    const scored: { area: SearchableArea; score: number }[] = []

    for (const area of searchableAreas) {
      const code = area.areaCode
      const name = area.name.toLowerCase()
      const muni = area.municipality.toLowerCase()

      let score = -1 // -1 means no match

      if (code === query) {
        score = 0 // Exact postal code match
      } else if (code.startsWith(query)) {
        score = 1 // Postal code prefix
      } else if (name.toLowerCase() === query) {
        score = 2 // Exact name match
      } else if (name.startsWith(query)) {
        score = 3 // Name starts with query
      } else if (name.includes(query)) {
        score = 4 // Name contains query
      } else if (code.includes(query)) {
        score = 5 // Postal code contains query
      } else if (muni.startsWith(query)) {
        score = 6 // Municipality starts with query
      } else if (muni.includes(query)) {
        score = 7 // Municipality contains query
      }

      if (score >= 0) {
        scored.push({ area, score })
      }
    }

    return scored
      .sort((a, b) => a.score - b.score || a.area.areaCode.localeCompare(b.area.areaCode))
      .slice(0, maxResults)
      .map((s) => s.area)
  }, [searchQuery, searchableAreas, cityResults.length])

  // Debounced address geocoding
  const [addressResults, setAddressResults] = useState<GeocodingResult[]>([])
  const [isAddressLoading, setIsAddressLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  // Track which query the address results belong to, so stale results are hidden
  const [addressResultsQuery, setAddressResultsQuery] = useState('')

  useEffect(() => {
    const query = searchQuery.trim()
    if (query.length < 3) {
      setAddressResults([])
      setAddressResultsQuery('')
      setIsAddressLoading(false)
      return
    }

    // Skip pure numeric queries (postal codes) — existing search handles those
    if (/^\d+$/.test(query)) {
      setAddressResults([])
      setAddressResultsQuery('')
      return
    }

    setIsAddressLoading(true)

    // Debounce: wait 350ms before calling Nominatim
    const timer = setTimeout(() => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      searchAddresses(query, controller.signal)
        .then((results) => {
          if (!controller.signal.aborted) {
            setAddressResults(results)
            setAddressResultsQuery(query)
            setIsAddressLoading(false)
            trackSearch({ query, areaResults: searchResults.length, addressResults: results.length, cityResults: cityResults.length })
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setAddressResults([])
            setAddressResultsQuery('')
            setIsAddressLoading(false)
          }
        })
    }, 350)

    return () => {
      clearTimeout(timer)
      abortRef.current?.abort()
    }
  }, [searchQuery, searchResults.length, cityResults.length])

  // Close search and reset state (shared by all select handlers)
  const closeSearch = useCallback(() => {
    setSearchQuery('')
    setIsSearchFocused(false)
    setIsMobileSearchOpen(false)
    searchInputRef.current?.blur()
  }, [])

  // Select an address from geocoding results — fly to its coordinates
  const handleSelectAddress = useCallback(
    (result: GeocodingResult) => {
      closeSearch()
      setAddressResults([])
      trackAddressClick({ label: result.shortLabel ?? '' })

      flyTo({
        longitude: result.longitude,
        latitude: result.latitude,
        zoom: 15,
      })
    },
    [flyTo, closeSearch]
  )

  // Select a city from search results — fly to its bounding box
  const handleSelectCity = useCallback(
    (city: CityConfig) => {
      closeSearch()
      trackCityClick({ cityName: city.name })

      const [west, south, east, north] = city.bbox
      flyTo({
        longitude: (west + east) / 2,
        latitude: (south + north) / 2,
        zoom: 12,
      })
    },
    [flyTo, closeSearch]
  )

  // Select an area from search results
  const handleSelectArea = useCallback(
    (area: SearchableArea) => {
      setSelectedArea({
        id: area.areaCode,
        areaCode: area.areaCode,
        name: area.name,
      })
      setIsSidebarOpen(true)
      closeSearch()
      trackAreaClick({ areaCode: area.areaCode, areaName: area.name, municipality: area.municipality })

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
    [geojson, setSelectedArea, setIsSidebarOpen, flyTo, currentZoom, closeSearch]
  )

  // Only show address results if they belong to the current (or similar) query
  const currentQuery = searchQuery.trim().toLowerCase()
  const filteredAddressResults = useMemo(() => {
    if (!addressResultsQuery || !currentQuery) return []
    // Show address results only if current query starts with, or matches, the query that produced them
    if (!currentQuery.startsWith(addressResultsQuery.toLowerCase()) &&
        !addressResultsQuery.toLowerCase().startsWith(currentQuery)) {
      return []
    }
    return addressResults
  }, [addressResults, addressResultsQuery, currentQuery])

  // Build a flat list of all results for unified keyboard navigation
  type ResultItem =
    | { type: 'city'; city: CityConfig }
    | { type: 'area'; area: SearchableArea }
    | { type: 'address'; address: GeocodingResult }

  const allResults: ResultItem[] = useMemo(() => {
    const items: ResultItem[] = []
    for (const city of cityResults) items.push({ type: 'city', city })
    for (const area of searchResults) items.push({ type: 'area', area })
    for (const addr of filteredAddressResults) items.push({ type: 'address', address: addr })
    return items
  }, [cityResults, searchResults, filteredAddressResults])

  // Reset activeIndex when results change
  useEffect(() => {
    setActiveIndex(0)
  }, [allResults.length, searchQuery])

  // Select the result at a given index
  const selectResultAt = useCallback((index: number) => {
    const item = allResults[index]
    if (!item) return
    if (item.type === 'city') handleSelectCity(item.city)
    else if (item.type === 'area') handleSelectArea(item.area)
    else handleSelectAddress(item.address)
  }, [allResults, handleSelectCity, handleSelectArea, handleSelectAddress])

  // Handle keyboard navigation in search results
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((prev) => Math.min(prev + 1, allResults.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        if (allResults.length > 0) {
          selectResultAt(activeIndex)
        }
      }
      // If no standard results but query looks like natural language, trigger AI search
      if (e.key === 'Enter' && !cityResults.length && !searchResults.length && !filteredAddressResults.length) {
        const q = searchQuery.trim()
        if (q.length >= 5 && q.includes(' ')) {
          closeSearch()
          aiSearch(q)
          return
        }
      }
      if (e.key === 'Escape') {
        closeSearch()
      }
    },
    [allResults, activeIndex, selectResultAt, closeSearch, cityResults, searchResults, filteredAddressResults, searchQuery, aiSearch]
  )

  // Close dropdowns when clicking/tapping outside
  useEffect(() => {
    function handleClickOutside(e: PointerEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsSearchFocused(false)
        setIsMobileSearchOpen(false)
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

  // Scroll active result into view
  useEffect(() => {
    if (!resultsContainerRef.current) return
    const el = resultsContainerRef.current.querySelector('[data-active="true"]')
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const showSearchDropdown =
    isSearchFocused && searchQuery.trim().length > 0
  const hasAnyResults = cityResults.length > 0 || searchResults.length > 0 || filteredAddressResults.length > 0
  const showNoResults =
    showSearchDropdown && !hasAnyResults && !isAddressLoading

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
          {/* Left: Logo + Brand name → links to info page */}
          <Link
            href="/faq"
            className="flex-shrink-0 flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <LogoMark size={isDesktop ? 32 : 28} />
            <span className="font-brand text-xl tracking-tight text-[#1a1a1a] hidden md:inline">
              Neliöt
            </span>
          </Link>

          {/* Search + Year selector — inline on both mobile and desktop */}
          <div className="flex items-center gap-2 md:gap-2 ml-auto flex-1 md:flex-none justify-end">
            {/* Mobile: search icon button (collapsed) */}
            {!isDesktop && !isMobileSearchOpen && (
              <button
                type="button"
                onClick={() => {
                  setIsMobileSearchOpen(true)
                  // Auto-focus the input after it renders
                  setTimeout(() => searchInputRef.current?.focus(), 50)
                }}
                aria-label="Avaa haku"
                className={cn(
                  'neo-press',
                  'h-10 w-10 rounded-lg border-2 bg-bg-primary',
                  'border-[#1a1a1a] shadow-hard-sm',
                  'flex items-center justify-center',
                  'text-[#1a1a1a]',
                )}
              >
                <Search size={18} />
              </button>
            )}

            {/* Search input — always visible on desktop, expandable on mobile */}
            {(isDesktop || isMobileSearchOpen) && (
              <div ref={searchContainerRef} className={cn('relative', isDesktop ? 'flex-none' : 'flex-1 animate-fade-in')}>
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
                    placeholder="Hae..."
                    className={cn(
                      'w-full pr-2 md:pr-2.5 bg-transparent text-[#1a1a1a]',
                      'placeholder:text-[#999] md:placeholder:text-[#666]',
                      'focus:outline-none',
                      isDesktop
                        ? 'text-xs font-mono font-bold'
                        : 'text-sm font-body'
                    )}
                  />
                  {/* Close / clear button */}
                  {!isDesktop && (
                    <button
                      type="button"
                      onClick={() => {
                        if (searchQuery) {
                          setSearchQuery('')
                          searchInputRef.current?.focus()
                        } else {
                          closeSearch()
                        }
                      }}
                      className="pr-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#999] hover:text-[#1a1a1a] flex-shrink-0"
                      aria-label={searchQuery ? 'Tyhjennä haku' : 'Sulje haku'}
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>

                {/* Search results dropdown */}
                {showSearchDropdown && (
                  <div
                    ref={resultsContainerRef}
                    className={cn(
                      'absolute top-full left-0 right-0 mt-1.5 z-50',
                      'rounded-lg border-2 border-[#1a1a1a] bg-bg-primary',
                      'shadow-hard overflow-hidden max-h-[360px] overflow-y-auto',
                      !isDesktop && 'animate-fade-in'
                    )}
                    role="listbox"
                  >
                    {showNoResults ? (
                      <SearchNoResults compact={isDesktop} />
                    ) : (
                      <>
                        {(() => {
                          let idx = 0
                          const q = searchQuery.trim()
                          const nodes: React.ReactNode[] = []

                          // City results
                          cityResults.forEach((city, i) => {
                            const globalIdx = idx++
                            const isActive = globalIdx === activeIndex
                            nodes.push(
                              <button
                                key={`city-${city.name}`}
                                type="button"
                                data-active={isActive}
                                onClick={() => handleSelectCity(city)}
                                onPointerEnter={() => setActiveIndex(globalIdx)}
                                role="option"
                                aria-selected={isActive}
                                className={cn(
                                  'w-full px-3 text-left',
                                  'flex items-center gap-2',
                                  isDesktop ? 'py-2 text-xs' : 'py-3 text-sm',
                                  'text-[#1a1a1a]',
                                  'transition-colors',
                                  isActive ? 'bg-pink-baby' : 'hover:bg-pink-baby/50',
                                  'focus-visible:outline-none',
                                  isDesktop && 'animate-slide-up',
                                )}
                                style={isDesktop ? { animationDelay: `${i * 30}ms`, animationFillMode: 'both' } : undefined}
                              >
                                <MapPin size={isDesktop ? 12 : 14} className="text-[#999] flex-shrink-0" />
                                <span className="font-medium"><HighlightMatch text={city.name} query={q} /></span>
                                <span className={cn('text-[#999] ml-auto flex-shrink-0', isDesktop ? 'text-xs' : 'text-sm')}>
                                  Kaupunki
                                </span>
                              </button>
                            )
                          })

                          // Divider between cities and areas
                          if (cityResults.length > 0 && searchResults.length > 0) {
                            nodes.push(<div key="div-city-area" className="border-t border-[#e5e5e5]" />)
                          }

                          // Area results
                          searchResults.forEach((area, i) => {
                            const globalIdx = idx++
                            const isActive = globalIdx === activeIndex
                            nodes.push(
                              <button
                                key={`area-${area.areaCode}`}
                                type="button"
                                data-active={isActive}
                                onClick={() => handleSelectArea(area)}
                                onPointerEnter={() => setActiveIndex(globalIdx)}
                                role="option"
                                aria-selected={isActive}
                                className={cn(
                                  'w-full px-3 text-left',
                                  'flex items-center gap-2',
                                  isDesktop ? 'py-2 text-xs' : 'py-3 text-sm',
                                  'text-[#1a1a1a]',
                                  'transition-colors',
                                  isActive ? 'bg-pink-baby' : 'hover:bg-pink-baby/50',
                                  'focus-visible:outline-none',
                                  isDesktop && 'animate-slide-up',
                                )}
                                style={isDesktop ? { animationDelay: `${(i + cityResults.length) * 30}ms`, animationFillMode: 'both' } : undefined}
                              >
                                <span className={cn('font-mono text-[#999] flex-shrink-0', !isDesktop && 'text-sm')} data-number>
                                  <HighlightMatch text={area.areaCode} query={q} />
                                </span>
                                <span className="truncate"><HighlightMatch text={area.name} query={q} /></span>
                                <span className={cn('text-[#999] ml-auto flex-shrink-0', !isDesktop && 'text-sm')}>
                                  <HighlightMatch text={area.municipality} query={q} />
                                </span>
                              </button>
                            )
                          })

                          // Divider before addresses
                          if ((cityResults.length > 0 || searchResults.length > 0) && filteredAddressResults.length > 0) {
                            nodes.push(<div key="div-addr" className="border-t border-[#e5e5e5]" />)
                          }

                          // Address results
                          filteredAddressResults.forEach((result, i) => {
                            const globalIdx = idx++
                            const isActive = globalIdx === activeIndex
                            nodes.push(
                              <button
                                key={`addr-${result.latitude}-${result.longitude}-${i}`}
                                type="button"
                                data-active={isActive}
                                onClick={() => handleSelectAddress(result)}
                                onPointerEnter={() => setActiveIndex(globalIdx)}
                                role="option"
                                aria-selected={isActive}
                                className={cn(
                                  'w-full px-3 text-left',
                                  'flex items-center gap-2',
                                  isDesktop ? 'py-2 text-xs' : 'py-3 text-sm',
                                  'text-[#1a1a1a]',
                                  'transition-colors',
                                  isActive ? 'bg-pink-baby' : 'hover:bg-pink-baby/50',
                                  'focus-visible:outline-none',
                                  isDesktop && 'animate-slide-up',
                                )}
                                style={isDesktop ? { animationDelay: `${(i + cityResults.length + searchResults.length) * 30}ms`, animationFillMode: 'both' } : undefined}
                              >
                                <Navigation size={isDesktop ? 12 : 14} className="text-[#999] flex-shrink-0" />
                                <span className="truncate">{result.shortLabel}</span>
                                <span className={cn('text-[#999] ml-auto flex-shrink-0', isDesktop ? 'text-xs' : 'text-sm')}>
                                  Osoite
                                </span>
                              </button>
                            )
                          })

                          // Loading indicator
                          if (isAddressLoading && !hasAnyResults) {
                            nodes.push(
                              <div key="loading" className={cn(
                                'px-3 py-3 text-muted-foreground text-center',
                                isDesktop ? 'text-xs' : 'text-sm',
                              )}>
                                Haetaan osoitteita...
                              </div>
                            )
                          }

                          return nodes
                        })()}
                      </>
                    )}
                    {/* AI search option — show when query looks like natural language */}
                    {searchQuery.trim().length >= 5 && searchQuery.trim().includes(' ') && (
                      <>
                        <div className="border-t border-[#e5e5e5]" />
                        <button
                          type="button"
                          onClick={() => {
                            const q = searchQuery.trim()
                            closeSearch()
                            aiSearch(q)
                          }}
                          disabled={isAILoading}
                          className={cn(
                            'w-full px-3 text-left',
                            'flex items-center gap-2',
                            isDesktop ? 'py-2.5 text-xs' : 'py-3 text-sm',
                            'text-[#1a1a1a]',
                            'hover:bg-yellow/20 transition-colors',
                            'focus-visible:outline-none focus-visible:bg-yellow/20',
                            'disabled:opacity-50',
                          )}
                        >
                          <Sparkles size={isDesktop ? 13 : 15} className="text-yellow flex-shrink-0" />
                          <span className="flex-1">
                            <span className="font-medium">Hae tekoälyllä</span>
                            <span className="text-[#999] ml-1.5 truncate">
                              &quot;{searchQuery.trim().length > 30
                                ? searchQuery.trim().slice(0, 30) + '...'
                                : searchQuery.trim()}&quot;
                            </span>
                          </span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Year selector — desktop only; mobile defaults to latest year */}
            <div ref={yearContainerRef} className="relative flex-shrink-0 hidden md:block">
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
                        trackFilterChange({ filterType: 'year', value: year })
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

            {/* User menu */}
            <UserMenu />
          </div>
        </div>

      </div>
    </header>
  )
}
