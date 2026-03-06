'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { TooltipContentProps } from 'recharts'
import type {
  NameType,
  ValueType,
} from 'recharts/types/component/DefaultTooltipContent'
import { TrendingUp } from 'lucide-react'
import { Skeleton } from '@/app/components/ui/skeleton'
import { formatNumber, formatPricePerSqm } from '@/app/lib/formatters'
import { cn } from '@/app/lib/utils'
import type { PriceEstimate, PropertyType } from '@/app/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrendChartProps {
  areaCode: string
  className?: string
}

interface TrendDataPoint {
  year: number
  kerrostalo: number | null
  rivitalo: number | null
  omakotitalo: number | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROPERTY_TYPES: PropertyType[] = ['kerrostalo', 'rivitalo', 'omakotitalo']

const LINE_CONFIG: Record<
  PropertyType,
  { color: string; label: string }
> = {
  kerrostalo: { color: '#3b82f6', label: 'Kerrostalo' },
  rivitalo: { color: '#22c55e', label: 'Rivitalo' },
  omakotitalo: { color: '#f59e0b', label: 'Omakotitalo' },
}

// ---------------------------------------------------------------------------
// Finnish Y-axis formatter
// ---------------------------------------------------------------------------

function formatYAxis(value: number): string {
  return formatNumber(value)
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function CustomTooltip(props: Partial<TooltipContentProps<ValueType, NameType>>) {
  const { active, payload, label } = props
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="rounded-lg border border-white/10 bg-[#1a1d27] px-4 py-3 shadow-xl">
      <p className="mb-2 text-sm font-medium text-white">{label}</p>
      <div className="space-y-1.5">
        {payload.map((entry: { dataKey?: string | number; value?: ValueType }) => {
          const key = entry.dataKey as PropertyType
          const config = LINE_CONFIG[key]
          if (!config) return null
          const value = typeof entry.value === 'number' ? entry.value : null
          return (
            <div key={key} className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: config.color }}
                />
                <span className="text-xs text-white/70">{config.label}</span>
              </div>
              <span className="font-mono text-xs tabular-nums text-white">
                {formatPricePerSqm(value)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Custom legend
// ---------------------------------------------------------------------------

interface CustomLegendPayloadItem {
  value: string
  color?: string
  dataKey?: string
}

function CustomLegendContent({
  payload,
}: {
  payload?: CustomLegendPayloadItem[]
}) {
  if (!payload) return null

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2">
      {payload.map((entry) => {
        const key = entry.dataKey as PropertyType | undefined
        const config = key ? LINE_CONFIG[key] : undefined
        return (
          <div key={entry.value} className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: entry.color ?? config?.color }}
            />
            <span className="text-[11px] text-white/60">
              {config?.label ?? entry.value}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function TrendChartSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-5 w-28" />
      </div>
      <Skeleton className="h-[250px] w-full rounded-lg" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Data fetching helper
// ---------------------------------------------------------------------------

async function fetchPriceTrend(
  areaCode: string,
  propertyType: PropertyType
): Promise<PriceEstimate[]> {
  const response = await fetch(
    `/api/prices?area=${encodeURIComponent(areaCode)}&type=${propertyType}`
  )
  if (!response.ok) return []
  const data: unknown = await response.json()
  if (!Array.isArray(data)) return []
  return data as PriceEstimate[]
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TrendChart({ areaCode, className }: TrendChartProps) {
  const [rawData, setRawData] = useState<Record<PropertyType, PriceEstimate[]>>(
    {
      kerrostalo: [],
      rivitalo: [],
      omakotitalo: [],
    }
  )
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setHasError(false)

    try {
      const [kerrostalo, rivitalo, omakotitalo] = await Promise.all(
        PROPERTY_TYPES.map((type) => fetchPriceTrend(areaCode, type))
      )

      setRawData({ kerrostalo, rivitalo, omakotitalo })
    } catch {
      setHasError(true)
    } finally {
      setIsLoading(false)
    }
  }, [areaCode])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Combine all three datasets into a single series keyed by year
  const chartData = useMemo<TrendDataPoint[]>(() => {
    const yearMap = new Map<number, TrendDataPoint>()

    for (const type of PROPERTY_TYPES) {
      for (const entry of rawData[type]) {
        if (!yearMap.has(entry.year)) {
          yearMap.set(entry.year, {
            year: entry.year,
            kerrostalo: null,
            rivitalo: null,
            omakotitalo: null,
          })
        }
        const point = yearMap.get(entry.year)
        if (point) {
          point[type] = entry.price_per_sqm_median
        }
      }
    }

    return Array.from(yearMap.values()).sort((a, b) => a.year - b.year)
  }, [rawData])

  const isEmpty = chartData.length === 0

  // ------ Render ------

  if (isLoading) {
    return (
      <div className={cn(className)}>
        <TrendChartSkeleton />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 backdrop-blur-sm',
        className
      )}
    >
      {/* Title */}
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-heading font-semibold text-foreground">
          Hintakehitys
        </h3>
      </div>

      {/* Chart or empty state */}
      {hasError || isEmpty ? (
        <div className="flex h-[250px] items-center justify-center rounded-lg border border-dashed border-white/10">
          <p className="text-sm text-muted-foreground">Ei dataa</p>
        </div>
      ) : (
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
            >
              <CartesianGrid
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="year"
                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatYAxis}
                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend content={<CustomLegendContent />} />

              {PROPERTY_TYPES.map((type) => (
                <Line
                  key={type}
                  type="monotone"
                  dataKey={type}
                  name={LINE_CONFIG[type].label}
                  stroke={LINE_CONFIG[type].color}
                  strokeWidth={2}
                  dot={{ r: 3, fill: LINE_CONFIG[type].color, strokeWidth: 0 }}
                  activeDot={{
                    r: 5,
                    fill: LINE_CONFIG[type].color,
                    strokeWidth: 2,
                    stroke: '#1a1d27',
                  }}
                  connectNulls
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
