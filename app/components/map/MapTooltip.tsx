'use client'

import { formatPricePerSqm } from '@/app/lib/formatters'
import { getColorForPrice } from '@/app/lib/colorScales'

interface MapTooltipProps {
  areaName: string
  /** Optional subtitle (e.g. area code). Hidden if not provided. */
  subtitle?: string
  price: number | null
  x: number
  y: number
}

/**
 * Floating tooltip that appears when hovering over a map area or municipality.
 * Positioned relative to the cursor with a 15px offset.
 * Uses neobrutalist styling with thick border and hard shadow.
 */
export default function MapTooltip({
  areaName,
  subtitle,
  price,
  x,
  y,
}: MapTooltipProps) {
  const priceColor = getColorForPrice(price)

  return (
    <div
      className="pointer-events-none absolute z-50 animate-fade-in"
      style={{
        left: x + 15,
        top: y + 15,
      }}
    >
      <div className="bg-[#FFFBF5] border-2 border-[#1a1a1a] rounded-lg px-3 py-2 shadow-hard-sm min-w-[120px]">
        <p className="text-sm font-display font-bold text-[#1a1a1a] leading-tight">
          {areaName}
        </p>
        {subtitle && (
          <p className="text-xs text-[#999] mt-0.5 font-body">
            {subtitle}
          </p>
        )}
        {price !== null ? (
          <div className="mt-1.5 flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
              style={{
                backgroundColor: priceColor,
                border: '1.5px solid rgba(0,0,0,0.2)',
              }}
            />
            <span className="text-sm font-mono font-bold text-[#1a1a1a]">
              {formatPricePerSqm(price)}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground mt-1">Ei hintatietoa</p>
        )}
      </div>
    </div>
  )
}
