'use client'

interface LogoMarkProps {
  className?: string
  size?: number
}

/**
 * Neliöt logo — 2×2 grid of rounded squares (city blocks from above).
 * One square highlighted with accent color + bullseye location dot.
 */
export function LogoMark({ className, size = 30 }: LogoMarkProps) {
  const stroke = '#1a1a1a'
  const fill = '#ff90e8'
  const accent = '#ffc900'
  const sw = 2.4
  const r = 3

  return (
    <span
      className={`flex items-center select-none ${className ?? ''}`}
      aria-label="Neliöt"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 44 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        {/* Top-left square */}
        <rect x="3" y="3" width="16" height="16" rx={r} fill={fill} stroke={stroke} strokeWidth={sw} />
        {/* Top-right square — the "active" one */}
        <rect x="25" y="3" width="16" height="16" rx={r} fill={accent} stroke={stroke} strokeWidth={sw} />
        {/* Bottom-left square */}
        <rect x="3" y="25" width="16" height="16" rx={r} fill={fill} stroke={stroke} strokeWidth={sw} />
        {/* Bottom-right square */}
        <rect x="25" y="25" width="16" height="16" rx={r} fill={fill} stroke={stroke} strokeWidth={sw} />
        {/* Location dot on the active square */}
        <circle cx="33" cy="11" r="3" fill={stroke} />
        <circle cx="33" cy="11" r="1.2" fill={accent} />
      </svg>
    </span>
  )
}
