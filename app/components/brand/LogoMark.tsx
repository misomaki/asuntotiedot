'use client'

interface LogoMarkProps {
  className?: string
  size?: number
}

/**
 * Neliöt logo — 2×2 grid of rounded squares (city blocks from above).
 * Stacked shadow layers beneath each block create a 3D extruded pillar effect.
 * The accent block has more shadow layers (taller — like a high-rise).
 */
export function LogoMark({ className, size = 30 }: LogoMarkProps) {
  const stroke = '#1a1a1a'
  const fill = '#ffd8f4'
  const accent = '#ffc900'
  const sw = 2.4
  const r = 3
  const blockW = 16
  const gap = 6 // space between blocks

  // Shadow layers for normal blocks (3 layers)
  const normalShadows = [
    { dx: 1, dy: 1, color: '#d0a8c0' },
    { dx: 2, dy: 2, color: '#b890a8' },
    { dx: 3, dy: 3, color: '#a07890' },
  ]

  // Shadow layers for accent block (5 layers — taller high-rise)
  const accentShadows = [
    { dx: 1, dy: 1, color: '#d4a800' },
    { dx: 2, dy: 2, color: '#b89400' },
    { dx: 3, dy: 3, color: '#9c8000' },
    { dx: 4, dy: 4, color: '#807000' },
    { dx: 5, dy: 5, color: '#646000' },
  ]

  const blocks = [
    { x: 3, y: 3, fill: fill, isAccent: false },
    { x: 3 + blockW + gap, y: 3, fill: accent, isAccent: true },
    { x: 3, y: 3 + blockW + gap, fill: fill, isAccent: false },
    { x: 3 + blockW + gap, y: 3 + blockW + gap, fill: fill, isAccent: false },
  ]

  // viewBox needs extra space for the tallest shadow (5px from accent block)
  const vbW = 3 + blockW + gap + blockW + 5 + 2
  const vbH = 3 + blockW + gap + blockW + 5 + 2

  return (
    <span
      className={`flex items-center select-none ${className ?? ''}`}
      aria-label="Neliöt"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${vbW} ${vbH}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        <defs>
          <radialGradient id="logoDotGrad" cx="35%" cy="35%">
            <stop offset="0%" stopColor="#fff" stopOpacity={0.7} />
            <stop offset="100%" stopColor={stroke} />
          </radialGradient>
        </defs>

        {blocks.map((block, i) => {
          const shadows = block.isAccent ? accentShadows : normalShadows
          return (
            <g key={i}>
              {/* Shadow rects (rendered back-to-front: farthest first) */}
              {[...shadows].reverse().map((s, si) => (
                <rect
                  key={`s${si}`}
                  x={block.x + s.dx}
                  y={block.y + s.dy}
                  width={blockW}
                  height={blockW}
                  rx={r}
                  fill={s.color}
                />
              ))}
              {/* Main block */}
              <rect
                x={block.x}
                y={block.y}
                width={blockW}
                height={blockW}
                rx={r}
                fill={block.fill}
                stroke={stroke}
                strokeWidth={sw}
              />
            </g>
          )
        })}

        {/* Location dot on accent block — 3D sphere via radial gradient */}
        <circle cx={3 + blockW + gap + blockW * 0.65} cy={3 + blockW * 0.35} r={3} fill="url(#logoDotGrad)" />
        <circle cx={3 + blockW + gap + blockW * 0.65} cy={3 + blockW * 0.35} r={1.2} fill={accent} />
      </svg>
    </span>
  )
}
