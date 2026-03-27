'use client'

import { useMapContext } from '@/app/contexts/MapContext'
import { useAreaStats } from '@/app/hooks/useAreaStats'
import { useMediaQuery } from '@/app/hooks/useMediaQuery'
import { StatsPanel } from '@/app/components/sidebar/StatsPanel'
import { BuildingPanel } from '@/app/components/sidebar/BuildingPanel'
import { ComparisonPanel } from '@/app/components/comparison/ComparisonPanel'
import { Sheet } from '@/app/components/ui/sheet'
import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/app/lib/utils'

/**
 * Sidebar – Side panel that displays area details when an area is selected.
 *
 * Desktop (>= 768px): Fixed left panel, w-96 (or w-[720px] in compare mode),
 * slides in from the left.
 * Mobile (< 768px): Bottom Sheet via the existing Sheet component.
 *
 * The panel is only visible when both `isSidebarOpen` is true AND
 * `selectedArea` is not null (or compare mode is active).
 * It fetches full area stats via `useAreaStats`.
 */
export function Sidebar() {
  const {
    selectedArea,
    setSelectedArea,
    comparedArea,
    setComparedArea,
    isCompareMode,
    setIsCompareMode,
    isSidebarOpen,
    setIsSidebarOpen,
    selectedBuilding,
    setSelectedBuilding,
    filters,
  } = useMapContext()

  const isDesktop = useMediaQuery('(min-width: 768px)')

  // Fetch detailed area stats whenever selectedArea or year changes
  const areaCode = selectedArea?.areaCode ?? null
  const { data, isLoading } = useAreaStats(areaCode, filters.year)

  // Determine visibility
  const hasSelectedArea = selectedArea !== null
  const hasComparedArea = comparedArea !== null
  const hasSelectedBuilding = selectedBuilding !== null
  const isComparisonReady = isCompareMode && hasSelectedArea && hasComparedArea
  const isWaitingForSecondArea = isCompareMode && !hasSelectedArea && hasComparedArea
  const isOpen =
    isSidebarOpen &&
    (hasSelectedArea || isCompareMode)

  function handleClose() {
    setIsSidebarOpen(false)
    setSelectedArea(null)
    setSelectedBuilding(null)
    setComparedArea(null)
    setIsCompareMode(false)
  }

  // Determine panel width based on mode
  const panelWidth = isComparisonReady ? 'w-[720px]' : 'w-96'

  // ---- Sidebar content ----
  function renderContent() {
    // Compare mode: both areas selected -> show comparison panel
    if (isComparisonReady) {
      return <ComparisonPanel />
    }

    // Compare mode: waiting for second area click
    if (isWaitingForSecondArea) {
      return (
        <div className="flex flex-col items-center justify-center h-40 gap-4 animate-fade-in">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-sm text-muted-foreground">
              {comparedArea?.name ?? 'Alue 1'} valittu
            </span>
          </div>
          <p className="text-sm text-muted-foreground text-center px-4">
            Klikkaa toista aluetta kartalla vertaillaksesi
          </p>
          <button
            type="button"
            onClick={() => {
              setIsCompareMode(false)
              setSelectedArea(comparedArea)
              setComparedArea(null)
            }}
            className={cn(
              'text-xs text-muted-foreground hover:text-foreground',
              'px-3 py-1.5 rounded-md',
              'hover:bg-muted/50 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            Peruuta vertailu
          </button>
        </div>
      )
    }

    // Normal mode: show stats panel
    return <StatsPanel data={data} isLoading={isLoading} year={filters.year} />
  }

  // ---- Floating building card (both mobile and desktop) ----
  const buildingCard = (
    <AnimatePresence>
      {hasSelectedBuilding && (isDesktop || !isOpen) && (
        <motion.div
          key="building-card"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 340 }}
          className={cn(
            'fixed z-40',
            isDesktop
              ? 'bottom-6 left-4 w-[22rem]'
              : 'bottom-3 left-3 right-3',
          )}
        >
          <div
            className={cn(
              'bg-[#FFFBF5] border-2 border-[#1a1a1a] rounded-xl shadow-hard-sm',
              'max-h-[calc(100vh-8rem)] overflow-y-auto',
              'p-5',
            )}
          >
            <BuildingPanel />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  // ---- Mobile: bottom sheet (for area stats only) ----
  if (!isDesktop) {
    return (
      <>
        <Sheet
          open={isOpen}
          onClose={handleClose}
          side="bottom"
          className={cn('max-h-[80vh]', isComparisonReady && 'max-h-[90vh]')}
        >
          <div className="pb-4">
            {renderContent()}
          </div>
        </Sheet>
        {buildingCard}
      </>
    )
  }

  // ---- Desktop: left-side sliding panel (for area stats) + floating building card ----
  return (
    <>
      <AnimatePresence mode="wait">
        {isOpen && (
          <motion.aside
            key={isComparisonReady ? 'comparison' : 'stats'}
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -20, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className={cn(
              'fixed top-20 left-4 z-30',
              panelWidth,
              'max-h-[calc(100vh-6rem)]',
              'bg-[#FFFBF5]',
              'border-2 border-[#1a1a1a]',
              'rounded-xl',
              'shadow-hard-sm',
              'flex flex-col'
            )}
          >
            {/* Close button (only visible in non-compare mode; compare mode has its own close) */}
            {!isComparisonReady && (
              <button
                type="button"
                onClick={handleClose}
                className={cn(
                  'absolute top-3 right-3 z-10',
                  'h-7 w-7 rounded-md flex items-center justify-center',
                  'text-muted-foreground hover:text-foreground',
                  'hover:bg-muted/50 transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                )}
                aria-label="Sulje sivupaneeli"
              >
                <X size={16} />
              </button>
            )}

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-5 pt-10">
              {renderContent()}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
      {buildingCard}
    </>
  )
}
