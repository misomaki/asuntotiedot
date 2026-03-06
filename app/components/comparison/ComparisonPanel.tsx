'use client'

import { useMemo } from 'react'
import { useMapContext } from '@/app/contexts/MapContext'
import { useAreaStats } from '@/app/hooks/useAreaStats'
import type {
  AreaWithStats,
  PriceEstimate,
  PropertyType,
} from '@/app/types'
import {
  formatPricePerSqm,
  formatNumber,
  formatPercent,
  getPropertyTypeLabel,
} from '@/app/lib/formatters'
import { Badge } from '@/app/components/ui/badge'
import { Skeleton } from '@/app/components/ui/skeleton'
import { cn } from '@/app/lib/utils'
import { X, ArrowLeftRight } from 'lucide-react'

// ---------------------------------------------------------------------------
// Loading skeleton for a single column
// ---------------------------------------------------------------------------

function ColumnSkeleton() {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="space-y-2">
        <Skeleton className="h-6 w-36" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-16 w-full rounded-lg" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Difference badge between two numeric values
// ---------------------------------------------------------------------------

interface DifferenceBadgeProps {
  valueA: number | null | undefined
  valueB: number | null | undefined
}

function DifferenceBadge({ valueA, valueB }: DifferenceBadgeProps) {
  if (valueA == null || valueB == null || valueB === 0) return null

  const diffPercent = ((valueA - valueB) / valueB) * 100
  const isPositive = diffPercent > 0
  const isNegative = diffPercent < 0

  return (
    <span
      className={cn(
        'inline-flex items-center text-xs font-mono tabular-nums px-1.5 py-0.5 rounded',
        isPositive && 'text-red-400 bg-red-400/10',
        isNegative && 'text-emerald-400 bg-emerald-400/10',
        !isPositive && !isNegative && 'text-muted-foreground bg-muted/30'
      )}
      data-number
    >
      {isPositive ? '+' : ''}
      {diffPercent.toFixed(1)} %
    </span>
  )
}

// ---------------------------------------------------------------------------
// Price comparison row
// ---------------------------------------------------------------------------

interface PriceComparisonRowProps {
  label: string
  priceA: PriceEstimate | undefined
  priceB: PriceEstimate | undefined
}

function PriceComparisonRow({ label, priceA, priceB }: PriceComparisonRowProps) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
      {/* Area 1 price */}
      <div className="rounded-lg border border-border bg-bg-secondary/50 p-3 space-y-1">
        <p className="text-sm font-mono tabular-nums text-foreground" data-number>
          {priceA?.price_per_sqm_median != null
            ? formatPricePerSqm(priceA.price_per_sqm_median)
            : 'Ei tietoa'}
        </p>
        {priceA && priceA.transaction_count > 0 && (
          <p className="text-[10px] text-muted-foreground">
            {formatNumber(priceA.transaction_count)} kauppaa
          </p>
        )}
      </div>

      {/* Difference indicator */}
      <div className="flex flex-col items-center gap-1 min-w-[60px]">
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider text-center">
          {label}
        </p>
        <DifferenceBadge
          valueA={priceA?.price_per_sqm_median}
          valueB={priceB?.price_per_sqm_median}
        />
      </div>

      {/* Area 2 price */}
      <div className="rounded-lg border border-border bg-bg-secondary/50 p-3 space-y-1">
        <p className="text-sm font-mono tabular-nums text-foreground" data-number>
          {priceB?.price_per_sqm_median != null
            ? formatPricePerSqm(priceB.price_per_sqm_median)
            : 'Ei tietoa'}
        </p>
        {priceB && priceB.transaction_count > 0 && (
          <p className="text-[10px] text-muted-foreground">
            {formatNumber(priceB.transaction_count)} kauppaa
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat comparison row (generic numeric)
// ---------------------------------------------------------------------------

interface StatComparisonRowProps {
  label: string
  valueA: string
  valueB: string
  rawA?: number | null
  rawB?: number | null
  showDiff?: boolean
}

function StatComparisonRow({
  label,
  valueA,
  valueB,
  rawA,
  rawB,
  showDiff = false,
}: StatComparisonRowProps) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
      <div className="rounded-lg border border-border bg-bg-secondary/50 p-3 text-center">
        <p className="text-sm font-mono tabular-nums text-foreground" data-number>
          {valueA}
        </p>
      </div>

      <div className="flex flex-col items-center gap-1 min-w-[60px]">
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider text-center">
          {label}
        </p>
        {showDiff && <DifferenceBadge valueA={rawA} valueB={rawB} />}
      </div>

      <div className="rounded-lg border border-border bg-bg-secondary/50 p-3 text-center">
        <p className="text-sm font-mono tabular-nums text-foreground" data-number>
          {valueB}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Building age comparison bars
// ---------------------------------------------------------------------------

interface BuildingAgeComparisonProps {
  buildingsA: AreaWithStats['buildings']
  buildingsB: AreaWithStats['buildings']
}

function BuildingAgeComparison({ buildingsA, buildingsB }: BuildingAgeComparisonProps) {
  const segments: { label: string; color: string; keyA: keyof NonNullable<AreaWithStats['buildings']>; keyB: keyof NonNullable<AreaWithStats['buildings']> }[] = [
    { label: 'ennen 1960', color: '#ef4444', keyA: 'pct_pre_1960', keyB: 'pct_pre_1960' },
    { label: '1960-1980', color: '#f59e0b', keyA: 'pct_1960_1980', keyB: 'pct_1960_1980' },
    { label: '1980-2000', color: '#3b82f6', keyA: 'pct_1980_2000', keyB: 'pct_1980_2000' },
    { label: '2000 jalkeen', color: '#22c55e', keyA: 'pct_post_2000', keyB: 'pct_post_2000' },
  ]

  return (
    <div className="space-y-2">
      {segments.map((seg) => {
        const valA = buildingsA ? (buildingsA[seg.keyA] as number) : 0
        const valB = buildingsB ? (buildingsB[seg.keyB] as number) : 0

        return (
          <div key={seg.label} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div
                  className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-[10px] text-muted-foreground">{seg.label}</span>
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <div className="h-3 rounded-full bg-muted/30 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${valA}%`, backgroundColor: seg.color }}
                />
              </div>
              <div className="flex gap-1 min-w-[80px] justify-center">
                <span className="text-[10px] font-mono tabular-nums text-muted-foreground" data-number>
                  {formatPercent(valA)}
                </span>
                <span className="text-[10px] text-muted-foreground">/</span>
                <span className="text-[10px] font-mono tabular-nums text-muted-foreground" data-number>
                  {formatPercent(valB)}
                </span>
              </div>
              <div className="h-3 rounded-full bg-muted/30 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${valB}%`, backgroundColor: seg.color }}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Walk Score comparison
// ---------------------------------------------------------------------------

interface WalkScoreComparisonProps {
  scoreA: number | null
  scoreB: number | null
}

function WalkScoreComparisonCircle({ score, color }: { score: number; color: string }) {
  const radius = 32
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference
  const strokeDashoffset = circumference - progress

  const category = useMemo(() => {
    if (score >= 80) return 'Erinomainen'
    if (score >= 60) return 'Hyva'
    if (score >= 40) return 'Kohtalainen'
    return 'Heikko'
  }, [score])

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-20 h-20 flex-shrink-0">
        <svg
          viewBox="0 0 80 80"
          className="w-full h-full -rotate-90"
          aria-label={`Kavelypisteet: ${score}/100`}
        >
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="6"
          />
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-mono font-bold text-foreground" data-number>
            {score}
          </span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{category}</p>
    </div>
  )
}

function WalkScoreComparison({ scoreA, scoreB }: WalkScoreComparisonProps) {
  if (scoreA == null && scoreB == null) return null

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
      <div className="flex justify-center">
        {scoreA != null ? (
          <WalkScoreComparisonCircle score={scoreA} color="#3b82f6" />
        ) : (
          <span className="text-sm text-muted-foreground">Ei tietoa</span>
        )}
      </div>

      <div className="flex flex-col items-center gap-1 min-w-[60px]">
        {scoreA != null && scoreB != null && (
          <DifferenceBadge valueA={scoreA} valueB={scoreB} />
        )}
      </div>

      <div className="flex justify-center">
        {scoreB != null ? (
          <WalkScoreComparisonCircle score={scoreB} color="#8b5cf6" />
        ) : (
          <span className="text-sm text-muted-foreground">Ei tietoa</span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Area column header
// ---------------------------------------------------------------------------

interface AreaHeaderProps {
  name: string
  areaCode: string
  municipality: string
  color: string
  label: string
}

function AreaHeader({ name, areaCode, municipality, color, label }: AreaHeaderProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div
          className="h-3 w-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
          {label}
        </span>
      </div>
      <h3 className="text-base font-heading font-bold text-foreground leading-tight">
        {name}
      </h3>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="font-mono text-xs" data-number>
          {areaCode}
        </Badge>
        <span className="text-xs text-muted-foreground">{municipality}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section divider
// ---------------------------------------------------------------------------

function SectionDivider() {
  return <hr className="border-border/50" />
}

// ---------------------------------------------------------------------------
// Helper: group prices by type
// ---------------------------------------------------------------------------

function groupPricesByType(
  prices: PriceEstimate[]
): Partial<Record<PropertyType, PriceEstimate>> {
  const result: Partial<Record<PropertyType, PriceEstimate>> = {}
  for (const price of prices) {
    result[price.property_type] = price
  }
  return result
}

// ---------------------------------------------------------------------------
// Main ComparisonPanel
// ---------------------------------------------------------------------------

export function ComparisonPanel() {
  const {
    selectedArea,
    comparedArea,
    setSelectedArea,
    setComparedArea,
    setIsCompareMode,
    setIsSidebarOpen,
    filters,
  } = useMapContext()

  // Fetch stats for both areas
  const area1Code = comparedArea?.areaCode ?? null
  const area2Code = selectedArea?.areaCode ?? null
  const { data: dataA, isLoading: loadingA } = useAreaStats(area1Code, filters.year)
  const { data: dataB, isLoading: loadingB } = useAreaStats(area2Code, filters.year)

  // Exit compare mode
  function handleClose() {
    setIsCompareMode(false)
    setComparedArea(null)
    setSelectedArea(null)
    setIsSidebarOpen(false)
  }

  // Swap the two areas
  function handleSwap() {
    const tempSelected = selectedArea
    const tempCompared = comparedArea
    setSelectedArea(tempCompared)
    setComparedArea(tempSelected)
  }

  // Group prices by property type
  const pricesByTypeA = useMemo(
    () => (dataA ? groupPricesByType(dataA.prices) : {}),
    [dataA]
  )
  const pricesByTypeB = useMemo(
    () => (dataB ? groupPricesByType(dataB.prices) : {}),
    [dataB]
  )

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ---- Toolbar ---- */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-heading font-bold text-foreground">
          Alueiden vertailu
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSwap}
            className={cn(
              'h-8 px-3 rounded-md flex items-center gap-1.5',
              'text-xs text-muted-foreground hover:text-foreground',
              'hover:bg-muted/50 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            aria-label="Vaihda alueet"
          >
            <ArrowLeftRight size={14} />
            <span>Vaihda</span>
          </button>
          <button
            type="button"
            onClick={handleClose}
            className={cn(
              'h-8 w-8 rounded-md flex items-center justify-center',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-muted/50 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            aria-label="Sulje vertailu"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ---- Area headers ---- */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          {loadingA ? (
            <ColumnSkeleton />
          ) : dataA ? (
            <AreaHeader
              name={dataA.name}
              areaCode={dataA.area_code}
              municipality={dataA.municipality}
              color="#3b82f6"
              label="Alue 1"
            />
          ) : (
            <span className="text-sm text-muted-foreground">Ei tietoa</span>
          )}
        </div>
        <div>
          {loadingB ? (
            <ColumnSkeleton />
          ) : dataB ? (
            <AreaHeader
              name={dataB.name}
              areaCode={dataB.area_code}
              municipality={dataB.municipality}
              color="#8b5cf6"
              label="Alue 2"
            />
          ) : (
            <span className="text-sm text-muted-foreground">Ei tietoa</span>
          )}
        </div>
      </div>

      {/* Show loading state for both */}
      {(loadingA || loadingB) && (
        <div className="grid grid-cols-2 gap-4">
          <ColumnSkeleton />
          <ColumnSkeleton />
        </div>
      )}

      {/* ---- Prices section ---- */}
      {!loadingA && !loadingB && (dataA || dataB) && (
        <>
          <SectionDivider />
          <div className="space-y-3">
            <h3 className="text-sm font-heading font-semibold text-foreground">
              Hinnat
            </h3>
            {(['kerrostalo', 'rivitalo', 'omakotitalo'] as const).map((type) => (
              <PriceComparisonRow
                key={type}
                label={getPropertyTypeLabel(type)}
                priceA={pricesByTypeA[type]}
                priceB={pricesByTypeB[type]}
              />
            ))}
          </div>
        </>
      )}

      {/* ---- Building stats section ---- */}
      {!loadingA && !loadingB && (dataA?.buildings || dataB?.buildings) && (
        <>
          <SectionDivider />
          <div className="space-y-3">
            <h3 className="text-sm font-heading font-semibold text-foreground">
              Rakennuskanta
            </h3>

            {/* Average building year */}
            <StatComparisonRow
              label="Keskim. rak.vuosi"
              valueA={dataA?.buildings ? String(dataA.buildings.avg_building_year) : 'Ei tietoa'}
              valueB={dataB?.buildings ? String(dataB.buildings.avg_building_year) : 'Ei tietoa'}
              rawA={dataA?.buildings?.avg_building_year}
              rawB={dataB?.buildings?.avg_building_year}
            />

            {/* Building count */}
            <StatComparisonRow
              label="Rakennuksia"
              valueA={dataA?.buildings ? formatNumber(dataA.buildings.buildings_total) : 'Ei tietoa'}
              valueB={dataB?.buildings ? formatNumber(dataB.buildings.buildings_total) : 'Ei tietoa'}
              rawA={dataA?.buildings?.buildings_total}
              rawB={dataB?.buildings?.buildings_total}
              showDiff
            />

            {/* Building age distribution bars */}
            <BuildingAgeComparison
              buildingsA={dataA?.buildings ?? null}
              buildingsB={dataB?.buildings ?? null}
            />
          </div>
        </>
      )}

      {/* ---- Demographics section ---- */}
      {!loadingA && !loadingB && (dataA?.demographics || dataB?.demographics) && (
        <>
          <SectionDivider />
          <div className="space-y-3">
            <h3 className="text-sm font-heading font-semibold text-foreground">
              Vaesto
            </h3>

            <StatComparisonRow
              label="Vaesto"
              valueA={dataA?.demographics ? formatNumber(dataA.demographics.population) : 'Ei tietoa'}
              valueB={dataB?.demographics ? formatNumber(dataB.demographics.population) : 'Ei tietoa'}
              rawA={dataA?.demographics?.population}
              rawB={dataB?.demographics?.population}
              showDiff
            />

            <StatComparisonRow
              label="Keski-ika"
              valueA={dataA?.demographics ? `${dataA.demographics.median_age.toFixed(0)} v` : 'Ei tietoa'}
              valueB={dataB?.demographics ? `${dataB.demographics.median_age.toFixed(0)} v` : 'Ei tietoa'}
              rawA={dataA?.demographics?.median_age}
              rawB={dataB?.demographics?.median_age}
              showDiff
            />

            <StatComparisonRow
              label="Talouden koko"
              valueA={dataA?.demographics ? dataA.demographics.avg_household_size.toFixed(1) : 'Ei tietoa'}
              valueB={dataB?.demographics ? dataB.demographics.avg_household_size.toFixed(1) : 'Ei tietoa'}
              rawA={dataA?.demographics?.avg_household_size}
              rawB={dataB?.demographics?.avg_household_size}
              showDiff
            />
          </div>
        </>
      )}

      {/* ---- Walk Score section ---- */}
      {!loadingA && !loadingB && (dataA?.walkScore != null || dataB?.walkScore != null) && (
        <>
          <SectionDivider />
          <div className="space-y-3">
            <h3 className="text-sm font-heading font-semibold text-foreground">
              Kavelypisteet
            </h3>
            <WalkScoreComparison
              scoreA={dataA?.walkScore ?? null}
              scoreB={dataB?.walkScore ?? null}
            />
          </div>
        </>
      )}
    </div>
  )
}
