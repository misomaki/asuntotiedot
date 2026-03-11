'use client'

import { useState, type CSSProperties } from 'react'

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function SectionTitle({ font, color, label, sub }: { font: string; color: string; label: string; sub: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontFamily: font, fontSize: 18, fontWeight: 700, color, letterSpacing: '-0.02em', marginBottom: 4 }}>{label}</h2>
      <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: 13, color: '#6b7280' }}>{sub}</p>
    </div>
  )
}

function isLight(hex: string): boolean {
  if (hex.startsWith('rgba') || hex.startsWith('hsl')) return false
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return false
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150
}

// Price legend: warm pink → peach → yellow → mint
const PRICE_COLORS   = ['#b84080','#d4508c','#ff6b9d','#ff90b8','#ffb0c8','#ffd4a8','#ffe08a','#e8f060','#a8e8a0','#60d4a0']
const PRICE_COLORS_D = ['#4a1830','#6a2040','#8c3060','#b84080','#e060a0','#ffa070','#ffc040','#e0d060','#80c880','#40b090']

// Shared demo data
const STATS = [
  { label: 'Kauppoja', value: '234' },
  { label: 'Mediaani-ikä', value: '1962' },
  { label: 'Väestö', value: '14 200' },
]

const FACTORS = [
  { label: 'Alueen perushinta', factor: '5 450 €/m²', bar: 100 },
  { label: 'Ikäkerroin', factor: '\u00d70.92', bar: 82 },
  { label: 'Vesistökerroin', factor: '\u00d71.08', bar: 68 },
  { label: 'Kerroskerroin', factor: '\u00d71.03', bar: 45 },
]

// ═══════════════════════════════════════════════════════════════════════════
// Neliöt Logo — 2×2 grid of squares (city blocks from above)
// One square highlighted = "this is the one you're looking at"
// ═══════════════════════════════════════════════════════════════════════════

function NeliotLogo({ size = 40, stroke, fill, accent }: {
  size?: number; stroke: string; fill: string; accent: string
}) {
  const sw = 2.4
  const r = 3 // corner radius
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
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
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Main page
// ═══════════════════════════════════════════════════════════════════════════

export default function StyleExplorationPage() {
  const [dark, setDark] = useState(false)

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Libre+Franklin:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <div style={{
        minHeight: '100vh',
        background: dark ? '#161616' : '#ffffff',
        transition: 'background 0.4s ease',
      }}>
        {/* Page header — white banner with pink accents */}
        <div style={{
          background: '#ffffff',
          borderBottom: '2px solid #1a1a1a',
          marginBottom: 36,
        }}>
          <div style={{ padding: '28px 40px', maxWidth: 1400, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <NeliotLogo size={34} stroke="#1a1a1a" fill="#ff90e8" accent="#ffc900" />
                <h1 style={{
                  fontFamily: '"Libre Franklin", sans-serif',
                  fontSize: 26,
                  fontWeight: 900,
                  color: '#1a1a1a',
                  letterSpacing: '-0.03em',
                }}>
                  Neliöt <span style={{ fontWeight: 400, fontSize: 18, color: '#6b7280' }}>Style Guide</span>
                </h1>
              </div>

              {/* Light/Dark toggle */}
              <button
                onClick={() => setDark(!dark)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 18px',
                  borderRadius: 8,
                  border: '2px solid #1a1a1a',
                  background: '#ff90e8',
                  color: '#1a1a1a',
                  fontFamily: '"DM Sans", sans-serif',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '3px 3px 0px #1a1a1a',
                  transition: 'all 0.15s ease',
                }}
              >
                {dark ? '☾ Dark' : '☀ Light'}
              </button>
            </div>
            <p style={{
              fontFamily: '"DM Sans", sans-serif',
              fontSize: 14,
              color: '#6b7280',
            }}>
              Neobrutalist design system — Suomen asuntohinnat, nähtynä.
            </p>
          </div>
        </div>

        {/* Style guide content */}
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 40px 80px', paddingTop: 0 }}>
          <GumroadStyle dark={dark} />
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Gumroad-Inspired Style — "Neliöt"
// ═══════════════════════════════════════════════════════════════════════════

function GumroadStyle({ dark }: { dark: boolean }) {
  const c = dark ? {
    bg: '#161616', surface: '#1e1e1e', surfaceAlt: '#262626',
    text1: '#f5f5f5', text2: '#a0a0a0', text3: '#666666',
    pink: '#ff90e8', pinkDeep: '#cc60b8', pinkLight: '#ffb8f0', pinkPale: '#ffe0f8',
    yellow: '#ffc900', yellowLight: '#ffe566', yellowPale: '#fff5cc',
    mint: '#23c8a0', mintLight: '#60e8c8',
    peach: '#ffad8a', lavender: '#b8a8ff',
    black: '#f5f5f5', white: '#1e1e1e',
    borderColor: '#f5f5f5', borderW: 2,
    shadow: '4px 4px 0px #f5f5f5',
    shadowSm: '3px 3px 0px #f5f5f5',
    shadowLg: '6px 6px 0px #f5f5f5',
    shadowPink: '4px 4px 0px #ff90e8',
    cardBg: '#262626',
  } : {
    bg: '#ffffff', surface: '#ffffff', surfaceAlt: '#f8f8f8',
    text1: '#1a1a1a', text2: '#666666', text3: '#999999',
    pink: '#ff90e8', pinkDeep: '#e870d0', pinkLight: '#ffb8f0', pinkPale: '#fff0fb',
    yellow: '#ffc900', yellowLight: '#ffe566', yellowPale: '#fff8e0',
    mint: '#23c8a0', mintLight: '#60e8c8',
    peach: '#ffad8a', lavender: '#b8a8ff',
    black: '#1a1a1a', white: '#ffffff',
    borderColor: '#1a1a1a', borderW: 2,
    shadow: '4px 4px 0px #1a1a1a',
    shadowSm: '3px 3px 0px #1a1a1a',
    shadowLg: '6px 6px 0px #1a1a1a',
    shadowPink: '4px 4px 0px #ff90e8',
    cardBg: '#ffffff',
  }

  const ff = {
    display: '"Libre Franklin", sans-serif',
    body: '"DM Sans", sans-serif',
    mono: '"IBM Plex Mono", monospace',
  }

  const card = (bg: string, extra?: CSSProperties): CSSProperties => ({
    background: bg,
    border: `${c.borderW}px solid ${c.borderColor}`,
    borderRadius: 12,
    boxShadow: c.shadow,
    position: 'relative' as const,
    ...extra,
  })

  const pill = (bg: string, color: string, extra?: CSSProperties): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    background: bg,
    color,
    padding: '5px 14px',
    borderRadius: 100,
    border: `${c.borderW}px solid ${c.borderColor}`,
    fontFamily: ff.body,
    fontSize: 12,
    fontWeight: 600,
    ...extra,
  })

  const btn = (bg: string, color: string, extra?: CSSProperties): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    background: bg,
    color,
    padding: '10px 22px',
    borderRadius: 8,
    border: `${c.borderW}px solid ${c.borderColor}`,
    boxShadow: c.shadowSm,
    fontFamily: ff.body,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'transform 0.1s ease, box-shadow 0.1s ease',
    ...extra,
  })

  const priceColors = dark ? PRICE_COLORS_D : PRICE_COLORS

  return (
    <div>
      {/* ── Colour Palette ── */}
      <SectionTitle font={ff.display} color={c.text1} label="Colour Palette" sub={`Pink, yellow, mint on ${dark ? 'charcoal' : 'clean white'}. Hard edges, playful pastels.`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 14, marginBottom: 56 }}>
        {[
          { name: 'Pink', hex: c.pink },
          { name: 'Pink Deep', hex: c.pinkDeep },
          { name: 'Pink Light', hex: c.pinkLight },
          { name: 'Yellow', hex: c.yellow },
          { name: 'Yellow Light', hex: c.yellowLight },
          { name: 'Mint', hex: c.mint },
          { name: 'Peach', hex: c.peach },
          { name: 'Lavender', hex: c.lavender },
          { name: 'Surface', hex: c.surface },
          { name: 'Background', hex: c.bg },
        ].map(s => (
          <div key={s.name} style={{
            ...card(s.hex, { boxShadow: c.shadowSm, borderRadius: 10 }),
            padding: '28px 14px 14px',
            minHeight: 90,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}>
            <div style={{ fontFamily: ff.body, fontSize: 11, fontWeight: 600, color: isLight(s.hex) ? '#1a1a1a' : '#f5f5f5' }}>{s.name}</div>
            <div style={{ fontFamily: ff.mono, fontSize: 10, color: isLight(s.hex) ? '#555' : '#aaa', marginTop: 3 }}>{s.hex}</div>
          </div>
        ))}
      </div>

      {/* ── Logo & Branding ── */}
      <SectionTitle font={ff.display} color={c.text1} label="Logo & Branding" sub="2×2 grid of squares — city blocks from above, one highlighted with a location dot" />
      <div style={{ display: 'flex', gap: 24, marginBottom: 56, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {[
          { label: 'On Pink', bg: c.pink, fill: c.pink, stroke: c.borderColor, accent: c.yellow },
          { label: 'On Yellow', bg: c.yellow, fill: c.yellow, stroke: c.borderColor, accent: c.pink },
          { label: 'On Mint', bg: c.mint, fill: c.mint, stroke: c.borderColor, accent: c.yellow },
          { label: 'On Surface', bg: c.cardBg, fill: dark ? '#333' : '#f5f5f5', stroke: c.borderColor, accent: c.pink },
          { label: 'On Inverse', bg: c.borderColor, fill: c.borderColor, stroke: dark ? '#333' : '#ffffff', accent: c.pink },
        ].map(v => (
          <div key={v.label} style={{
            ...card(v.bg, { borderRadius: 14, boxShadow: c.shadowSm }),
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            minWidth: 120,
          }}>
            <NeliotLogo size={48} fill={v.fill} stroke={v.stroke} accent={v.accent} />
            <span style={{
              fontFamily: ff.display,
              fontSize: 18,
              fontWeight: 900,
              color: v.label === 'On Inverse' ? (dark ? '#666' : '#ffffff') : c.borderColor,
              letterSpacing: '-0.03em',
            }}>Neliöt</span>
            <div style={{ fontFamily: ff.body, fontSize: 10, color: isLight(v.bg) ? '#666' : '#aaa', fontWeight: 500 }}>{v.label}</div>
          </div>
        ))}

        {/* Size scale */}
        <div style={{
          ...card(c.cardBg, { borderRadius: 14, boxShadow: c.shadowSm }),
          padding: '20px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}>
          <div style={{ fontFamily: ff.body, fontSize: 11, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Size Scale</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {[20, 28, 36, 48, 64].map(s => (
              <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <NeliotLogo size={s} fill={dark ? '#333' : '#f5f5f5'} stroke={c.borderColor} accent={c.pink} />
                <span style={{ fontFamily: ff.mono, fontSize: 9, color: c.text3 }}>{s}px</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Typography ── */}
      <SectionTitle font={ff.display} color={c.text1} label="Typography" sub="Libre Franklin (bold geometric display) + DM Sans (friendly body) + IBM Plex Mono (data)" />
      <div style={{ ...card(c.cardBg), padding: 40, marginBottom: 56 }}>
        <div style={{ fontFamily: ff.display, fontSize: 56, fontWeight: 900, color: c.text1, letterSpacing: '-0.04em', lineHeight: 1.05, marginBottom: 8 }}>
          Kaikki{' '}
          <span style={{
            background: c.pink,
            color: c.borderColor,
            padding: '0 8px',
            borderRadius: 6,
            display: 'inline',
          }}>neliöt</span>
          , kartalla
        </div>
        <div style={{ height: 3, background: c.borderColor, width: 60, marginBottom: 16 }} />
        <div style={{ fontFamily: ff.display, fontSize: 28, fontWeight: 700, color: c.text1, letterSpacing: '-0.02em', marginBottom: 10 }}>Headline Medium</div>
        <div style={{ fontFamily: ff.display, fontSize: 18, fontWeight: 600, color: c.pink, marginBottom: 14 }}>
          Title in Pink
        </div>
        <div style={{ fontFamily: ff.body, fontSize: 16, fontWeight: 400, color: c.text2, lineHeight: 1.7, marginBottom: 16, maxWidth: 520 }}>
          Body — Tarkastele Suomen asuntomarkkinaa interaktiivisella kartalla. Rakennuskohtaiset hinta-arviot avoimesta datasta.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontFamily: ff.mono, fontSize: 15, fontWeight: 600, color: c.yellow }}>3 450 €/m²</div>
          <div style={{ fontFamily: ff.mono, fontSize: 13, fontWeight: 500, color: c.text3, letterSpacing: '0.02em' }}>Mono Data Label</div>
        </div>
      </div>

      {/* ── Components ── */}
      <SectionTitle font={ff.display} color={c.text1} label="Components" sub="Playful cards with thick borders, hard shadows, rounded corners" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 56 }}>
        {/* Header bar */}
        <div style={{
          ...card(c.cardBg, { borderRadius: 14 }),
          padding: '14px 22px',
          gridColumn: '1 / -1',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}>
          <NeliotLogo size={34} fill={c.pink} stroke={c.borderColor} accent={c.yellow} />
          <span style={{
            fontFamily: ff.display,
            fontSize: 20,
            fontWeight: 900,
            color: c.borderColor,
            letterSpacing: '-0.03em',
          }}>Neliöt</span>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {['Kartta', 'Alueet', 'Vertailu'].map((item, i) => (
              <div key={item} style={{
                ...pill(i === 0 ? c.borderColor : 'transparent', i === 0 ? (dark ? c.bg : '#ffffff') : c.borderColor, {
                  border: `2px solid ${c.borderColor}`,
                  boxShadow: i === 0 ? c.shadowSm : 'none',
                }),
                fontSize: 13,
                fontWeight: i === 0 ? 700 : 500,
              }}>{item}</div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, marginLeft: 12 }}>
            {[2023, 2024, 2025].map((yr, i) => (
              <div key={yr} style={{
                padding: '6px 14px',
                fontFamily: ff.mono,
                fontSize: 13,
                fontWeight: 700,
                background: i === 2 ? c.pink : 'transparent',
                color: i === 2 ? c.borderColor : c.text2,
                border: `2px solid ${c.borderColor}`,
                borderRadius: 8,
                boxShadow: i === 2 ? c.shadowSm : 'none',
              }}>{yr}</div>
            ))}
          </div>
        </div>

        {/* Stats card */}
        <div style={{ ...card(c.cardBg), padding: 28 }}>
          <div style={{ position: 'absolute', top: -1, left: 20, right: 20, height: 4, background: c.pink, borderRadius: '0 0 4px 4px' }} />

          <div style={{
            ...pill(c.yellow, c.borderColor, { boxShadow: '2px 2px 0px ' + c.borderColor }),
            marginBottom: 18,
          }}>
            <span style={{ fontSize: 8 }}>📍</span>
            00100 Helsinki keskusta
          </div>

          <div style={{ fontFamily: ff.display, fontSize: 58, fontWeight: 900, color: c.text1, letterSpacing: '-0.04em', lineHeight: 1 }}>
            6 842
          </div>
          <div style={{ fontFamily: ff.body, fontSize: 14, color: c.text3, marginTop: 6, marginBottom: 24 }}>€ per m² · Kerrostalo · 2024</div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {STATS.map((s, i) => {
              const bg = [c.pinkPale, c.yellowPale, c.mintLight][i]
              const bgDark = [c.pinkDeep, '#8a7000', c.mint][i]
              return (
                <div key={s.label} style={{
                  ...card(dark ? bgDark : bg, { boxShadow: c.shadowSm, borderRadius: 10, flex: 1, minWidth: 100 }),
                  padding: '14px 16px',
                }}>
                  <div style={{ fontFamily: ff.body, fontSize: 11, fontWeight: 600, color: dark ? '#e0e0e0' : '#1a1a1a', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.7, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontFamily: ff.mono, fontSize: 20, fontWeight: 700, color: dark ? '#f5f5f5' : '#1a1a1a' }}>{s.value}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Building card */}
        <div style={{ ...card(c.cardBg), padding: 28 }}>
          <div style={{ position: 'absolute', top: -1, left: 20, right: 20, height: 4, background: c.mint, borderRadius: '0 0 4px 4px' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <div style={{ fontFamily: ff.display, fontSize: 20, fontWeight: 800, color: c.text1, letterSpacing: '-0.02em' }}>Mannerheimintie 12</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <span style={pill(c.pinkPale, c.pinkDeep)}>Kerrostalo</span>
                <span style={pill(c.yellowPale, '#8a6a00')}>1965</span>
              </div>
            </div>
            <div style={{
              ...card(c.mint, { borderRadius: 10 }),
              padding: '8px 16px',
              fontFamily: ff.mono,
              fontSize: 16,
              fontWeight: 700,
              color: c.borderColor,
            }}>5 120 €/m²</div>
          </div>

          {FACTORS.map((f, i) => {
            const barColor = [c.pink, c.yellow, c.mint, c.lavender][i]
            return (
              <div key={f.label} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontFamily: ff.body, fontSize: 13, fontWeight: 500, color: c.text2 }}>{f.label}</span>
                  <span style={{ fontFamily: ff.mono, fontSize: 13, fontWeight: 700, color: c.text1 }}>{f.factor}</span>
                </div>
                <div style={{
                  height: 14,
                  background: dark ? c.surfaceAlt : '#f0f0f0',
                  borderRadius: 100,
                  border: `${c.borderW}px solid ${c.borderColor}`,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    background: barColor,
                    borderRadius: 100,
                    width: `${f.bar}%`,
                  }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Interactive elements */}
        <div style={{ gridColumn: '1 / -1', ...card(c.cardBg, { borderRadius: 14 }), padding: '24px 28px' }}>
          <div style={{ fontFamily: ff.display, fontSize: 14, fontWeight: 700, color: c.text1, letterSpacing: '-0.01em', marginBottom: 14 }}>Interactive Elements</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={btn(c.pink, c.borderColor)}>
              <span style={{ fontSize: 14 }}>🔍</span>
              Hae alue
            </div>
            <div style={btn(c.yellow, c.borderColor)}>
              <span style={{ fontSize: 14 }}>📊</span>
              Vertaile
            </div>
            <div style={btn(c.mint, c.borderColor)}>
              <span style={{ fontSize: 14 }}>🏠</span>
              Rakennukset
            </div>
            <div style={btn(dark ? c.surfaceAlt : '#ffffff', c.text1)}>
              Peruuta
            </div>
            <div style={{ width: 2, height: 28, background: c.borderColor, opacity: 0.15 }} />
            <span style={pill(c.pinkPale, c.pinkDeep)}>Kerrostalo</span>
            <span style={pill(c.yellowPale, '#8a6a00')}>Rivitalo</span>
            <span style={pill(c.mintLight, dark ? '#1a1a1a' : '#0a5a40')}>Omakotitalo</span>
          </div>
        </div>
      </div>

      {/* ── Map Legend ── */}
      <SectionTitle font={ff.display} color={c.text1} label="Map Legend" sub="Pink-to-mint gradient in a friendly rounded card" />
      <div style={{ ...card(c.cardBg, { padding: '22px 26px', display: 'inline-flex', flexDirection: 'column', gap: 10, marginBottom: 56 }) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ fontFamily: ff.display, fontSize: 13, fontWeight: 700, color: c.text1, letterSpacing: '-0.01em' }}>Hinta €/m²</div>
          <div style={pill(c.pinkPale, c.pinkDeep, { fontSize: 10, padding: '2px 10px' })}>2024</div>
        </div>
        <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: `${c.borderW}px solid ${c.borderColor}` }}>
          {priceColors.map((col, i) => (
            <div key={i} style={{ width: 40, height: 26, background: col }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: ff.mono, fontSize: 11, fontWeight: 600, color: c.text3, marginTop: 4 }}>
          <span>1 000</span><span>3 000</span><span>5 000</span><span>7 000</span><span>10 000+</span>
        </div>
      </div>

      {/* ── Sticker / Badge Elements ── */}
      <SectionTitle font={ff.display} color={c.text1} label="Decorative Elements" sub="Playful stickers, badges and micro-ornaments" />
      <div style={{ display: 'flex', gap: 16, marginBottom: 56, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{
          ...card(c.yellow, { borderRadius: 14 }),
          padding: '16px 24px',
          transform: 'rotate(-3deg)',
        }}>
          <div style={{ fontFamily: ff.mono, fontSize: 28, fontWeight: 700, color: c.borderColor, lineHeight: 1 }}>6 842</div>
          <div style={{ fontFamily: ff.body, fontSize: 11, fontWeight: 600, color: c.borderColor, opacity: 0.7, marginTop: 4 }}>€/m² keskiarvo</div>
        </div>

        <div style={{
          ...card(c.pink, { borderRadius: 100 }),
          padding: '18px 28px',
          transform: 'rotate(2deg)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ fontSize: 22 }}>🏙️</span>
          <div>
            <div style={{ fontFamily: ff.display, fontSize: 16, fontWeight: 800, color: c.borderColor }}>Helsinki</div>
            <div style={{ fontFamily: ff.body, fontSize: 11, color: c.borderColor, opacity: 0.7 }}>00100–00990</div>
          </div>
        </div>

        <div style={{
          ...card(c.mint, { borderRadius: 14 }),
          padding: '16px 22px',
          transform: 'rotate(-1.5deg)',
        }}>
          <div style={{ fontFamily: ff.display, fontSize: 14, fontWeight: 700, color: c.borderColor, marginBottom: 4 }}>Hintakehitys</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 32 }}>
            {[40, 55, 48, 62, 58, 70, 75, 82, 78, 90, 85, 95].map((h, i) => (
              <div key={i} style={{
                width: 6,
                height: `${h}%`,
                background: c.borderColor,
                borderRadius: 2,
                opacity: i < 8 ? 0.4 : 1,
              }} />
            ))}
          </div>
        </div>

        <div style={{
          ...card(c.lavender, { borderRadius: 14, boxShadow: c.shadowPink }),
          padding: '14px 22px',
          transform: 'rotate(3deg)',
        }}>
          <div style={{ fontFamily: ff.mono, fontSize: 32, fontWeight: 700, color: c.borderColor, lineHeight: 1 }}>234</div>
          <div style={{ fontFamily: ff.body, fontSize: 11, fontWeight: 600, color: c.borderColor, opacity: 0.7, marginTop: 4 }}>kauppaa 2024</div>
        </div>

        <div style={{
          ...card(c.peach, { borderRadius: 100 }),
          padding: '16px 24px',
          transform: 'rotate(-2deg)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ fontSize: 20 }}>🚶</span>
          <div style={{ fontFamily: ff.mono, fontSize: 20, fontWeight: 700, color: c.borderColor }}>87</div>
          <div style={{ fontFamily: ff.body, fontSize: 11, fontWeight: 500, color: c.borderColor, opacity: 0.7 }}>Walk Score</div>
        </div>
      </div>

      {/* ── Basemap ── */}
      <SectionTitle font={ff.display} color={c.text1} label="Basemap" sub="CartoCDN Positron with warm overrides — cream water, soft roads, no visual clutter" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 56 }}>
        <div style={{ ...card(c.cardBg, { borderRadius: 14 }), padding: 28 }}>
          <div style={{ position: 'absolute', top: -1, left: 20, right: 20, height: 4, background: c.mint, borderRadius: '0 0 4px 4px' }} />
          <div style={{ fontFamily: ff.display, fontSize: 16, fontWeight: 800, color: c.text1, letterSpacing: '-0.02em', marginBottom: 16 }}>Style Specification</div>

          <div style={{ fontFamily: ff.mono, fontSize: 12, color: c.mint, marginBottom: 16, padding: '8px 12px', background: dark ? '#1a2a1a' : '#e8f8f0', borderRadius: 8, border: `1px solid ${dark ? '#2a4a2a' : '#c0e8d0'}` }}>
            basemaps.cartocdn.com/gl/<b>positron</b>-gl-style/style.json
          </div>

          <div style={{ fontFamily: ff.body, fontSize: 12, color: c.text2, marginBottom: 10, fontWeight: 600 }}>Layer colour overrides:</div>
          {[
            { layer: 'Water', color: '#d4e8f0', swatch: '#d4e8f0', note: 'Soft powder blue' },
            { layer: 'Landcover', color: '#e8f0e0', swatch: '#e8f0e0', note: 'Pale sage' },
            { layer: 'Buildings', color: '#e0d8d0', swatch: '#e0d8d0', note: 'Warm taupe' },
            { layer: 'Roads', color: '#c8c0b8', swatch: '#c8c0b8', note: 'Warm grey' },
            { layer: 'Road casings', color: 'transparent', swatch: 'transparent', note: 'Hidden' },
            { layer: 'Background', color: '#f5f0e8', swatch: '#f5f0e8', note: 'Warm cream' },
            { layer: 'Labels', color: '#666058', swatch: '#666058', note: 'Warm charcoal' },
          ].map(row => (
            <div key={row.layer} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{
                width: 18, height: 18, borderRadius: 4,
                background: row.swatch === 'transparent' ? `repeating-linear-gradient(45deg, ${dark ? '#333' : '#ddd'}, ${dark ? '#333' : '#ddd'} 2px, ${dark ? '#222' : '#eee'} 2px, ${dark ? '#222' : '#eee'} 4px)` : row.swatch,
                border: `1.5px solid ${c.borderColor}`,
                flexShrink: 0,
              }} />
              <span style={{ fontFamily: ff.mono, fontSize: 11, color: c.text1, width: 80, fontWeight: 600 }}>{row.layer}</span>
              <span style={{ fontFamily: ff.mono, fontSize: 10, color: c.text3 }}>{row.color}</span>
              <span style={{ fontFamily: ff.body, fontSize: 10, color: c.text3, marginLeft: 'auto' }}>{row.note}</span>
            </div>
          ))}
        </div>

        <div style={{ ...card(c.cardBg, { borderRadius: 14 }), padding: 28 }}>
          <div style={{ position: 'absolute', top: -1, left: 20, right: 20, height: 4, background: c.yellow, borderRadius: '0 0 4px 4px' }} />
          <div style={{ fontFamily: ff.display, fontSize: 16, fontWeight: 800, color: c.text1, letterSpacing: '-0.02em', marginBottom: 16 }}>Preview — Warm Positron</div>

          <div style={{
            height: 220,
            borderRadius: 10,
            border: `${c.borderW}px solid ${c.borderColor}`,
            overflow: 'hidden',
            position: 'relative',
            background: '#f5f0e8',
          }}>
            <div style={{ position: 'absolute', top: '15%', right: '5%', width: '35%', height: '40%', background: '#d4e8f0', borderRadius: '60% 40% 50% 50%', opacity: 0.9 }} />
            <div style={{ position: 'absolute', bottom: '10%', left: '8%', width: '18%', height: '15%', background: '#d4e8f0', borderRadius: '40% 60% 50% 50%', opacity: 0.7 }} />
            <div style={{ position: 'absolute', top: '55%', left: '15%', width: '22%', height: '18%', background: '#e8f0e0', borderRadius: 8, opacity: 0.8 }} />

            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 200 120" preserveAspectRatio="none">
              <line x1="40" y1="0" x2="40" y2="120" stroke="#c8c0b8" strokeWidth="1.5" />
              <line x1="100" y1="0" x2="100" y2="120" stroke="#c8c0b8" strokeWidth="2" />
              <line x1="160" y1="0" x2="160" y2="120" stroke="#c8c0b8" strokeWidth="1" />
              <line x1="0" y1="30" x2="200" y2="30" stroke="#c8c0b8" strokeWidth="1" />
              <line x1="0" y1="70" x2="200" y2="70" stroke="#c8c0b8" strokeWidth="2" />
              <line x1="0" y1="100" x2="200" y2="100" stroke="#c8c0b8" strokeWidth="1" />
              <line x1="70" y1="25" x2="70" y2="105" stroke="#d8d0c8" strokeWidth="0.5" />
              <line x1="130" y1="20" x2="130" y2="85" stroke="#d8d0c8" strokeWidth="0.5" />
            </svg>

            {[
              { x: 45, y: 35, w: 20, h: 12 }, { x: 75, y: 35, w: 15, h: 10 },
              { x: 45, y: 55, w: 18, h: 14 }, { x: 75, y: 55, w: 22, h: 10 },
              { x: 105, y: 35, w: 20, h: 15 }, { x: 105, y: 75, w: 25, h: 12 },
              { x: 45, y: 75, w: 15, h: 18 }, { x: 135, y: 55, w: 18, h: 14 },
            ].map((b, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: `${b.x / 2}%`, top: `${b.y / 1.2}%`,
                width: `${b.w / 2}%`, height: `${b.h / 1.2}%`,
                background: '#e0d8d0', borderRadius: 2,
              }} />
            ))}

            <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${c.pink}15, ${c.yellow}10, ${c.mint}12)`, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: '22%', left: '42%', fontFamily: ff.body, fontSize: 8, color: '#666058', fontWeight: 500 }}>Kamppi</div>
            <div style={{ position: 'absolute', top: '62%', left: '55%', fontFamily: ff.body, fontSize: 7, color: '#666058', fontWeight: 400 }}>Punavuori</div>
            <div style={{ position: 'absolute', top: '8%', right: '15%', fontFamily: ff.body, fontSize: 7, color: '#8899aa', fontStyle: 'italic' }}>Töölönlahti</div>
          </div>

          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={pill(c.pinkPale, c.pinkDeep, { fontSize: 10 })}>Warm cream base</span>
            <span style={pill(c.yellowPale, '#8a6a00', { fontSize: 10 })}>No road casings</span>
            <span style={pill(dark ? '#1a2a2a' : '#e0f5f0', dark ? c.mintLight : '#0a5a40', { fontSize: 10 })}>Soft building fills</span>
          </div>
        </div>
      </div>

      {/* ── Layout Preview ── */}
      <SectionTitle font={ff.display} color={c.text1} label="Layout Preview" sub="Clean map with floating Neliöt panels" />
      <div style={{
        overflow: 'hidden',
        height: 460,
        position: 'relative',
        background: dark ? '#1a1a1a' : '#f0ece4',
        borderRadius: 16,
        border: `${c.borderW}px solid ${c.borderColor}`,
        boxShadow: c.shadowLg,
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `radial-gradient(circle, ${c.borderColor}${dark ? '15' : '0c'} 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }} />
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: `radial-gradient(circle, ${c.pink}12, transparent 60%)`, top: -100, left: '20%', filter: 'blur(100px)' }} />
          <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: `radial-gradient(circle, ${c.yellow}10, transparent 60%)`, bottom: -80, right: '10%', filter: 'blur(80px)' }} />
          <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: `radial-gradient(circle, ${c.mint}0e, transparent 60%)`, top: '40%', left: -50, filter: 'blur(60px)' }} />
        </div>

        {/* Floating header */}
        <div style={{
          position: 'absolute', top: 16, left: 16, right: 16,
          ...card(c.cardBg, { borderRadius: 12 }),
          padding: '12px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
          zIndex: 10,
        }}>
          <NeliotLogo size={28} fill={c.pink} stroke={c.borderColor} accent={c.yellow} />
          <span style={{ fontFamily: ff.display, fontWeight: 900, fontSize: 16, color: c.borderColor, letterSpacing: '-0.02em' }}>Neliöt</span>
          <div style={{
            marginLeft: 'auto',
            background: dark ? c.surfaceAlt : '#f8f8f8',
            border: `2px solid ${c.borderColor}`,
            borderRadius: 8,
            padding: '6px 14px',
            display: 'flex', alignItems: 'center', gap: 8, minWidth: 180,
            boxShadow: 'none',
          }}>
            <span style={{ fontSize: 12, opacity: 0.5 }}>🔍</span>
            <span style={{ fontFamily: ff.body, fontSize: 12, color: c.text3 }}>Hae postinumero...</span>
          </div>
          <div style={{
            padding: '6px 14px', fontFamily: ff.mono, fontSize: 13, fontWeight: 700,
            background: c.pink, color: c.borderColor, border: `2px solid ${c.borderColor}`, borderRadius: 8,
            boxShadow: `3px 3px 0px ${c.borderColor}`,
          }}>2024</div>
        </div>

        {/* Floating stats panel — bottom left */}
        <div style={{
          position: 'absolute', top: 80, left: 16, width: 260,
          ...card(c.cardBg, { borderRadius: 12 }),
          padding: 22,
          zIndex: 5,
        }}>
          <div style={{ position: 'absolute', top: -1, left: 16, right: 16, height: 4, background: c.pink, borderRadius: '0 0 4px 4px' }} />
          <div style={{
            ...pill(c.yellow, c.borderColor, { boxShadow: '2px 2px 0 ' + c.borderColor }),
            marginBottom: 14, fontSize: 11,
          }}>
            <span style={{ fontSize: 8 }}>📍</span>
            00100 HELSINKI
          </div>
          <div style={{ fontFamily: ff.display, fontSize: 36, fontWeight: 900, color: c.text1, letterSpacing: '-0.03em', lineHeight: 1 }}>6 842</div>
          <div style={{ fontFamily: ff.body, fontSize: 12, color: c.text3, marginTop: 6 }}>€ per m² · Kerrostalo</div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <div style={{ ...card(dark ? c.surfaceAlt : c.pinkPale, { borderRadius: 8, boxShadow: '2px 2px 0 ' + c.borderColor }), padding: '8px 10px', flex: 1, textAlign: 'center' as const }}>
              <div style={{ fontFamily: ff.mono, fontSize: 14, fontWeight: 700, color: c.text1 }}>234</div>
              <div style={{ fontFamily: ff.body, fontSize: 9, color: c.text3, marginTop: 2 }}>Kauppoja</div>
            </div>
            <div style={{ ...card(dark ? c.surfaceAlt : c.yellowPale, { borderRadius: 8, boxShadow: '2px 2px 0 ' + c.borderColor }), padding: '8px 10px', flex: 1, textAlign: 'center' as const }}>
              <div style={{ fontFamily: ff.mono, fontSize: 14, fontWeight: 700, color: c.text1 }}>1962</div>
              <div style={{ fontFamily: ff.body, fontSize: 9, color: c.text3, marginTop: 2 }}>Mediaani</div>
            </div>
          </div>
        </div>

        {/* Building tooltip — center-right of map */}
        <div style={{
          position: 'absolute', top: '42%', right: '22%',
          ...card(c.cardBg, { borderRadius: 10, boxShadow: c.shadowPink }),
          padding: '12px 16px',
          zIndex: 5,
        }}>
          <div style={{ fontFamily: ff.display, fontSize: 13, fontWeight: 700, color: c.text1 }}>Mannerheimintie 12</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
            <span style={pill(c.mint, c.borderColor, { fontSize: 11, padding: '2px 10px' })}>5 120 €/m²</span>
            <span style={{ fontFamily: ff.body, fontSize: 10, color: c.text3 }}>1965 · 6 krs</span>
          </div>
        </div>

        {/* Legend — bottom center */}
        <div style={{
          position: 'absolute', bottom: 16, left: 16, right: 16,
          ...card(c.cardBg, { borderRadius: 10, boxShadow: c.shadowSm }),
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 14,
          zIndex: 5,
        }}>
          <div style={{ fontFamily: ff.body, fontSize: 10, fontWeight: 600, color: c.text3, letterSpacing: '0.02em', whiteSpace: 'nowrap' as const }}>€/m²</div>
          <div style={{ display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden', border: `2px solid ${c.borderColor}`, flex: 1 }}>
            {priceColors.map((col, i) => (
              <div key={i} style={{ flex: 1, height: 12, background: col }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 24, fontFamily: ff.mono, fontSize: 9, color: c.text3, fontWeight: 600, whiteSpace: 'nowrap' as const }}>
            <span>1K</span><span>5K</span><span>10K+</span>
          </div>
        </div>
      </div>
    </div>
  )
}
