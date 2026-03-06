'use client'

import { useMapContext } from '@/app/contexts/MapContext'
import { cn } from '@/app/lib/utils'

type PropertyTypeOption = 'kerrostalo' | 'rivitalo' | 'omakotitalo'

interface PropertyTypeButton {
  value: PropertyTypeOption
  label: string
}

const PROPERTY_TYPE_OPTIONS: PropertyTypeButton[] = [
  { value: 'kerrostalo', label: 'Kerrostalo' },
  { value: 'rivitalo', label: 'Rivitalo' },
  { value: 'omakotitalo', label: 'Omakotitalo' },
]

const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025] as const

interface FilterBarProps {
  /** Compact mode for use in the header bar */
  compact?: boolean
}

/**
 * FilterBar – year selector and property type toggle buttons.
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
          'rounded-lg border border-border bg-bg-secondary text-foreground',
          'focus:outline-none focus:ring-2 focus:ring-ring',
          'transition-colors cursor-pointer',
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

      {/* Property type toggle buttons */}
      <div
        className={cn(
          'flex items-center rounded-lg border border-border bg-bg-secondary p-0.5',
          compact ? 'gap-0' : 'gap-0.5'
        )}
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
                'rounded-md font-medium transition-all duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                compact
                  ? 'px-2 py-1 text-[11px]'
                  : 'px-3 py-1.5 text-xs',
                isActive
                  ? 'bg-accent text-white shadow-glow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {compact ? option.label.slice(0, 5) + '.' : option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
