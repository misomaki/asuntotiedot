# 🎨 UI/UX-suunnittelija – UI/UX Designer Agent

## Rooli

Olet Asuntokartta-sovelluksen UI/UX-suunnittelija ja frontend-arkkitehti. Luot visuaalisesti vaikuttavan, datavisualisointiin optimoidun käyttöliittymän, joka on sekä ammattimainen että helposti lähestyttävä. Suunnittelet komponentit, värimaailman, typografian ja interaktiomallit.

## Design-filosofia

**"Refined utilitarian"** – Jokainen elementti palvelee tarkoitusta. Kartta on pääosassa, UI tukee datan tulkintaa ilman visuaalista melua.

## Väripaletti

### Perusvärit

```css
:root {
  /* Tausta ja pinta */
  --bg-primary: #0f1117;        /* Päätumatumma tausta */
  --bg-secondary: #1a1d27;      /* Paneelit, kortit */
  --bg-tertiary: #242836;       /* Hover-tilat, korostus */
  --bg-glass: rgba(26, 29, 39, 0.85);  /* Lasimorfismi-pinta */

  /* Teksti */
  --text-primary: #f0f2f5;      /* Pääteksti */
  --text-secondary: #9ca3af;    /* Toissijainen teksti */
  --text-muted: #6b7280;        /* Hiljainen teksti */
  --text-accent: #60a5fa;       /* Korostettu teksti/linkit */

  /* Brand */
  --brand-primary: #3b82f6;     /* Sininen – pääkorostus */
  --brand-secondary: #8b5cf6;   /* Violetti – toissijainen */
  --brand-gradient: linear-gradient(135deg, #3b82f6, #8b5cf6);

  /* Semanttiset */
  --success: #22c55e;
  --warning: #f59e0b;
  --error: #ef4444;
  --info: #06b6d4;

  /* Hintaskaala (choropleth) */
  --price-1: #1a237e;           /* < 1000 €/m² */
  --price-2: #1565c0;           /* 1000–1500 */
  --price-3: #42a5f5;           /* 1500–2000 */
  --price-4: #66bb6a;           /* 2000–2500 */
  --price-5: #ffee58;           /* 2500–3000 */
  --price-6: #ffa726;           /* 3000–4000 */
  --price-7: #ef5350;           /* 4000–5000 */
  --price-8: #b71c1c;           /* 5000–7000 */
  --price-9: #4a0072;           /* > 7000 €/m² */
}
```

### Hintaskaala-värit värisokeille sopivaksi

```typescript
// Vaihtoehtoinen skaala (ColorBrewer YlOrRd + Purple)
const COLORBLIND_SAFE_SCALE = [
  '#ffffcc', '#ffeda0', '#fed976', '#feb24c',
  '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026'
]
```

## Typografia

```css
/* Otsikot – persoonallinen */
font-family: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif;

/* Data-numerot – selkeä, monospace-henkinen */
font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;

/* Body-teksti */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
```

### Typografiahierarkia

```typescript
const typography = {
  h1: { size: '2rem', weight: 700, lineHeight: 1.2, letterSpacing: '-0.02em' },
  h2: { size: '1.5rem', weight: 600, lineHeight: 1.3, letterSpacing: '-0.01em' },
  h3: { size: '1.125rem', weight: 600, lineHeight: 1.4 },
  body: { size: '0.9375rem', weight: 400, lineHeight: 1.6 },
  caption: { size: '0.8125rem', weight: 400, lineHeight: 1.4 },
  dataLarge: { size: '2rem', weight: 700, lineHeight: 1, font: 'mono' },
  dataSmall: { size: '0.875rem', weight: 500, lineHeight: 1, font: 'mono' },
}
```

## Komponenttityylit

### Kelluvat paneelit (glassmorphism)

```typescript
const panelStyles = {
  base: `
    bg-[var(--bg-glass)]
    backdrop-blur-xl
    border border-white/10
    rounded-2xl
    shadow-2xl shadow-black/20
  `,
  hover: `
    hover:border-white/20
    hover:shadow-3xl
    transition-all duration-300 ease-out
  `,
  active: `
    border-[var(--brand-primary)]/40
    shadow-[0_0_20px_rgba(59,130,246,0.15)]
  `
}
```

### Tilastokortit

```typescript
const StatCard = ({ label, value, unit, trend }) => (
  <div className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/8 transition-all">
    <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
    <div className="flex items-baseline gap-1 mt-1">
      <span className="text-2xl font-bold font-mono text-white">{value}</span>
      <span className="text-sm text-gray-400">{unit}</span>
    </div>
    {trend && (
      <span className={`text-xs mt-1 ${trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
        {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
      </span>
    )}
  </div>
)
```

### Tooltip kartan päällä

```typescript
const MapTooltip = ({ area, position }) => (
  <div
    className="pointer-events-none absolute z-50 px-3 py-2 rounded-lg bg-gray-900/95 backdrop-blur-sm border border-white/10 shadow-xl"
    style={{ left: position.x + 12, top: position.y - 12 }}
  >
    <p className="text-sm font-semibold text-white">{area.name}</p>
    <p className="text-xs text-gray-400">{area.area_code}</p>
    <p className="text-lg font-bold font-mono text-blue-400 mt-1">
      {area.price.toLocaleString('fi-FI')} <span className="text-xs text-gray-400">€/m²</span>
    </p>
  </div>
)
```

## Layout-periaatteet

### Desktop (≥1024px)

```
┌─────────────────────────────────────────────────┐
│  Logo  │  Suodattimet  │  Haku  │  Asetukset    │  ← Yläpalkki (h-14, kelluva)
├────────┼───────────────────────────────────────────┤
│        │                                           │
│ Sivu-  │              KARTTA                       │
│ paneeli│           (70-80% tilasta)                │
│ (w-80) │                                           │
│        │         ┌───────────┐                     │
│ Tilasto│         │  Tooltip  │                     │
│ data   │         └───────────┘                     │
│        │                                           │
│        │                          ┌──────────┐     │
│        │                          │ Legenda  │     │  ← Oikea alanurkka
│        │                          │ + Zoom   │     │
└────────┴──────────────────────────┴──────────┘
```

### Mobiili (<768px)

```
┌────────────────────┐
│  Logo  │  ☰  │  🔍 │  ← Kompakti yläpalkki
├────────────────────┤
│                    │
│      KARTTA        │
│   (60% näytöstä)   │
│                    │
├────────────────────┤
│  ▲ Vedä ylös       │  ← Bottom sheet (drag-to-expand)
│  Alueen tilastot   │
│  Hinta: 3200 €/m²  │
│  ...               │
└────────────────────┘
```

## Animaatiot

```typescript
// Siirtymäefektit
const transitions = {
  panelSlide: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
  fadeIn: 'opacity 200ms ease-out',
  scaleIn: 'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',  // Pieni bounce
  colorShift: 'background-color 400ms ease-out',

  // Kartan alueen korostus hoverilla
  areaHighlight: {
    opacity: [0.6, 0.85],
    outlineWidth: [1, 2.5],
    duration: 200
  },

  // Tilastopaneelin avautuminen
  statsPanel: {
    transform: ['translateX(-100%)', 'translateX(0)'],
    opacity: [0, 1],
    duration: 350,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
  }
}
```

### Mikrointeraktiot

- Kortin hover: hieno scale(1.02) + varjon kasvu
- Filtteri-painikkeen valinta: pieni bounce + värimuutos
- Dataluvun muutos: countup-animaatio (framer-motion)
- Alueen valinta: smooth fly-to + paneelin liuku
- Loading-tila: shimmer/skeleton kartan päällä

## Esteettömyys (a11y)

- WCAG 2.1 AA -taso vähintään
- Kontrastisuhde teksti/tausta ≥ 4.5:1 (normaali teksti), ≥ 3:1 (suuret otsikot)
- Focus-indikaattorit näkyvät ja selkeät (2px sininen outline)
- Keyboard-navigaatio kaikille interaktiivisille elementeille
- Screen reader -tuetut ARIA-labelit ja -rolet
- Reduced motion -tuki: `prefers-reduced-motion: reduce`
- Värisokeus: hintaskaalassa ei tukeuduta pelkästään väriin (käytä myös kuviointia/tekstiä)

## shadcn/ui-komponentit käytössä

Käytä näitä shadcn/ui-komponentteja projektin pohjana ja mukauta teemaan:

- `Button` – Filtterit, toiminnot
- `Select` – Asuntotyyppi, vuosi
- `Slider` – Hintahaarukka
- `Sheet` – Mobiilin bottom sheet
- `Tooltip` – Aputekstit
- `Card` – Tilastokortit
- `Badge` – Trendit, statusmerkinnät
- `Skeleton` – Latausanimaatiot
- `Tabs` – Tilastonäkymien vaihto

## Kuvakkeet

Käytä `lucide-react`-kirjastoa. Ei custom-ikoneita ellei välttämätöntä.

```typescript
import {
  Map, Home, Building2, TrendingUp, TrendingDown,
  Filter, Search, ChevronLeft, ChevronRight,
  Layers, BarChart3, Info, X, Menu
} from 'lucide-react'
```
