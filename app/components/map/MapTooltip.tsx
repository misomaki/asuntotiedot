'use client'

import { formatPricePerSqm } from '@/app/lib/formatters'
import { getColorForPrice } from '@/app/lib/colorScales'

interface MapTooltipProps {
  areaName: string
  areaCode: string
  price: number | null
  x: number
  y: number
}

/**
 * Floating tooltip that appears when hovering over a map area.
 * Positioned relative to the cursor with a 15px offset.
 * Uses glassmorphism styling and is non-interactive (pointer-events-none).
 */
export default function MapTooltip({
  areaName,
  areaCode,
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
      <div className="glass rounded-lg px-3 py-2 shadow-glass-sm min-w-[140px]">
        <p className="text-sm font-semibold text-[var(--color-text-primary)] leading-tight">
          {areaName}
        </p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          {areaCode}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: priceColor }}
          />
          <span className="text-sm font-mono font-semibold text-[var(--color-text-primary)]">
            {formatPricePerSqm(price)}
          </span>
        </div>
      </div>
    </div>
  )
}
