'use client'

import { useMemo } from 'react'
import type { AreaWithStats, PriceEstimate, PropertyType } from '@/app/types'
import {
  formatPricePerSqm,
  formatNumber,
  formatPercent,
  getPropertyTypeLabel,
} from '@/app/lib/formatters'
import { Badge } from '@/app/components/ui/badge'
import { Skeleton } from '@/app/components/ui/skeleton'
import { cn } from '@/app/lib/utils'
import { TrendChart } from '@/app/components/charts/TrendChart'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatsPanelProps {
  data: AreaWithStats | null
  isLoading: boolean
}

// ---------------------------------------------------------------------------
// Sub-components: Skeleton loading states
// ---------------------------------------------------------------------------

function StatsPanelSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>

      {/* Price skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-4 w-24" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
      </div>

      {/* Building stats skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-6 w-full rounded-full" />
        <div className="flex justify-between">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>

      {/* Demographics skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-20" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Price type card
// ---------------------------------------------------------------------------

interface PriceTypeCardProps {
  label: string
  priceEstimate: PriceEstimate | undefined
}

function PriceTypeCard({ label, priceEstimate }: PriceTypeCardProps) {
  return (
    <div className="rounded-lg border-2 border-[#1a1a1a] bg-[#FFFBF5] p-3 space-y-1 shadow-hard-sm">
      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
        {label}
      </p>
      <p className="text-sm font-mono tabular-nums text-foreground" data-number>
        {(priceEstimate?.price_per_sqm_median ?? priceEstimate?.price_per_sqm_avg) != null
          ? formatPricePerSqm(priceEstimate?.price_per_sqm_median ?? priceEstimate?.price_per_sqm_avg ?? null)
          : 'Ei tietoa'}
      </p>
      {priceEstimate && priceEstimate.transaction_count > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {formatNumber(priceEstimate.transaction_count)} kauppaa
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Building age bar
// ---------------------------------------------------------------------------

interface AgeSegment {
  label: string
  value: number
  color: string
}

function BuildingAgeBar({ segments }: { segments: AgeSegment[] }) {
  return (
    <div className="space-y-2">
      {/* Stacked bar */}
      <div className="flex h-5 w-full overflow-hidden rounded-full">
        {segments.map((segment) =>
          segment.value > 0 ? (
            <div
              key={segment.label}
              className="h-full transition-all duration-500"
              style={{
                width: `${segment.value}%`,
                backgroundColor: segment.color,
              }}
              title={`${segment.label}: ${formatPercent(segment.value)}`}
            />
          ) : null
        )}
      </div>

      {/* Labels below the bar */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-1.5">
            <div
              className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: segment.color }}
            />
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {segment.label}{' '}
              <span className="font-mono tabular-nums" data-number>
                {formatPercent(segment.value)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat card (small metric)
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string
  value: string
  className?: string
}

function StatCard({ label, value, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border-2 border-[#1a1a1a] bg-[#FFFBF5] p-3 text-center space-y-1 shadow-hard-sm',
        className
      )}
    >
      <p className="text-lg font-mono tabular-nums text-foreground" data-number>
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
        {label}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Age distribution bars
// ---------------------------------------------------------------------------

interface AgeBarsProps {
  pctUnder18: number
  pct18_64: number
  pctOver65: number
}

function AgeBars({ pctUnder18, pct18_64, pctOver65 }: AgeBarsProps) {
  const bars: { label: string; value: number; color: string }[] = [
    { label: 'Alle 18', value: pctUnder18, color: '#60a5fa' },
    { label: '18-64', value: pct18_64, color: '#3b82f6' },
    { label: 'Yli 65', value: pctOver65, color: '#93c5fd' },
  ]

  return (
    <div className="space-y-2">
      {bars.map((bar) => (
        <div key={bar.label} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-12 flex-shrink-0">
            {bar.label}
          </span>
          <div className="flex-1 h-3 rounded-full bg-muted/30 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${bar.value}%`,
                backgroundColor: bar.color,
              }}
            />
          </div>
          <span
            className="text-xs font-mono tabular-nums text-muted-foreground w-12 text-right flex-shrink-0"
            data-number
          >
            {formatPercent(bar.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Walk Score circle
// ---------------------------------------------------------------------------

function WalkScoreCircle({ score }: { score: number }) {
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference
  const strokeDashoffset = circumference - progress

  const category = useMemo(() => {
    if (score >= 80) return { label: 'Erinomainen', color: '#22c55e' }
    if (score >= 60) return { label: 'Hyva', color: '#3b82f6' }
    if (score >= 40) return { label: 'Kohtalainen', color: '#f59e0b' }
    return { label: 'Heikko', color: '#ef4444' }
  }, [score])

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-24 h-24 flex-shrink-0">
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full -rotate-90"
          aria-label={`Kavelypisteet: ${score}/100`}
        >
          {/* Background track */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="8"
          />
          {/* Progress arc */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={category.color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        {/* Center number */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-2xl font-mono font-bold text-foreground"
            data-number
          >
            {score}
          </span>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium" style={{ color: category.color }}>
          {category.label}
        </p>
        <p className="text-xs text-muted-foreground">/ 100 pistetta</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section divider
// ---------------------------------------------------------------------------

function SectionDivider() {
  return <hr className="border-[#e0e0e0]" />
}

// ---------------------------------------------------------------------------
// Main StatsPanel component
// ---------------------------------------------------------------------------

/**
 * StatsPanel – Displays detailed stats for the selected postal code area.
 * Shows price estimates, building age distribution, demographics,
 * and walk score in a vertically scrollable panel.
 */
export function StatsPanel({ data, isLoading }: StatsPanelProps) {
  // Loading state
  if (isLoading) {
    return <StatsPanelSkeleton />
  }

  // No data state
  if (!data) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Aluetietoja ei loytynyt.
      </div>
    )
  }

  // Group prices by property type for easy lookup
  const pricesByType: Partial<Record<PropertyType, PriceEstimate>> = {}
  for (const price of data.prices) {
    pricesByType[price.property_type] = price
  }

  // Find the "primary" price to display large (prefer kerrostalo)
  const primaryPrice =
    pricesByType['kerrostalo'] ??
    pricesByType['rivitalo'] ??
    pricesByType['omakotitalo']

  // Building age segments
  const buildingAgeSegments: AgeSegment[] | null = data.buildings
    ? [
        { label: 'ennen 1960', value: data.buildings.pct_pre_1960, color: '#ef4444' },
        { label: '1960-1980', value: data.buildings.pct_1960_1980, color: '#f59e0b' },
        { label: '1980-2000', value: data.buildings.pct_1980_2000, color: '#3b82f6' },
        { label: '2000 jalkeen', value: data.buildings.pct_post_2000, color: '#22c55e' },
      ]
    : null

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ---- Header section ---- */}
      <div className="space-y-1">
        <h2 className="text-xl font-heading font-bold text-foreground leading-tight">
          {data.name}
        </h2>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs" data-number>
            {data.area_code}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {data.municipality}
          </span>
        </div>
      </div>

      <SectionDivider />

      {/* ---- Price section ---- */}
      <div className="space-y-3">
        <div>
          <p
            className="text-3xl font-mono font-bold text-foreground tracking-tight"
            data-number
          >
            {formatPricePerSqm(primaryPrice?.price_per_sqm_median ?? primaryPrice?.price_per_sqm_avg ?? null)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Keskihinta
          </p>
        </div>

        {/* Price cards for all property types */}
        <div className="grid grid-cols-3 gap-2">
          {(['kerrostalo', 'rivitalo', 'omakotitalo'] as const).map((type) => (
            <PriceTypeCard
              key={type}
              label={getPropertyTypeLabel(type)}
              priceEstimate={pricesByType[type]}
            />
          ))}
        </div>
      </div>

      {/* ---- Building stats section ---- */}
      {data.buildings && (
        <>
          <SectionDivider />
          <div className="space-y-3">
            <h3 className="text-sm font-heading font-semibold text-foreground">
              Rakennuskanta
            </h3>

            <div className="flex items-baseline gap-3">
              <span
                className="text-2xl font-mono font-bold text-foreground"
                data-number
              >
                {data.buildings.avg_building_year}
              </span>
              <span className="text-xs text-muted-foreground">
                keskimaarainen rakennusvuosi
              </span>
            </div>

            {buildingAgeSegments && (
              <BuildingAgeBar segments={buildingAgeSegments} />
            )}

            <p className="text-xs text-muted-foreground">
              Yhteensa{' '}
              <span className="font-mono tabular-nums" data-number>
                {formatNumber(data.buildings.buildings_total)}
              </span>{' '}
              rakennusta
            </p>
          </div>
        </>
      )}

      {/* ---- Demographics section ---- */}
      {data.demographics && (
        <>
          <SectionDivider />
          <div className="space-y-3">
            <h3 className="text-sm font-heading font-semibold text-foreground">
              Vaesto
            </h3>

            <div className="grid grid-cols-3 gap-2">
              <StatCard
                label="Vaesto"
                value={formatNumber(data.demographics.population)}
              />
              <StatCard
                label="Keski-ika"
                value={`${data.demographics.median_age.toFixed(0)} v`}
              />
              <StatCard
                label="Talouden koko"
                value={data.demographics.avg_household_size.toFixed(1)}
              />
            </div>

            <AgeBars
              pctUnder18={data.demographics.pct_under_18}
              pct18_64={data.demographics.pct_18_64}
              pctOver65={data.demographics.pct_over_65}
            />
          </div>
        </>
      )}

      {/* ---- Walk Score section ---- */}
      {data.walkScore != null && (
        <>
          <SectionDivider />
          <div className="space-y-3">
            <h3 className="text-sm font-heading font-semibold text-foreground">
              Kavelypisteet
            </h3>
            <WalkScoreCircle score={data.walkScore} />
          </div>
        </>
      )}

      {/* ---- Trend chart section ---- */}
      <SectionDivider />
      <TrendChart areaCode={data.area_code} />
    </div>
  )
}
