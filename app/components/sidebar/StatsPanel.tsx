'use client'

import { useState, useMemo } from 'react'
import type { AreaWithStats, PriceEstimate, PropertyType } from '@/app/types'
import {
  formatPricePerSqm,
  formatNumber,
  formatPercent,
  getPropertyTypeLabel,
} from '@/app/lib/formatters'
import { Skeleton } from '@/app/components/ui/skeleton'
import { cn } from '@/app/lib/utils'
import { AnimatedNumber } from '@/app/components/ui/AnimatedNumber'
import { CompactAttribute } from '@/app/components/sidebar/CompactAttribute'
import { TrendChart } from '@/app/components/charts/TrendChart'
import {
  Building2,
  Calendar,
  Layers,
  Users,
  Footprints,
  ChevronDown,
  GraduationCap,
  Briefcase,
  Home,
  TrendingUp,
  Baby,
  UserCheck,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatsPanelProps {
  data: AreaWithStats | null
  isLoading: boolean
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
      <div className="flex h-4 w-full overflow-hidden rounded-full">
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
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 rounded-sm flex-shrink-0"
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
// Age distribution bars
// ---------------------------------------------------------------------------

function AgeBars({ pctUnder18, pct18_64, pctOver65 }: {
  pctUnder18: number
  pct18_64: number
  pctOver65: number
}) {
  const bars = [
    { label: 'Alle 18', value: pctUnder18, color: '#60a5fa' },
    { label: '18–64', value: pct18_64, color: '#3b82f6' },
    { label: 'Yli 65', value: pctOver65, color: '#93c5fd' },
  ]

  return (
    <div className="space-y-1.5">
      {bars.map((bar) => (
        <div key={bar.label} className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground w-10 flex-shrink-0">
            {bar.label}
          </span>
          <div className="flex-1 h-2.5 rounded-full bg-muted/30 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${bar.value}%`, backgroundColor: bar.color }}
            />
          </div>
          <span className="text-[11px] font-mono tabular-nums text-muted-foreground w-10 text-right flex-shrink-0" data-number>
            {formatPercent(bar.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Walk Score
// ---------------------------------------------------------------------------

function WalkScoreCircle({ score }: { score: number }) {
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference
  const strokeDashoffset = circumference - progress

  const category = useMemo(() => {
    if (score >= 80) return { label: 'Erinomainen', color: '#22c55e' }
    if (score >= 60) return { label: 'Hyvä', color: '#3b82f6' }
    if (score >= 40) return { label: 'Kohtalainen', color: '#f59e0b' }
    return { label: 'Heikko', color: '#ef4444' }
  }, [score])

  return (
    <div className="flex items-center gap-3">
      <div className="relative w-20 h-20 flex-shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90" aria-label={`Kävelypisteet: ${score}/100`}>
          <circle cx="50" cy="50" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="7" />
          <circle
            cx="50" cy="50" r={radius} fill="none"
            stroke={category.color} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-mono font-bold text-foreground" data-number>{score}</span>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium" style={{ color: category.color }}>{category.label}</p>
        <p className="text-[11px] text-muted-foreground">/ 100 pistettä</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Horizontal percentage bar (reusable)
// ---------------------------------------------------------------------------

function PercentBar({ segments }: { segments: Array<{ label: string; value: number; color: string }> }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1
  return (
    <div className="space-y-2">
      <div className="flex h-3.5 w-full overflow-hidden rounded-full">
        {segments.map((s) =>
          s.value > 0 ? (
            <div
              key={s.label}
              className="h-full transition-all duration-500"
              style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
              title={`${s.label}: ${formatPercent((s.value / total) * 100)}`}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {segments.filter(s => s.value > 0).map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {s.label}{' '}
              <span className="font-mono tabular-nums" data-number>
                {formatPercent((s.value / total) * 100)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-muted-foreground">{icon}</span>
      <h3 className="text-xs font-display font-bold text-foreground uppercase tracking-wider">{title}</h3>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Socioeconomics section (income + education)
// ---------------------------------------------------------------------------

function SocioeconomicsSection({ data }: { data: NonNullable<AreaWithStats['socioeconomics']> }) {
  const hasIncome = data.income_units_total != null && data.income_units_total > 0
  const hasEducation = data.education_pop_18plus != null && data.education_pop_18plus > 0

  if (!hasIncome && !hasEducation) return null

  // Education: compute university % (upper tertiary + university)
  const universityPct = hasEducation && data.education_pop_18plus
    ? Math.round(((data.education_upper_tertiary ?? 0) + (data.education_university ?? 0)) / data.education_pop_18plus * 100)
    : null

  return (
    <>
      {hasIncome && (
        <>
          <SectionHeader icon={<TrendingUp size={14} />} title="Tulotaso" />
          <PercentBar segments={[
            { label: 'Korkea', value: data.income_high ?? 0, color: '#22c55e' },
            { label: 'Keski', value: data.income_medium ?? 0, color: '#3b82f6' },
            { label: 'Matala', value: data.income_low ?? 0, color: '#f59e0b' },
          ]} />
        </>
      )}

      {hasEducation && (
        <>
          <SectionHeader icon={<GraduationCap size={14} />} title="Koulutustaso" />
          <PercentBar segments={[
            { label: 'Korkeakoulu', value: (data.education_upper_tertiary ?? 0) + (data.education_university ?? 0) + (data.education_lower_tertiary ?? 0), color: '#8b5cf6' },
            { label: 'Ammatillinen', value: data.education_vocational ?? 0, color: '#3b82f6' },
            { label: 'Toinen aste', value: data.education_secondary ?? 0, color: '#60a5fa' },
            { label: 'Perusaste', value: data.education_basic ?? 0, color: '#93c5fd' },
          ]} />
          {universityPct != null && (
            <p className="text-[11px] text-muted-foreground">
              Korkeakoulutettuja: <span className="font-mono tabular-nums font-medium text-foreground" data-number>{universityPct}%</span>
            </p>
          )}
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Housing composition section
// ---------------------------------------------------------------------------

function HousingSection({ data }: { data: NonNullable<AreaWithStats['housing']> }) {
  const hasTenure = data.dwellings_total != null && data.dwellings_total > 0
  const hasFamily = data.families_with_children != null

  if (!hasTenure && !hasFamily) return null

  return (
    <>
      <SectionHeader icon={<Home size={14} />} title="Asuminen" />

      {hasTenure && (
        <PercentBar segments={[
          { label: 'Omistus', value: data.owner_occupied ?? 0, color: '#22c55e' },
          { label: 'Vuokra', value: data.rented ?? 0, color: '#f59e0b' },
          { label: 'Muu', value: data.other_tenure ?? 0, color: '#94a3b8' },
        ]} />
      )}

      <div className="grid grid-cols-2 gap-2">
        {data.avg_apartment_size_sqm != null && data.avg_apartment_size_sqm > 0 && (
          <CompactAttribute
            icon={<Home size={14} />}
            label="Keskim. asunto"
            value={`${Math.round(data.avg_apartment_size_sqm)} m²`}
            delay={0}
          />
        )}
        {hasFamily && data.dwellings_total != null && data.dwellings_total > 0 && (
          <CompactAttribute
            icon={<Baby size={14} />}
            label="Lapsiperheitä"
            value={`${Math.round(((data.families_with_children ?? 0) / data.dwellings_total) * 100)}%`}
            delay={1}
          />
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Employment section
// ---------------------------------------------------------------------------

function EmploymentSection({
  data,
  employment,
}: {
  data: NonNullable<AreaWithStats['socioeconomics']>
  employment: AreaWithStats['employment']
}) {
  const hasEmployment = data.employed != null && data.unemployed != null
  if (!hasEmployment) return null

  const total = (data.employed ?? 0) + (data.unemployed ?? 0) + (data.students ?? 0) + (data.retirees ?? 0)
  const unemploymentRate = total > 0 ? ((data.unemployed ?? 0) / ((data.employed ?? 0) + (data.unemployed ?? 0)) * 100) : null

  // Top sectors
  const sectors = employment ? [
    { label: 'ICT', value: employment.sector_info_comm ?? 0 },
    { label: 'Terveys', value: employment.sector_health_social ?? 0 },
    { label: 'Kauppa', value: employment.sector_wholesale_retail ?? 0 },
    { label: 'Koulutus', value: employment.sector_education ?? 0 },
    { label: 'Julkinen', value: employment.sector_public_admin ?? 0 },
    { label: 'Teollisuus', value: employment.sector_manufacturing ?? 0 },
    { label: 'Rakentaminen', value: employment.sector_construction ?? 0 },
    { label: 'Asiantuntija', value: employment.sector_professional ?? 0 },
    { label: 'Rahoitus', value: employment.sector_finance ?? 0 },
    { label: 'Kuljetus', value: employment.sector_transport ?? 0 },
  ].filter(s => s.value > 0).sort((a, b) => b.value - a.value).slice(0, 3) : []

  return (
    <>
      <SectionHeader icon={<Briefcase size={14} />} title="Työllistyminen" />
      <div className="grid grid-cols-2 gap-2">
        <CompactAttribute
          icon={<UserCheck size={14} />}
          label="Työllisiä"
          value={formatNumber(data.employed ?? 0)}
          delay={0}
        />
        {unemploymentRate != null && (
          <CompactAttribute
            icon={<Briefcase size={14} />}
            label="Työttömyys"
            value={`${unemploymentRate.toFixed(1)}%`}
            delay={1}
          />
        )}
      </div>
      {sectors.length > 0 && (
        <div className="text-[11px] text-muted-foreground">
          Suurimmat alat:{' '}
          <span className="text-foreground font-medium">
            {sectors.map(s => s.label).join(', ')}
          </span>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function StatsPanelSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="min-w-0 space-y-2">
        <Skeleton className="h-[22px] w-48" />
        <Skeleton className="h-[14px] w-32" />
      </div>

      {/* Price card */}
      <div className="rounded-xl bg-pink-pale/40 border-2 border-[#1a1a1a]/10 overflow-hidden">
        <div className="px-4 pt-3 pb-2.5 space-y-2">
          <Skeleton className="h-[14px] w-20" />
          <Skeleton className="h-[30px] w-36" />
        </div>
        <div className="px-4 py-2.5 border-t border-[#1a1a1a]/10">
          <Skeleton className="h-[14px] w-32" />
        </div>
      </div>

      {/* Attribute grid */}
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-[#1a1a1a]/10 bg-[#FFFBF5] px-2.5 py-2 flex items-center gap-2">
            <Skeleton className="h-[14px] w-[14px] rounded-sm flex-shrink-0" />
            <div className="space-y-1 flex-1">
              <Skeleton className="h-[11px] w-12" />
              <Skeleton className="h-[16px] w-16" />
            </div>
          </div>
        ))}
      </div>

      {/* Age bar */}
      <Skeleton className="h-4 w-full rounded-full" />

      {/* Demographics */}
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-[#1a1a1a]/10 bg-[#FFFBF5] px-2.5 py-2 flex items-center gap-2">
            <Skeleton className="h-[14px] w-[14px] rounded-sm flex-shrink-0" />
            <div className="space-y-1 flex-1">
              <Skeleton className="h-[11px] w-12" />
              <Skeleton className="h-[16px] w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main StatsPanel
// ---------------------------------------------------------------------------

/**
 * StatsPanel – Area details panel with layout matching the building info card.
 *
 * Layout:
 *   1. Header: area name + area code / municipality
 *   2. Price card: primary price + collapsible per-type breakdown
 *   3. Attribute grid: building stats (year, total, floors)
 *   4. Building age bar
 *   5. Demographic attributes + age distribution
 *   6. Walk score
 *   7. Trend chart
 */
export function StatsPanel({ data, isLoading }: StatsPanelProps) {
  const [showPriceBreakdown, setShowPriceBreakdown] = useState(false)

  if (isLoading) return <StatsPanelSkeleton />

  if (!data) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Aluetietoja ei löytynyt.
      </div>
    )
  }

  // Price lookup
  const pricesByType: Partial<Record<PropertyType, PriceEstimate>> = {}
  for (const price of data.prices) {
    pricesByType[price.property_type] = price
  }

  const primaryPrice =
    pricesByType['kerrostalo'] ??
    pricesByType['rivitalo'] ??
    pricesByType['omakotitalo']

  const primaryPriceValue = primaryPrice
    ? Math.round(primaryPrice.price_per_sqm_median ?? primaryPrice.price_per_sqm_avg ?? 0)
    : null

  // Building age segments
  const buildingAgeSegments: AgeSegment[] | null = data.buildings
    ? [
        { label: 'ennen 1960', value: data.buildings.pct_pre_1960, color: '#ef4444' },
        { label: '1960–1980', value: data.buildings.pct_1960_1980, color: '#f59e0b' },
        { label: '1980–2000', value: data.buildings.pct_1980_2000, color: '#3b82f6' },
        { label: '2000 jälkeen', value: data.buildings.pct_post_2000, color: '#22c55e' },
      ]
    : null

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Header ── */}
      <div className="min-w-0">
        <h2 className="text-base font-display font-bold text-foreground truncate">
          {data.name}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {data.area_code} · {data.municipality}
        </p>
      </div>

      {/* ── Unified price card ── */}
      <div className="rounded-xl bg-pink-pale border-2 border-[#1a1a1a] shadow-hard-sm overflow-hidden">
        {primaryPriceValue ? (
          <div className="px-4 pt-3 pb-2.5">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Keskihinta</div>
            <div className="text-2xl font-bold text-foreground tabular-nums mt-0.5">
              <AnimatedNumber value={primaryPriceValue} />
              <span className="text-sm font-normal text-muted-foreground ml-1.5">€/m²</span>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3">
            <div className="text-xs text-muted-foreground">Ei hintatietoa</div>
          </div>
        )}

        {/* Per-type breakdown toggle */}
        {data.prices.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowPriceBreakdown(prev => !prev)}
              className={cn(
                'w-full flex items-center justify-between',
                'px-4 py-2 text-xs cursor-pointer',
                'border-t border-[#1a1a1a]/10',
                'text-muted-foreground hover:text-foreground',
                'hover:bg-pink-baby/30 transition-colors',
              )}
            >
              <span className="font-medium">Hinnat talotyypeittäin</span>
              <ChevronDown
                size={14}
                className={cn('transition-transform duration-200', showPriceBreakdown && 'rotate-180')}
              />
            </button>

            {showPriceBreakdown && (
              <div className="px-4 pb-3 space-y-1.5 text-[13px] animate-fade-in border-t border-[#1a1a1a]/10 pt-2.5">
                {(['kerrostalo', 'rivitalo', 'omakotitalo'] as const).map((type) => {
                  const est = pricesByType[type]
                  const priceVal = est?.price_per_sqm_median ?? est?.price_per_sqm_avg ?? null
                  return (
                    <div key={type} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{getPropertyTypeLabel(type)}</span>
                      <span className="tabular-nums font-medium text-foreground">
                        {priceVal ? formatPricePerSqm(priceVal) : '–'}
                        {est && est.transaction_count > 0 && (
                          <span className="text-[11px] text-muted-foreground font-normal ml-1.5">
                            ({formatNumber(est.transaction_count)} kpl)
                          </span>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Building stats — attribute grid ── */}
      {data.buildings && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <CompactAttribute
              icon={<Calendar size={14} />}
              label="Keskim. rak.vuosi"
              value={data.buildings.avg_building_year.toString()}
              delay={0}
            />
            <CompactAttribute
              icon={<Building2 size={14} />}
              label="Rakennuksia"
              value={formatNumber(data.buildings.buildings_total)}
              delay={1}
            />
            {data.buildings.avg_floor_count != null && (
              <CompactAttribute
                icon={<Layers size={14} />}
                label="Keskim. kerroksia"
                value={data.buildings.avg_floor_count.toFixed(1)}
                delay={2}
              />
            )}
            {data.walkScore != null && (
              <CompactAttribute
                icon={<Footprints size={14} />}
                label="Kävelypisteet"
                value={`${data.walkScore} / 100`}
                delay={3}
              />
            )}
          </div>

          {/* Building age distribution */}
          {buildingAgeSegments && <BuildingAgeBar segments={buildingAgeSegments} />}
        </>
      )}

      {/* ── Demographics ── */}
      {data.demographics && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <CompactAttribute
              icon={<Users size={14} />}
              label="Väestö"
              value={formatNumber(data.demographics.population)}
              delay={0}
            />
            <CompactAttribute
              icon={<Calendar size={14} />}
              label="Keski-ikä"
              value={`${data.demographics.median_age.toFixed(0)} v`}
              delay={1}
            />
          </div>

          <AgeBars
            pctUnder18={data.demographics.pct_under_18}
            pct18_64={data.demographics.pct_18_64}
            pctOver65={data.demographics.pct_over_65}
          />
        </>
      )}

      {/* ── Income & Education ── */}
      {data.socioeconomics && (
        <SocioeconomicsSection data={data.socioeconomics} />
      )}

      {/* ── Housing composition ── */}
      {data.housing && (
        <HousingSection data={data.housing} />
      )}

      {/* ── Employment ── */}
      {data.socioeconomics && (
        <EmploymentSection data={data.socioeconomics} employment={data.employment} />
      )}

      {/* ── Walk Score circle (only if no buildings section showed it inline) ── */}
      {data.walkScore != null && !data.buildings && (
        <WalkScoreCircle score={data.walkScore} />
      )}

      {/* ── Trend chart ── */}
      <TrendChart areaCode={data.area_code} />
    </div>
  )
}
