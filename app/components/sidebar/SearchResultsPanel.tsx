'use client'

import { useState, useCallback } from 'react'
import { useAISearch } from '@/app/contexts/AISearchContext'
import { useMapContext } from '@/app/contexts/MapContext'
import { cn } from '@/app/lib/utils'
import { formatNumber } from '@/app/lib/formatters'
import { motion, AnimatePresence } from 'framer-motion'
import { useMediaQuery } from '@/app/hooks/useMediaQuery'
import { Sheet } from '@/app/components/ui/sheet'
import { BuildingPanel } from '@/app/components/sidebar/BuildingPanel'
import {
  X,
  Sparkles,
  Building2,
  Loader2,
  ArrowLeft,
} from 'lucide-react'
import type { AISearchResult } from '@/app/types'

/**
 * SearchResultsPanel — Shows AI search results as a list panel.
 *
 * Desktop: Left panel (same position as Sidebar).
 * Mobile: Bottom sheet.
 *
 * Clicking a result flies the map to that building and shows its
 * BuildingPanel inline (replacing the list). A back arrow returns
 * to the results list.
 */
export function SearchResultsPanel() {
  const {
    isActive,
    isLoading,
    error,
    results,
    totalCount,
    filterChips,
    queryText,
    clearSearch,
    removeChip,
  } = useAISearch()

  const {
    flyTo,
    selectedBuilding,
    setSelectedBuilding,
  } = useMapContext()

  const isDesktop = useMediaQuery('(min-width: 768px)')

  // Track which result is being viewed inline (building detail mode)
  const [viewingBuilding, setViewingBuilding] = useState(false)

  const handleSelectResult = useCallback((result: AISearchResult) => {
    if (result.lat && result.lng) {
      flyTo({
        longitude: result.lng,
        latitude: result.lat,
        zoom: 16,
      })
    }
    setSelectedBuilding(result.id)
    setViewingBuilding(true)
  }, [flyTo, setSelectedBuilding])

  const handleBackToResults = useCallback(() => {
    setViewingBuilding(false)
    setSelectedBuilding(null)
  }, [setSelectedBuilding])

  const handleClose = useCallback(() => {
    setViewingBuilding(false)
    setSelectedBuilding(null)
    clearSearch()
  }, [setSelectedBuilding, clearSearch])

  if (!isActive) return null

  // ---- Building detail view (inline) ----
  const buildingDetailContent = (
    <div className="flex flex-col h-full min-h-0">
      {/* Back header */}
      <div className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0 border-b border-[#1a1a1a]/5">
        <button
          type="button"
          onClick={handleBackToResults}
          className={cn(
            'neo-press h-8 w-8 rounded-lg border-2 border-[#1a1a1a]',
            'bg-bg-primary shadow-hard-sm',
            'flex items-center justify-center',
            'text-[#1a1a1a] hover:bg-pink-baby transition-colors',
          )}
          aria-label="Takaisin tuloksiin"
        >
          <ArrowLeft size={14} />
        </button>
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Sparkles size={12} className="text-yellow flex-shrink-0" />
          <span className="text-xs text-muted-foreground truncate">
            {totalCount} osumaa &middot; &quot;{queryText}&quot;
          </span>
        </div>
        {isDesktop && (
          <button
            type="button"
            onClick={handleClose}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex-shrink-0"
            aria-label="Sulje haku"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* BuildingPanel content */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        <BuildingPanel hideClose />
      </div>
    </div>
  )

  // ---- Results list view ----
  const resultsListContent = (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 p-4 pb-2 flex-shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-yellow flex-shrink-0" />
            <h2 className="text-sm font-display font-bold text-foreground">
              {isLoading ? 'Analysoidaan hakua...' : `${totalCount} osumaa`}
            </h2>
          </div>
          {queryText && !isLoading && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              &quot;{queryText}&quot;
            </p>
          )}
        </div>
        {isDesktop && (
          <button
            type="button"
            onClick={handleClose}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex-shrink-0"
            aria-label="Sulje haku"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Filter chips */}
      {filterChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2 flex-shrink-0">
          {filterChips.map((chip, i) => (
            <span
              key={`${chip}-${i}`}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
                'bg-yellow/15 border border-yellow/30 text-xs text-foreground',
              )}
            >
              {chip}
              <button
                type="button"
                onClick={() => removeChip(i)}
                className="text-muted-foreground hover:text-foreground ml-0.5"
                aria-label={`Poista ${chip}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={24} className="text-yellow animate-spin" />
            <p className="text-xs text-muted-foreground">Haetaan rakennuksia...</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <button
            type="button"
            onClick={handleClose}
            className="text-xs text-muted-foreground hover:text-foreground mt-2"
          >
            Sulje
          </button>
        </div>
      )}

      {/* Results list */}
      {!isLoading && !error && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {results.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Building2 size={32} className="mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Ei osumia</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Kokeile laajentaa hakuehtoja
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#1a1a1a]/5">
              {results.map((result, i) => (
                <ResultRow
                  key={result.id}
                  result={result}
                  index={i}
                  onSelect={handleSelectResult}
                />
              ))}
            </div>
          )}

          {results.length > 0 && results.length < totalCount && (
            <div className="px-4 py-3 text-center">
              <p className="text-[11px] text-muted-foreground">
                Näytetään {results.length} / {totalCount} osumaa
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )

  // Choose which view to show
  const showBuildingDetail = viewingBuilding && selectedBuilding
  const content = showBuildingDetail ? buildingDetailContent : resultsListContent

  // Mobile: bottom sheet
  if (!isDesktop) {
    return (
      <Sheet
        open={isActive}
        onClose={handleClose}
        side="bottom"
        className={cn('max-h-[80vh]', showBuildingDetail && 'max-h-[85vh]')}
      >
        {content}
      </Sheet>
    )
  }

  // Desktop: left panel
  return (
    <AnimatePresence>
      {isActive && (
        <motion.aside
          key="ai-search-results"
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -20, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className={cn(
            'fixed top-20 left-4 z-30',
            'w-96',
            'max-h-[calc(100vh-6rem)]',
            'bg-[#FFFBF5]',
            'border-2 border-[#1a1a1a]',
            'rounded-xl',
            'shadow-hard-sm',
            'flex flex-col overflow-hidden',
          )}
        >
          {content}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------------------
// Result row
// ---------------------------------------------------------------------------

function ResultRow({
  result,
  index,
  onSelect,
}: {
  result: AISearchResult
  index: number
  onSelect: (r: AISearchResult) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(result)}
      className={cn(
        'w-full px-4 py-3 text-left',
        'hover:bg-yellow/5 transition-colors',
        'focus-visible:outline-none focus-visible:bg-yellow/10',
        'animate-slide-up cursor-pointer',
      )}
      style={{ animationDelay: `${Math.min(index, 10) * 30}ms`, animationFillMode: 'both' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">
            {result.address ?? `${result.area_name}`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {result.area_code} {result.area_name}
            {result.municipality && `, ${result.municipality}`}
          </p>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground/70">
            {result.construction_year && (
              <span>{result.construction_year}</span>
            )}
            {result.floor_count && (
              <span>{result.floor_count} krs</span>
            )}
            {result.apartment_count && (
              <span>{result.apartment_count} as.</span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          {result.estimated_price_per_sqm != null ? (
            <>
              <p className="text-sm font-bold tabular-nums text-foreground">
                {formatNumber(Math.round(result.estimated_price_per_sqm))}
              </p>
              <p className="text-[11px] text-muted-foreground">€/m²</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">–</p>
          )}
        </div>
      </div>
    </button>
  )
}
