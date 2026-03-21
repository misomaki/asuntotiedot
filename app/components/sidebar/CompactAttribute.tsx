'use client'

import type { ReactNode } from 'react'

export function CompactAttribute({
  icon,
  label,
  value,
  delay = 0,
}: {
  icon: ReactNode
  label: string
  value: string
  delay?: number
}) {
  return (
    <div
      className="rounded-lg border border-[#1a1a1a]/20 bg-[#FFFBF5] px-2.5 py-2 flex items-center gap-2 animate-pop-in"
      style={{ animationDelay: `${delay * 40}ms`, animationFillMode: 'both' }}
    >
      <span className="text-muted-foreground flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground leading-none">{label}</div>
        <div className="text-sm font-medium text-foreground tabular-nums leading-tight truncate">{value}</div>
      </div>
    </div>
  )
}
