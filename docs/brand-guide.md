# Hintakartta Brand Guide

## Brand Identity

**Name:** Neliöt
**Tagline:** Löydä koti, jota et tiennyt etsiväsi.
**Archetype:** The Explorer — empowering, transparent, challenger
**Tone:** Direct but warm. Data-transparent, not salesy. Empowers buyers and sellers to connect without middlemen.

## Logo System

### Primary Logo
**HINTAKARTTA** set in Inconsolata (Ligconsolata) bold, all-caps, wide tracking (0.08em), with a horizontal gradient tint matching the Voronoi price map colors:

```
teal #0d9488 -> bright teal #2dd4bf -> lime #a3e635 -> yellow #facc15 -> amber #f59e0b -> deep amber #b45309
```

The logo IS the data — the gradient across the letterforms directly references the price visualization on the map. The monospace font communicates precision and technical authority.

### Logo Variants

| Asset | Path | Usage |
|---|---|---|
| Full wordmark (SVG) | `/public/logo-full.svg` | Landing pages, marketing |
| Short mark "HK" (SVG) | `/public/logo-mark.svg` | Compact contexts, social avatars |
| Minimal "HK" (32x32) | `/public/logo-mark-minimal.svg` | Very small contexts |
| Favicon (SVG) | `/app/icon.svg` | Browser tab |
| React component | `@/app/components/brand/LogoMark.tsx` | In-app header |

### Clear Space
Minimum clear space = cap-height of the text on all sides.

### Don'ts
- Don't use a separate symbol/icon mark — the text IS the logo
- Don't set in any other font — Inconsolata/Ligconsolata only
- Don't use flat/single color unless on a very busy background (then use white)
- Don't place on light backgrounds — designed for dark contexts

---

## Color Palette

### Primary Colors

| Name | Hex | HSL | Usage |
|---|---|---|---|
| **Background** | `#0A0E1A` | 224 33% 5% | App background, cards |
| **Surface** | `#111827` | 222 28% 7% | Elevated surfaces, inputs |
| **Surface Elevated** | `#1E2536` | 222 20% 16% | Hover states, tertiary |
| **Amber (Accent)** | `#F59E0B` | 38 92% 50% | Primary CTA, brand accent |
| **Amber Hover** | `#FBBF24` | 44 96% 56% | Hover states |
| **Amber Light** | `#FCD34D` | 48 96% 65% | Highlights, gradient end |
| **Amber Dark** | `#D97706` | 32 93% 44% | Pressed states, gradient start |
| **Teal** | `#0D9488` | 175 88% 30% | Secondary accent, data |
| **Teal Light** | `#2DD4BF` | 170 69% 50% | Interactive elements |
| **Teal Dark** | `#0F766E` | 175 88% 26% | Pressed states |

### Text Hierarchy

| Level | Color | Opacity | Usage |
|---|---|---|---|
| Primary | `#F8FAFC` | 100% | Headings, key data |
| Secondary | `#94A3B8` | ~62% | Body text, labels |
| Muted | `#64748B` | ~40% | Captions, placeholders |
| Disabled | — | 30% | Inactive elements |

### Borders
- Default: `rgba(255, 255, 255, 0.08)`
- Hover: `rgba(255, 255, 255, 0.15)`
- Focus ring: Amber `#F59E0B`

### Price Visualization Scale
Sequential, colorblind-safe palette (indigo -> teal -> amber):

| Step | Hex | Represents |
|---|---|---|
| 1 | `#1E1B4B` | Lowest prices (deep indigo) |
| 2 | `#312E81` | |
| 3 | `#115E59` | |
| 4 | `#0D9488` | Below average (teal) |
| 5 | `#2DD4BF` | |
| 6 | `#A3E635` | Average (lime transition) |
| 7 | `#FACC15` | |
| 8 | `#F59E0B` | Above average (amber) |
| 9 | `#D97706` | |
| 10 | `#B45309` | Highest prices (deep amber) |

---

## Typography

### Font Stack

| Role | Font | Weight | CSS Variable |
|---|---|---|---|
| **Brand / Logo** | Inconsolata (Ligconsolata) | 700 | `--font-brand` |
| **Headings / UI** | Inter | 500-700 | `--font-body` |
| **Body / UI** | Inter | 400-500 | `--font-body` |
| **Data / Numbers** | JetBrains Mono | 400-600 | `--font-mono` |

### Font Personality
- **Inconsolata bold** — the brand font. Used ONLY for the logo wordmark and key brand moments. Monospace precision communicates data authority. All-caps with wide tracking.
- **Inter** — the workhorse. Headings, body, UI. Clean, trustworthy, excellent tabular figures. Tight letter-spacing on headings (-0.02em).
- **JetBrains Mono** — data display. All prices, statistics, numeric readouts. Tabular figures for column alignment.

### Sizing Scale

| Element | Size | Weight | Notes |
|---|---|---|---|
| Brand wordmark | 15px | 700 | Inconsolata, uppercase, 0.08em tracking |
| Section heading | 18px | 600 | Inter |
| Card heading | 14-16px | 500 | Inter |
| Body text | 14px | 400 | Inter |
| Small text | 12px | 400 | Inter |
| Caption / label | 11px | 500 | Inter, uppercase optional |
| Price display (hero) | 32-48px | 700 | JetBrains Mono, tabular-nums |
| Price display (inline) | 14-16px | 600 | JetBrains Mono, tabular-nums |
| Attribution | 10px | 400 | Inter |

### Numeric Display Rules
- Always use `font-variant-numeric: tabular-nums` for price columns
- Use `data-number` attribute or `.font-data` class
- Format: `3 450 EUR/m2` (Finnish space as thousands separator)
- No decimals for per-sqm prices

---

## UI Components

### Glass Panels
Floating panels over the map use glassmorphism:
```css
backdrop-filter: blur(16px);
background: rgba(10, 14, 26, 0.88);
border: 1px solid rgba(255, 255, 255, 0.08);
border-radius: 12px;
```

### Shadows
- `glass`: `0 8px 32px rgba(0, 0, 0, 0.4)` — panels, modals
- `glass-sm`: `0 4px 16px rgba(0, 0, 0, 0.25)` — cards, dropdowns
- `glow`: `0 0 20px rgba(245, 158, 11, 0.25)` — active states (amber)
- `glow-teal`: `0 0 20px rgba(13, 148, 136, 0.25)` — secondary glow

### Button States
| State | Background | Text | Border |
|---|---|---|---|
| Primary | `#F59E0B` | `#0A0E1A` | none |
| Primary hover | `#FBBF24` | `#0A0E1A` | none |
| Secondary | transparent | `#F8FAFC` | `rgba(255,255,255,0.08)` |
| Secondary hover | `rgba(255,255,255,0.05)` | `#F8FAFC` | `rgba(255,255,255,0.15)` |
| Ghost | transparent | `#94A3B8` | none |
| Ghost hover | `rgba(255,255,255,0.05)` | `#F8FAFC` | none |

### Border Radius
- `radius`: 12px (default for cards, panels)
- `md`: 10px (buttons, inputs)
- `sm`: 8px (tags, small elements)
- `full`: 9999px (badges, pills)

---

## Map-as-Brand

The dark-theme Voronoi tessellation with smooth IDW-interpolated price gradients IS the brand identity. The distinctive look of the map should be recognizable across all touchpoints.

### Principles
1. The same color palette from the map (indigo->teal->amber) flows through all brand materials
2. Hero images use cropped map screenshots of recognizable areas
3. Social media templates show map crops with price annotations
4. Animated map panning on the landing page hero section
5. The dark basemap (CartoCDN Dark Matter) is inseparable from the brand

### Social Media Content Format
- Dark background with map crop
- Price annotation in amber/gold
- HINTAKARTTA gradient wordmark in corner
- Example: "Kallion ja Eiran neliohintaero: 2 340 EUR/m2"

---

## File Reference

| File | Purpose |
|---|---|
| `app/globals.css` | CSS custom properties, glass utilities, `.font-brand` class |
| `tailwind.config.ts` | Color tokens, `font-brand` family, shadows |
| `app/layout.tsx` | Inconsolata + Inter + JetBrains Mono loading, metadata |
| `app/components/brand/LogoMark.tsx` | React gradient wordmark component |
| `public/logo-full.svg` | Full "HINTAKARTTA" wordmark (SVG) |
| `public/logo-mark.svg` | Short "HK" mark (SVG) |
| `public/logo-mark-minimal.svg` | Minimal "HK" mark (32x32 SVG) |
| `app/icon.svg` | Favicon — "HK" gradient on dark rounded rect |
| `docs/brand-research.md` | Competitive analysis and research (Phase 1) |
