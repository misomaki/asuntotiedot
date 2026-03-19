'use client'

import { useMapContext } from '@/app/contexts/MapContext'
import { cn } from '@/app/lib/utils'

const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025] as const

interface FilterBarProps {
  /** Compact mode for use in the header bar */
  compact?: boolean
}

/**
 * FilterBar – year selector.
 * Updates the shared MapContext filters.
 * Supports a compact mode (smaller controls) for header embedding.
 */
export function FilterBar({ compact = false }: FilterBarProps) {
  const { filters, updateFilter } = useMapContext()

  return (
    <div
      className={cn(
        'flex items-center gap-3',
        compact ? 'flex-row' : 'flex-col sm:flex-row w-full'
      )}
    >
      {/* Year selector */}
      <select
        value={filters.year}
        onChange={(e) => updateFilter('year', Number(e.target.value))}
        aria-label="Valitse vuosi"
        className={cn(
          'rounded-lg border-2 border-[#1a1a1a] bg-[#FFFBF5] text-[#1a1a1a] font-mono font-bold',
          'focus:outline-none focus:ring-2 focus:ring-pink',
          'transition-colors cursor-pointer shadow-hard-sm',
          compact
            ? 'h-8 px-2 text-xs'
            : 'h-10 px-3 text-sm'
        )}
      >
        {YEARS.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  )
}
