'use client'

import { useMapContext } from '@/app/contexts/MapContext'
import { useAreaStats } from '@/app/hooks/useAreaStats'
import { useMediaQuery } from '@/app/hooks/useMediaQuery'
import { StatsPanel } from '@/app/components/sidebar/StatsPanel'
import { ComparisonPanel } from '@/app/components/comparison/ComparisonPanel'
import { Sheet } from '@/app/components/ui/sheet'
import { X, GitCompareArrows } from 'lucide-react'
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
    filters,
  } = useMapContext()

  const isDesktop = useMediaQuery('(min-width: 768px)')

  // Fetch detailed area stats whenever selectedArea or year changes
  const areaCode = selectedArea?.areaCode ?? null
  const { data, isLoading } = useAreaStats(areaCode, filters.year)

  // Determine visibility
  const hasSelectedArea = selectedArea !== null
  const hasComparedArea = comparedArea !== null
  const isComparisonReady = isCompareMode && hasSelectedArea && hasComparedArea
  const isWaitingForSecondArea = isCompareMode && !hasSelectedArea && hasComparedArea
  const isOpen =
    isSidebarOpen &&
    (hasSelectedArea || isCompareMode)

  // Enter compare mode: current area becomes compared, clear selected for next click
  function handleStartCompare() {
    if (!selectedArea) return
    setComparedArea(selectedArea)
    setSelectedArea(null)
    setIsCompareMode(true)
  }

  function handleClose() {
    setIsSidebarOpen(false)
    setSelectedArea(null)
    setComparedArea(null)
    setIsCompareMode(false)
  }

  // Determine panel width based on mode
  const panelWidth = isComparisonReady ? 'w-[720px]' : 'w-96'
  const initialX = isComparisonReady ? -720 : -384

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

    // Normal mode: show stats panel with compare button
    return (
      <div className="space-y-4">
        <StatsPanel data={data} isLoading={isLoading} />

        {/* Compare button - only show when area is selected and data loaded */}
        {hasSelectedArea && !isLoading && data && (
          <div className="pt-2">
            <button
              type="button"
              onClick={handleStartCompare}
              className={cn(
                'w-full flex items-center justify-center gap-2',
                'px-4 py-2.5 rounded-lg',
                'bg-blue-500/10 hover:bg-blue-500/20',
                'text-blue-400 hover:text-blue-300',
                'border border-blue-500/20 hover:border-blue-500/30',
                'transition-all duration-200',
                'text-sm font-medium',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
            >
              <GitCompareArrows size={16} />
              Vertaa toiseen alueeseen
            </button>
          </div>
        )}
      </div>
    )
  }

  // ---- Mobile: bottom sheet ----
  if (!isDesktop) {
    return (
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
    )
  }

  // ---- Desktop: left-side sliding panel ----
  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.aside
          key={isComparisonReady ? 'comparison' : 'stats'}
          initial={{ x: initialX, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: initialX, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className={cn(
            'fixed top-0 left-0 z-30',
            panelWidth,
            'h-full',
            'bg-bg-secondary/95 backdrop-blur-xl',
            'border-r border-border',
            'shadow-glass',
            'flex flex-col'
          )}
        >
          {/* Close button (only visible in non-compare mode; compare mode has its own close) */}
          {!isComparisonReady && (
            <button
              type="button"
              onClick={handleClose}
              className={cn(
                'absolute top-4 right-4 z-10',
                'h-8 w-8 rounded-md flex items-center justify-center',
                'text-muted-foreground hover:text-foreground',
                'hover:bg-muted/50 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
              aria-label="Sulje sivupaneeli"
            >
              <X size={18} />
            </button>
          )}

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-6 pt-14">
            {renderContent()}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
