'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { MapPin, ChevronDown, Building2, TrendingUp, Layers, HandCoins, Eye, Sparkles } from 'lucide-react'
import { cn } from '@/app/lib/utils'
import { trackFaqAccordion } from '@/app/lib/analytics'
import { useInView } from '@/app/hooks/useInView'
import { LogoMark } from '@/app/components/brand/LogoMark'
import type { LucideIcon } from 'lucide-react'

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Building2,
    title: 'Jokainen rakennus — ei vain myynnissä olevat',
    description: 'Asuntoportaaleissa näet vain sen, mitä joku on päättänyt laittaa myyntiin. Neliöissä näet 266 000 rakennuksen hinta-arvion — myös sen talon, jota kukaan ei vielä myy.',
  },
  {
    icon: Layers,
    title: 'Läpinäkyvä hinnan muodostus',
    description: 'Hinta-arvio ei ole yksi numero. Näet erikseen, miten rakennusvuosi, vesistön läheisyys, sijainti, koko ja aluekerroin vaikuttavat — ja ymmärrät, miksi naapuritalo maksaa eri verran.',
  },
  {
    icon: HandCoins,
    title: 'Myy ilman välittäjää',
    description: 'Lisää osoitteesi asetuksissa ja merkitse asuntosi myyntiin — kiinnostuneet ostajat löytävät sinut suoraan kartalta. Säästät välityspalkkion — tyypillisesti 3–5 % kauppahinnasta.',
  },
  {
    icon: Eye,
    title: 'Löydä kohde ennen muita',
    description: 'Näetkö talon, joka kiinnostaa? Merkitse se. Jos omistaja harkitsee myyntiä, yhteys syntyy — ennen kuin kohde ilmestyy muualle.',
  },
  {
    icon: Sparkles,
    title: 'Kuvaa unelma-asuntosi omin sanoin',
    description: '"Kolmio Kalliossa lähellä metroa alle 5 000 €/m²" — tekoäly etsii kartalta rakennukset, jotka vastaavat kuvaustasi.',
  },
  {
    icon: TrendingUp,
    title: 'Seuraa markkinan suuntaa',
    description: 'Miten alueesi neliöhinta on kehittynyt vuosina 2018–2024? Vertaile postinumeroalueita ja tunnista nousevat alueet.',
  },
]

const CITIES = [
  { name: 'Helsinki', sub: '+ Espoo, Vantaa, Kauniainen' },
  { name: 'Tampere', sub: '+ Pirkkala, Nokia, Ylöjärvi' },
  { name: 'Turku', sub: '+ Kaarina, Raisio, Naantali' },
  { name: 'Oulu', sub: null },
  { name: 'Jyväskylä', sub: null },
  { name: 'Kuopio', sub: null },
  { name: 'Lahti', sub: null },
]

interface FAQItem {
  question: string
  answer: string | string[]
}

const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'Miksi hinta-arvio voi poiketa todellisesta kauppahinnasta?',
    answer: [
      'Algoritmimme tuntee rakennuksen — mutta ei yksittäistä asuntoa. Se tietää talon iän, sijainnin, koon ja alueen hintatason, mutta ei näe juuri remontoitua keittiötä, parveketta etelään tai märkää kellaria.',
      'Siksi lopullinen kauppahinta muodostuu aina ostajan ja myyjän välillä. Hinta-arvio kertoo, mistä lähtökohdasta neuvottelu kannattaa aloittaa — ja mitkä tekijät siihen vaikuttavat.',
    ],
  },
  {
    question: 'Miten Neliöt eroaa perinteisistä asuntoportaaleista?',
    answer: [
      'Asuntoportaaleissa näet vain kohteet, jotka joku on päättänyt laittaa myyntiin — välittäjän asettamalla hinnalla. Neliöissä näet jokaisen rakennuksen riippumatta siitä, onko se myynnissä vai ei.',
      'Voit ilmaista kiinnostuksesi mihin tahansa rakennukseen kartalla. Myyjänä lisäät osoitteesi asetuksissa ja merkitset asuntosi myyntiin — ilman välittäjää ja ilman välityspalkkiota.',
    ],
  },
  {
    question: 'Miten hinta-arviot lasketaan?',
    answer: [
      'Jokaisen rakennuksen hinta-arvio perustuu kuuteen tekijään:',
      '1. Perushinta — Tilastokeskuksen toteutuneet kauppahinnat (€/m²) postinumero- ja talotyyppitasolla.',
      '2. Ikäkerroin — Rakennusvuosi vaikuttaa hintaan U-käyrämäisesti: uudisrakentaminen ja historialliset talot ovat arvostetumpia, kun taas 1960–80-luvun elementtirakentaminen on edullisinta.',
      '3. Vesistökerroin — Etäisyys lähimpään järveen tai mereen nostaa hintaa jopa 35 %.',
      '4. Kerroskerroin — Esimerkiksi yksikerroksisissa rivitaloissa ja korkeissa kerrostaloissa on pieni preemio.',
      '5. Kokokerroin — Pienemmät kerrostalot ovat tyypillisesti arvokkaampia neliöltä.',
      '6. Aluekerroin — Alueen toteutunut hintataso suhteessa tilastohintoihin, kalibroitu markkinadatasta.',
    ],
  },
  {
    question: 'Miten osto- ja myyntisignaalit toimivat?',
    answer: [
      'Ostajana klikkaat rakennusta kartalla ja merkitset kiinnostuksesi — voit kertoa, millaista asuntoa etsit.',
      'Myyjänä lisäät asuntosi osoitteen asetuksissa ja merkitset sen myyntiin yhdellä napilla. Kiinnostuneet ostajat näkevät ilmoituksesi suoraan kartalla.',
      'Signaalit näkyvät kartalla anonyymisti: muut näkevät, että rakennuksessa on kiinnostuneita tai myyntiaikeita. Osto-kiinnostukset ovat voimassa 90 päivää, myynti-ilmoitukset 180 päivää.',
    ],
  },
  {
    question: 'Mistä data tulee?',
    answer: [
      'Tilastokeskus (Paavo & StatFin) — Postinumeroalueiden rajat, väestötiedot ja toteutuneet asuntokauppahinnat. CC BY 4.0.',
      'OpenStreetMap — Rakennusten pohjapiirrokset kartalla.',
      'SYKE Ryhti-rekisteri — Rakennusvuosi, kerrosluku, asuntomäärä ja käyttötarkoitus. CC BY 4.0.',
      'Maanmittauslaitos — Osoitetiedot rakennuksille.',
    ],
  },
]

const STATS: { value: number; label: string; format: boolean }[] = [
  { value: 24783, label: 'Kerrostaloa', format: true },
  { value: 47451, label: 'Rivitaloa', format: true },
  { value: 194610, label: 'Omakotitaloa', format: true },
  { value: 106, label: 'Kuntaa', format: false },
]

// ---------------------------------------------------------------------------
// AnimatedCounter — rolls up from 0 to target when in view
// ---------------------------------------------------------------------------

function AnimatedCounter({
  target,
  format = false,
  inView,
}: {
  target: number
  format?: boolean
  inView: boolean
}) {
  const [current, setCurrent] = useState(0)
  const hasAnimated = useRef(false)

  useEffect(() => {
    if (!inView || hasAnimated.current) return
    hasAnimated.current = true

    const duration = 1400
    const steps = 48
    const stepTime = duration / steps
    let step = 0

    const timer = setInterval(() => {
      step++
      // Ease-out cubic
      const progress = 1 - Math.pow(1 - step / steps, 3)
      setCurrent(Math.round(target * progress))
      if (step >= steps) {
        setCurrent(target)
        clearInterval(timer)
      }
    }, stepTime)

    return () => clearInterval(timer)
  }, [inView, target])

  const display = format
    ? current.toLocaleString('fi-FI')
    : String(current)

  return (
    <span className="tabular-nums font-mono">
      {display}
    </span>
  )
}

// ---------------------------------------------------------------------------
// FAQAccordion — with smooth height animation
// ---------------------------------------------------------------------------

function FAQAccordion({ item, index, inView }: { item: FAQItem; index: number; inView: boolean }) {
  const [isOpen, setIsOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  const answerLines = Array.isArray(item.answer) ? item.answer : [item.answer]

  useEffect(() => {
    if (contentRef.current) {
      setHeight(isOpen ? contentRef.current.scrollHeight : 0)
    }
  }, [isOpen])

  return (
    <div
      className={cn(
        'rounded-xl border-2 bg-white overflow-hidden transition-all duration-300',
        isOpen ? 'border-pink shadow-hard-sm' : 'border-[#1a1a1a]/10 hover:border-[#1a1a1a]/20',
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
      style={{
        transitionDelay: inView ? `${index * 80}ms` : '0ms',
        transitionProperty: 'opacity, transform, border-color, box-shadow',
      }}
    >
      <button
        onClick={() => {
          const next = !isOpen
          setIsOpen(next)
          if (next) trackFaqAccordion({ question: item.question, opened: true })
        }}
        className="flex w-full items-center justify-between cursor-pointer px-4 py-3 md:px-5 md:py-4 text-sm md:text-base font-display font-bold text-[#1a1a1a] text-left"
      >
        <span className="pr-4">{item.question}</span>
        <ChevronDown
          size={18}
          className={cn(
            'flex-shrink-0 text-[#999] transition-transform duration-300',
            isOpen && 'rotate-180 text-pink'
          )}
        />
      </button>
      <div
        className="overflow-hidden transition-[height] duration-300 ease-out"
        style={{ height }}
      >
        <div ref={contentRef} className="px-4 pb-4 md:px-5 md:pb-5 text-sm text-muted-foreground space-y-2 leading-relaxed">
          {answerLines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Floating decorative shapes that flee the cursor
// ---------------------------------------------------------------------------

interface Shape {
  id: number
  x: number       // % position
  y: number       // % position
  baseX: number   // home position
  baseY: number
  size: number    // px
  className: string
  rotation: number
  floatSpeed: number  // base drift speed
  floatPhase: number  // animation offset
}

const SHAPE_DEFS: Omit<Shape, 'x' | 'y' | 'floatPhase'>[] = [
  { id: 0, baseX: 85, baseY: 10, size: 80, className: 'rounded-full bg-pink/15', rotation: 0, floatSpeed: 0.8 },
  { id: 1, baseX: 8, baseY: 35, size: 56, className: 'rounded-xl bg-yellow/20 border-2 border-yellow/20', rotation: 12, floatSpeed: 0.6 },
  { id: 2, baseX: 80, baseY: 75, size: 96, className: 'rounded-full bg-mint/15', rotation: 0, floatSpeed: 0.7 },
  { id: 3, baseX: 12, baseY: 55, size: 16, className: 'rounded-full bg-pink/30', rotation: 0, floatSpeed: 1.2 },
  { id: 4, baseX: 22, baseY: 15, size: 12, className: 'rounded-full bg-yellow/40', rotation: 0, floatSpeed: 1.0 },
  { id: 5, baseX: 50, baseY: 20, size: 40, className: 'rounded-lg bg-mint/10 border-2 border-mint/15', rotation: -8, floatSpeed: 0.5 },
  { id: 6, baseX: 70, baseY: 45, size: 20, className: 'rounded-full bg-pink/20', rotation: 0, floatSpeed: 0.9 },
  { id: 7, baseX: 35, baseY: 70, size: 28, className: 'rounded-xl bg-yellow/15 border-2 border-yellow/10', rotation: 20, floatSpeed: 0.7 },
]

const REPEL_RADIUS = 150   // px — how close the mouse needs to be
const REPEL_STRENGTH = 60  // px — max push distance
const RETURN_SPEED = 0.08  // spring factor (0–1, lower = slower return)

function HeroDecorations() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mouseRef = useRef({ x: -1000, y: -1000 })
  const shapesRef = useRef<{ dx: number; dy: number }[]>(SHAPE_DEFS.map(() => ({ dx: 0, dy: 0 })))
  const frameRef = useRef(0)
  const [reducedMotion, setReducedMotion] = useState(false)

  // Stable initial shapes with random phases
  const initialShapes = useMemo<Shape[]>(() =>
    SHAPE_DEFS.map((s) => ({
      ...s,
      x: s.baseX,
      y: s.baseY,
      floatPhase: s.id * 1.3,
    })),
    []
  )

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReducedMotion(true)
      return
    }

    const container = containerRef.current
    if (!container) return

    const handleMouse = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const handleLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 }
    }

    // Listen on document so shapes react even when pointer is over text
    container.addEventListener('mousemove', handleMouse)
    container.addEventListener('mouseleave', handleLeave)

    let time = 0
    const animate = () => {
      time += 0.016
      const rect = container.getBoundingClientRect()
      const shapes = shapesRef.current
      const els = container.children

      for (let i = 0; i < initialShapes.length; i++) {
        const s = initialShapes[i]
        // Shape center in px
        const cx = (s.baseX / 100) * rect.width
        const cy = (s.baseY / 100) * rect.height

        // Float drift (gentle sine wave)
        const floatX = Math.sin(time * s.floatSpeed + s.floatPhase) * 8
        const floatY = Math.cos(time * s.floatSpeed * 0.7 + s.floatPhase) * 10

        // Mouse repulsion
        const mx = mouseRef.current.x
        const my = mouseRef.current.y
        const distX = (cx + shapes[i].dx) - mx
        const distY = (cy + shapes[i].dy) - my
        const dist = Math.sqrt(distX * distX + distY * distY)

        let pushX = 0
        let pushY = 0
        if (dist < REPEL_RADIUS && dist > 0) {
          const force = (1 - dist / REPEL_RADIUS) * REPEL_STRENGTH
          pushX = (distX / dist) * force
          pushY = (distY / dist) * force
        }

        // Spring back to home + apply push
        const targetX = floatX + pushX
        const targetY = floatY + pushY
        shapes[i].dx += (targetX - shapes[i].dx) * RETURN_SPEED
        shapes[i].dy += (targetY - shapes[i].dy) * RETURN_SPEED

        // Apply transform directly (no React state — 60fps)
        const el = els[i] as HTMLElement
        if (el) {
          el.style.transform = `translate(${shapes[i].dx}px, ${shapes[i].dy}px) rotate(${s.rotation + Math.sin(time * 0.5 + s.floatPhase) * 3}deg)`
        }
      }

      frameRef.current = requestAnimationFrame(animate)
    }

    frameRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(frameRef.current)
      container.removeEventListener('mousemove', handleMouse)
      container.removeEventListener('mouseleave', handleLeave)
    }
  }, [initialShapes, reducedMotion])

  if (reducedMotion) {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {initialShapes.map((s) => (
          <div
            key={s.id}
            className={`absolute ${s.className}`}
            style={{
              left: `${s.baseX}%`,
              top: `${s.baseY}%`,
              width: s.size,
              height: s.id === 2 ? s.size / 3 : s.size,
              transform: `rotate(${s.rotation}deg)`,
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden pointer-events-auto" aria-hidden="true" style={{ zIndex: 0 }}>
      {initialShapes.map((s) => (
        <div
          key={s.id}
          className={`absolute transition-none will-change-transform ${s.className}`}
          style={{
            left: `${s.baseX}%`,
            top: `${s.baseY}%`,
            width: s.size,
            height: s.id === 2 ? s.size / 3 : s.size,
          }}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FAQPage() {
  // Scroll-triggered sections
  const [heroRef, heroInView] = useInView()
  const [statsRef, statsInView] = useInView(0.3)
  const [featuresRef, featuresInView] = useInView()
  const [citiesRef, citiesInView] = useInView()
  const [faqRef, faqInView] = useInView()
  const [ctaRef, ctaInView] = useInView()

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      {/* Header */}
      <header className="border-b-2 border-[#1a1a1a] bg-[#FFFBF5] sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <LogoMark size={30} />
            <span className="font-brand text-xl tracking-tight text-[#1a1a1a]">
              Neliöt
            </span>
          </Link>
          <Link
            href="/"
            className="neo-press flex items-center gap-2 bg-[#1a1a1a] text-white font-display font-bold text-sm px-4 py-2 rounded-full border-2 border-[#1a1a1a] hover:bg-pink transition-colors"
          >
            <MapPin size={16} />
            <span className="hidden sm:inline">Karttanäkymä</span>
            <span className="sm:hidden">Kartta</span>
          </Link>
        </div>
      </header>

      <main>
        {/* ── Hero section ── */}
        <section ref={heroRef} className="relative overflow-hidden border-b-2 border-[#1a1a1a]/10">
          <div className="absolute inset-0 bg-gradient-to-br from-[#FFFBF5] via-[#fff0f8] to-[#fff8e0] opacity-60 pointer-events-none" />
          <HeroDecorations />
          <div className="relative max-w-4xl mx-auto px-4 py-14 md:py-24 text-center pointer-events-none" style={{ zIndex: 1 }}>
            <h1
              className={cn(
                'text-3xl md:text-5xl font-display font-black text-[#1a1a1a] leading-tight transition-all duration-700 delay-150',
                heroInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
              )}
            >
              Löydä koti, jota et<br className="hidden md:block" /> tiennyt etsiväsi.
            </h1>
            <p
              className={cn(
                'mt-4 md:mt-6 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed transition-all duration-700 delay-300',
                heroInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
              )}
            >
              Neliöt näyttää jokaisen asuinrakennuksen hinta-arvion ja sen muodostavat tekijät — avoimesti ja
              läpinäkyvästi. Kun löydät kiinnostavan kohteen, voit tavoittaa myyjän suoraan.
              Ilman välittäjää, ilman välityspalkkiota.
            </p>
          </div>
        </section>

        {/* ── Stats strip ── */}
        <section ref={statsRef} className="border-b-2 border-[#1a1a1a]/10">
          <div className="max-w-3xl mx-auto px-4 py-8 md:py-10">
            <div className="grid grid-cols-2 md:grid-cols-4">
              {STATS.map((stat, i) => (
                <div
                  key={stat.label}
                  className={cn(
                    'flex flex-col items-center py-3 md:py-0 transition-all duration-500',
                    i < STATS.length - 1 && 'md:border-r md:border-[#1a1a1a]/10',
                    i < 2 && 'border-b md:border-b-0 border-[#1a1a1a]/10',
                    statsInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                  )}
                  style={{ transitionDelay: statsInView ? `${i * 100}ms` : '0ms' }}
                >
                  <div className="text-2xl md:text-[1.75rem] font-black text-[#1a1a1a] leading-none">
                    <AnimatedCounter
                      target={stat.value}
                      format={stat.format}
                      inView={statsInView}
                    />
                  </div>
                  <div className="text-[11px] md:text-xs text-[#1a1a1a]/50 font-mono uppercase tracking-wider mt-1.5">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features grid ── */}
        <section ref={featuresRef} id="miten-toimii" className="max-w-4xl mx-auto px-4 py-12 md:py-16 scroll-mt-20">
          <h2
            className={cn(
              'text-xl md:text-2xl font-display font-black text-[#1a1a1a] text-center transition-all duration-600',
              featuresInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            )}
          >
            Miten Neliöt toimii?
          </h2>
          <p
            className={cn(
              'mt-2 text-sm md:text-base text-muted-foreground text-center max-w-xl mx-auto transition-all duration-600 delay-100',
              featuresInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            )}
          >
            Avoin data, läpinäkyvät hinnat ja suora yhteys ostajan ja myyjän välillä.
          </p>
          <div className="mt-8 md:mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon
              return (
                <div
                  key={feature.title}
                  className={cn(
                    'neo-lift rounded-xl border-2 border-[#1a1a1a]/10 bg-white p-5 cursor-default',
                    'hover:border-pink hover:shadow-hard-sm transition-all duration-300',
                    'group',
                    featuresInView ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95'
                  )}
                  style={{
                    transitionDelay: featuresInView ? `${200 + i * 80}ms` : '0ms',
                    transitionProperty: 'opacity, transform, border-color, box-shadow',
                  }}
                >
                  <div className="h-9 w-9 rounded-lg bg-pink-baby flex items-center justify-center group-hover:bg-pink/20 group-hover:scale-110 transition-all duration-200">
                    <Icon size={18} className="text-[#1a1a1a]" />
                  </div>
                  <h3 className="mt-3 text-sm font-display font-bold text-[#1a1a1a]">{feature.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── Cities ── */}
        <section ref={citiesRef} className="border-y-2 border-[#1a1a1a]/10 bg-white">
          <div className="max-w-4xl mx-auto px-4 py-10 md:py-14">
            <h2
              className={cn(
                'text-xl md:text-2xl font-display font-black text-[#1a1a1a] text-center transition-all duration-600',
                citiesInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              )}
            >
              Mukana olevat kaupungit
            </h2>
            <div className="mt-6 md:mt-8 flex flex-wrap justify-center gap-2 md:gap-3">
              {CITIES.map((city, i) => (
                <span
                  key={city.name}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border-2 border-[#1a1a1a]/10 bg-[#FFFBF5] px-4 py-2 text-sm font-display font-bold text-[#1a1a1a]',
                    'hover:border-pink hover:bg-pink-pale hover:shadow-hard-sm transition-all duration-200 cursor-default',
                    citiesInView ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
                  )}
                  style={{
                    transitionDelay: citiesInView ? `${100 + i * 60}ms` : '0ms',
                    transitionDuration: '400ms',
                    transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                >
                  <MapPin size={13} className="text-pink" />
                  {city.name}
                  {city.sub && (
                    <span className="text-xs font-body font-normal text-muted-foreground hidden md:inline">
                      {city.sub}
                    </span>
                  )}
                </span>
              ))}
            </div>
            <p
              className={cn(
                'mt-4 text-xs text-muted-foreground text-center transition-all duration-500 delay-700',
                citiesInView ? 'opacity-100' : 'opacity-0'
              )}
            >
              Laajennamme kattavuutta jatkuvasti.
            </p>
          </div>
        </section>

        {/* ── FAQ accordion ── */}
        <section ref={faqRef} className="max-w-3xl mx-auto px-4 py-12 md:py-16">
          <h2
            className={cn(
              'text-xl md:text-2xl font-display font-black text-[#1a1a1a] text-center transition-all duration-600',
              faqInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            )}
          >
            Usein kysytyt kysymykset
          </h2>
          <p
            className={cn(
              'mt-2 text-sm text-muted-foreground text-center transition-all duration-600 delay-100',
              faqInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            )}
          >
            Hinnoittelusta, markkinapaikasta ja datalähteistä.
          </p>

          <div className="mt-8 md:mt-10 space-y-2.5">
            {FAQ_ITEMS.map((item, i) => (
              <FAQAccordion key={item.question} item={item} index={i} inView={faqInView} />
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section ref={ctaRef} className="max-w-3xl mx-auto px-4 pb-12 md:pb-16">
          <div
            className={cn(
              'rounded-xl border-2 border-[#1a1a1a] bg-pink-baby p-6 md:p-10 text-center shadow-hard-sm',
              'transition-all duration-700',
              ctaInView ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95'
            )}
          >
            <h2 className="text-lg md:text-xl font-display font-bold text-[#1a1a1a]">
              Löydä kohde, jota kukaan ei vielä myy.
            </h2>
            <p className="text-sm md:text-base text-muted-foreground mt-2 max-w-md mx-auto">
              Klikkaa rakennusta, tutki hinnan muodostuminen ja ota suoraan yhteyttä — ilman välikäsiä.
            </p>
            <div className="mt-5">
              <Link
                href="/"
                className="neo-press inline-flex items-center gap-2 bg-[#1a1a1a] text-white font-display font-bold text-sm px-6 py-3 rounded-full border-2 border-[#1a1a1a] shadow-hard-sm hover:bg-pink hover:shadow-hard transition-all duration-200"
              >
                <MapPin size={16} />
                Avaa kartta
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-[#1a1a1a]/10 bg-[#FFFBF5] py-6">
        <div className="max-w-4xl mx-auto px-4 text-xs text-muted-foreground space-y-2">
          <p>Lähde: Tilastokeskus (CC BY 4.0) | Rakennukset: OpenStreetMap | SYKE Ryhti (CC BY 4.0)</p>
          <p>
            <Link href="/tietosuoja" className="underline underline-offset-2 hover:text-[#1a1a1a] transition-colors">Tietosuojaseloste</Link>
            {' · '}
            <Link href="/kayttoehdot" className="underline underline-offset-2 hover:text-[#1a1a1a] transition-colors">Käyttöehdot</Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
