'use client'

import { useState, useEffect, useRef } from 'react'
import { useMapContext } from '@/app/contexts/MapContext'
import { useAuth } from '@/app/contexts/AuthContext'
import { useMarketplaceSignals } from '@/app/hooks/useMarketplaceSignals'
import { cn } from '@/app/lib/utils'
import { formatNumber, getBuildingTypeLabel, formatPriceRange } from '@/app/lib/formatters'
import { computePriceRange } from '@/app/lib/priceEstimation'
import { AnimatedNumber } from '@/app/components/ui/AnimatedNumber'
import { CompactAttribute } from '@/app/components/sidebar/CompactAttribute'
import { Skeleton } from '@/app/components/ui/skeleton'
import {
  Calendar,
  Layers,
  Droplets,
  X,
  ChevronDown,
  Zap,
  Users,
  Home,
  Info,
  GraduationCap,
  ShoppingCart,
  Bus,
  TreePine,
  Heart,
  Baby,
  LandPlot,
  HandCoins,
  Eye,
} from 'lucide-react'
import type { BuildingWithPrice } from '@/app/types'

/**
 * BuildingPanel – Floating card content for a selected building.
 *
 * Layout:
 *   1. Header: address + area info + close button
 *   2. Price card: estimation + collapsible factor breakdown (unified)
 *   3. Attribute grid: type, year, floors, water, footprint, energy, apartments
 *   4. Disclaimer
 */
export function BuildingPanel() {
  const {
    selectedBuilding,
    setSelectedBuilding,
  } = useMapContext()

  const [building, setBuilding] = useState<BuildingWithPrice | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [fetchFailed, setFetchFailed] = useState(false)
  const [showFactors, setShowFactors] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!selectedBuilding) {
      setBuilding(null)
      setFetchFailed(false)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setFetchFailed(false)
    setShowFactors(false)
    fetch(`/api/buildings/${selectedBuilding}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setBuilding(data as BuildingWithPrice)
        if (!data) setFetchFailed(true)
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.error('BuildingPanel fetch error:', err)
        setFetchFailed(true)
      })
      .finally(() => setIsLoading(false))

    return () => controller.abort()
  }, [selectedBuilding])

  function handleClose() {
    setSelectedBuilding(null)
  }

  if (isLoading || (!building && !fetchFailed)) {
    return <BuildingPanelSkeleton onClose={handleClose} />
  }

  if (!building) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2">
        <p className="text-sm text-muted-foreground">
          Rakennustietoja ei löytynyt.
        </p>
        <button
          type="button"
          onClick={handleClose}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Sulje
        </button>
      </div>
    )
  }

  const price = building.estimated_price_per_sqm
  const hasPrice = price !== null && price > 0
  const hasFactors = hasPrice && building.base_price !== null
  const priceRange = hasPrice
    ? computePriceRange(price!, {
        neighborhoodFactor: building.neighborhood_factor,
        hasConstructionYear: building.construction_year !== null,
        hasEnergyClass: building.energy_class !== null,
      })
    : null

  // Resolve building type label
  const typeLabel = building.ryhti_main_purpose
    ? getRyhtiPurposeLabel(building.ryhti_main_purpose)
    : building.building_type
      ? getBuildingTypeLabel(building.building_type)
      : null

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-display font-bold text-foreground truncate">
            {building.address ?? typeLabel ?? 'Rakennus'}
          </h2>
          {building.area_name && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {building.area_code} {building.area_name}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="flex-shrink-0 h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="Sulje"
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Unified price card ── */}
      <div className="rounded-xl bg-pink-pale border-2 border-[#1a1a1a] shadow-hard-sm overflow-hidden">
        {/* Price headline */}
        {hasPrice ? (
          <div className="px-4 pt-3 pb-2.5">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Hinta-arvio</div>
            <div className="text-2xl font-bold text-foreground tabular-nums mt-0.5">
              {formatPriceRange(priceRange!.low, priceRange!.high)}
            </div>
            <div className="text-sm text-muted-foreground mt-0.5">
              Keskiarvo <AnimatedNumber value={price!} fromZero duration={500} />
              <span className="ml-1">€/m²</span>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3">
            <div className="text-xs text-muted-foreground">Hinta-arviota ei saatavilla</div>
          </div>
        )}

        {/* Factor toggle — inline under price */}
        {hasFactors && (
          <>
            <button
              type="button"
              onClick={() => setShowFactors(prev => !prev)}
              className={cn(
                'w-full flex items-center justify-between',
                'px-4 py-2 text-xs cursor-pointer',
                'border-t border-[#1a1a1a]/10',
                'text-muted-foreground hover:text-foreground',
                'hover:bg-pink-baby/30 transition-colors',
              )}
            >
              <span className="font-medium">Näytä erittely</span>
              <ChevronDown
                size={14}
                className={cn(
                  'transition-transform duration-200',
                  showFactors && 'rotate-180',
                )}
              />
            </button>

            {/* Factor breakdown — slides in */}
            {showFactors && (
              <div className="px-4 pb-3 space-y-1.5 text-[13px] animate-fade-in border-t border-[#1a1a1a]/10">
                <div className="pt-2.5">
                  <FactorRow
                    label="Alueen perushinta"
                    value={`${formatBuildingPrice(building.base_price)} €/m²`}
                  />
                </div>

                <FactorRow
                  label="Ikäkerroin"
                  value={formatFactor(building.age_factor)}
                  neutral={building.age_factor === 1}
                  positive={building.age_factor > 1}
                />
                {building.energy_factor !== 1 && (
                  <FactorRow
                    label="Energiakerroin"
                    value={formatFactor(building.energy_factor)}
                    neutral={false}
                    positive={building.energy_factor > 1}
                  />
                )}
                {building.floor_factor !== 1 && (
                  <FactorRow
                    label="Kerroskerroin"
                    value={formatFactor(building.floor_factor)}
                    neutral={false}
                    positive={building.floor_factor > 1}
                  />
                )}
                {building.size_factor !== 1 && (
                  <FactorRow
                    label="Kokokerroin"
                    value={formatFactor(building.size_factor)}
                    neutral={false}
                    positive={building.size_factor > 1}
                  />
                )}

                {building.water_factor !== 1 && (
                  <FactorRow
                    label="Vesikerroin"
                    value={formatFactor(building.water_factor)}
                    neutral={false}
                    positive={building.water_factor > 1}
                  />
                )}
                <FactorRow
                  label="Naapurustokerroin"
                  value={formatFactor(building.neighborhood_factor)}
                  neutral={building.neighborhood_factor === 1}
                  positive={building.neighborhood_factor > 1}
                />
                {building.tontti_factor !== 1 && (
                  <FactorRow
                    label="Tonttikerroin"
                    value={formatFactor(building.tontti_factor)}
                    neutral={false}
                    positive={false}
                  />
                )}

              </div>
            )}
          </>
        )}
      </div>

      {/* ── Building attributes — 2-col grid ── */}
      <div className="grid grid-cols-2 gap-2">
        {typeLabel && (
          <CompactAttribute
            icon={<Home size={14} />}
            label="Tyyppi"
            value={typeLabel}
            delay={0}
          />
        )}
        <CompactAttribute
          icon={<Calendar size={14} />}
          label="Rakennettu"
          value={building.construction_year?.toString() ?? '–'}
          delay={1}
        />
        <CompactAttribute
          icon={<Layers size={14} />}
          label="Kerroksia"
          value={building.floor_count?.toString() ?? '–'}
          delay={2}
        />
        <CompactAttribute
          icon={<Home size={14} />}
          label="Pohja-ala"
          value={
            building.footprint_area_sqm !== null
              ? `${Math.round(building.footprint_area_sqm)} m²`
              : '–'
          }
          delay={3}
        />
        {building.energy_class && (
          <CompactAttribute
            icon={<Zap size={14} />}
            label="Energia"
            value={building.energy_class.toUpperCase()}
            delay={5}
          />
        )}
        {building.apartment_count !== null && (
          <CompactAttribute
            icon={<Users size={14} />}
            label="Asuntoja"
            value={building.apartment_count.toString()}
            delay={6}
          />
        )}
        {building.is_leased_plot !== null && (
          <CompactAttribute
            icon={<LandPlot size={14} />}
            label="Tontti"
            value={building.is_leased_plot ? 'Vuokratontti' : 'Oma tontti'}
            delay={7}
          />
        )}
      </div>

      {/* ── Nearby services (Lähipalvelut) ── */}
      <NearbyServices building={building} />

      {/* ── Marketplace signals ── */}
      <MarketplaceSignals buildingId={selectedBuilding!} />

      {/* ── Disclaimer ── */}
      <p className="text-xs text-muted-foreground/70 leading-snug">
        Arvio perustuu Tilastokeskuksen tilastohintoihin ja rakennuksen ominaisuuksiin. Suuntaa-antava.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Marketplace signals section
// ---------------------------------------------------------------------------

function MarketplaceSignals({ buildingId }: { buildingId: string }) {
  const { user } = useAuth()
  const {
    signals,
    hasMyInterest,
    hasMySellIntent,
    toggleInterest,
    toggleSellIntent,
  } = useMarketplaceSignals(buildingId)
  const [toggling, setToggling] = useState<'interest' | 'sell' | null>(null)

  async function handleToggleInterest() {
    setToggling('interest')
    await toggleInterest()
    setToggling(null)
  }

  async function handleToggleSellIntent() {
    setToggling('sell')
    await toggleSellIntent()
    setToggling(null)
  }

  const interestCount = signals?.interest_count ?? 0
  const hasSeller = signals?.has_sell_intent ?? false

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground"><HandCoins size={14} /></span>
        <h3 className="text-xs font-display font-bold text-foreground uppercase tracking-wider">Markkinapaikka</h3>
      </div>

      {/* Signal counts */}
      {(interestCount > 0 || hasSeller) && (
        <div className="flex flex-wrap gap-2">
          {interestCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs text-blue-700">
              <Eye size={12} />
              {interestCount} kiinnostunut{interestCount !== 1 ? 'ta' : ''}
            </span>
          )}
          {hasSeller && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-xs text-green-700">
              <HandCoins size={12} />
              Myynti-ilmoitus
            </span>
          )}
        </div>
      )}

      {/* Action buttons */}
      {user ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleToggleInterest}
            disabled={toggling !== null}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5',
              'px-3 py-2 rounded-lg text-xs font-medium',
              'border-2 transition-all duration-150',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              hasMyInterest
                ? 'bg-blue-100 border-blue-300 text-blue-800 hover:bg-blue-50'
                : 'bg-white border-[#1a1a1a]/15 text-foreground hover:border-blue-300 hover:bg-blue-50/50',
            )}
          >
            <Eye size={14} />
            {hasMyInterest ? 'Kiinnostus merkitty' : 'Olen kiinnostunut'}
          </button>
          <button
            type="button"
            onClick={handleToggleSellIntent}
            disabled={toggling !== null}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5',
              'px-3 py-2 rounded-lg text-xs font-medium',
              'border-2 transition-all duration-150',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              hasMySellIntent
                ? 'bg-green-100 border-green-300 text-green-800 hover:bg-green-50'
                : 'bg-white border-[#1a1a1a]/15 text-foreground hover:border-green-300 hover:bg-green-50/50',
            )}
          >
            <HandCoins size={14} />
            {hasMySellIntent ? 'Ilmoitus aktiivinen' : 'Myyn tätä'}
          </button>
        </div>
      ) : (
        <a
          href="/login"
          className={cn(
            'flex items-center justify-center gap-1.5',
            'w-full px-3 py-2 rounded-lg text-xs font-medium',
            'bg-white border-2 border-[#1a1a1a]/15 text-muted-foreground',
            'hover:border-[#1a1a1a]/30 hover:text-foreground transition-colors',
          )}
        >
          Kirjaudu ilmoittaaksesi kiinnostuksesi
        </a>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Nearby services section
// ---------------------------------------------------------------------------

function formatDistance(meters: number | null): string | null {
  if (meters == null) return null
  if (meters < 50) return '< 50 m'
  if (meters <= 950) return `${Math.round(meters / 50) * 50} m`
  if (meters < 10000) return `${(Math.round(meters / 100) / 10).toFixed(1)} km`
  return `${Math.round(meters / 1000)} km`
}

function NearbyServices({ building }: { building: BuildingWithPrice }) {
  const services = [
    { icon: <GraduationCap size={14} />, label: 'Koulu', distance: building.min_distance_to_school_m },
    { icon: <Baby size={14} />, label: 'Päiväkoti', distance: building.min_distance_to_kindergarten_m },
    { icon: <ShoppingCart size={14} />, label: 'Kauppa', distance: building.min_distance_to_grocery_m },
    { icon: <Bus size={14} />, label: 'Pysäkki', distance: building.min_distance_to_transit_m },
    { icon: <TreePine size={14} />, label: 'Puisto', distance: building.min_distance_to_park_m },
    { icon: <Heart size={14} />, label: 'Terveys', distance: building.min_distance_to_health_m },
    { icon: <Droplets size={14} />, label: 'Ranta', distance: building.min_distance_to_water_m },
  ].filter(s => s.distance != null)

  if (services.length === 0) return null

  return (
    <>
      <div className="flex items-center gap-2 pt-1">
        <span className="text-muted-foreground"><Info size={14} /></span>
        <h3 className="text-xs font-display font-bold text-foreground uppercase tracking-wider">Lähipalvelut</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {services.map((s) => (
          <CompactAttribute
            key={s.label}
            icon={s.icon}
            label={s.label}
            value={formatDistance(s.distance)!}
            delay={0}
          />
        ))}
      </div>
    </>
  )
}

/** Finnish explanations for price estimation factors */
const FACTOR_TOOLTIPS: Record<string, string> = {
  'Alueen perushinta': 'Tilastokeskuksen keskihinta alueella valitulle talotyypille ja vuodelle.',
  'Ikäkerroin': 'Rakennuksen iän vaikutus hintaan. Uudet ja historialliset rakennukset ovat arvokkaampia, 1960–80-luvun elementtirakennukset halvimpia.',
  'Energiakerroin': 'Rakennuksen energialuokan vaikutus hintaan. Hyvä energialuokka nostaa arvoa.',
  'Kerroskerroin': 'Kerrosmäärän vaikutus. Korkeat kerrostalot ja yksikerroksiset rivitalot saavat pienen lisän.',
  'Kokokerroin': 'Rakennuksen pohja-alan vaikutus hintaan.',
  'Vesikerroin': 'Vesistön läheisyyden vaikutus. Alle 200 m järvestä tai merestä nostaa hintaa.',
  'Naapurustokerroin': 'Alueen hintatason poikkeama perushinnasta, laskettu toteutuneiden kauppahintojen perusteella.',
  'Tonttikerroin': 'Vuokratontti (kaupungin omistama maa) alentaa asunnon hintaa, koska ostaja maksaa tonttivuokraa.',
}

function FactorRow({
  label,
  value,
  neutral = false,
  positive = false,
}: {
  label: string
  value: string
  neutral?: boolean
  positive?: boolean
}) {
  const tooltip = FACTOR_TOOLTIPS[label]

  return (
    <div className="flex items-center justify-between group">
      <span className="text-muted-foreground flex items-center gap-1">
        {label}
        {tooltip && (
          <span className="relative">
            <Info size={12} className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors cursor-help" />
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 text-xs leading-snug text-foreground bg-bg-primary border-2 border-[#1a1a1a] rounded-lg shadow-hard-sm w-52 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
              {tooltip}
            </span>
          </span>
        )}
      </span>
      <span
        className={cn(
          'tabular-nums font-medium',
          neutral && 'text-muted-foreground',
          positive && 'text-mint',
          !neutral && !positive && 'text-pink-deep'
        )}
      >
        {value}
      </span>
    </div>
  )
}

function BuildingPanelSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-4">
      {/* Header — matches: text-base title + text-xs subtitle */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-[22px] w-44" />
          <Skeleton className="h-[14px] w-32" />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex-shrink-0 h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Sulje"
        >
          <X size={16} />
        </button>
      </div>

      {/* Price card — matches: rounded-xl border-2 with px-4 pt-3 pb-2.5 + toggle row */}
      <div className="rounded-xl bg-pink-pale/40 border-2 border-[#1a1a1a]/10 overflow-hidden">
        <div className="px-4 pt-3 pb-2.5 space-y-2">
          <Skeleton className="h-[14px] w-20" />
          <Skeleton className="h-[30px] w-36" />
        </div>
        <div className="px-4 py-2.5 border-t border-[#1a1a1a]/10">
          <Skeleton className="h-[14px] w-24" />
        </div>
      </div>

      {/* Attribute grid — matches: 6 CompactAttributes with px-2.5 py-2 */}
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-[#1a1a1a]/10 bg-[#FFFBF5] px-2.5 py-2 flex items-center gap-2"
          >
            <Skeleton className="h-[14px] w-[14px] rounded-sm flex-shrink-0" />
            <div className="space-y-1 flex-1">
              <Skeleton className="h-[11px] w-12" />
              <Skeleton className="h-[16px] w-16" />
            </div>
          </div>
        ))}
      </div>

      {/* Disclaimer */}
      <Skeleton className="h-[14px] w-4/5" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBuildingPrice(price: number | null): string {
  if (price === null) return '–'
  return formatNumber(Math.round(price))
}

function formatFactor(factor: number): string {
  if (factor === 1) return '×1.00'
  const sign = factor > 1 ? '+' : ''
  const pct = ((factor - 1) * 100).toFixed(0)
  return `×${factor.toFixed(2)} (${sign}${pct}%)`
}

/**
 * Map Ryhti main_purpose codes to Finnish labels.
 * Codes follow the Finnish national building classification.
 */
const RYHTI_PURPOSE_EXACT: Record<string, string> = {
  '0110': 'Omakotitalo',
  '0111': 'Paritalo',
  '0112': 'Rivitalo',
  '0120': 'Rivitalo',
  '0130': 'Asuinkerrostalo',
  '0140': 'Asuinkerrostalo',
  '0141': 'Senioritalo',
  '0150': 'Erityisasunto',
  '0160': 'Erityisasunto',
  '0210': 'Vapaa-ajan asunto',
  '0220': 'Sauna',
  '0310': 'Toimistorakennus',
  '0320': 'Liikerakennus',
  '0330': 'Kauppakeskus',
  '0340': 'Majoitusrakennus',
  '0350': 'Ravintola',
  '0360': 'Liikennerakennus',
  '0410': 'Hoitolaitos',
  '0420': 'Sairaala',
  '0430': 'Sosiaalipalvelurakennus',
  '0440': 'Vanhainkoti',
  '0510': 'Oppilaitos',
  '0520': 'Tutkimusrakennus',
  '0610': 'Teollisuusrakennus',
  '0620': 'Varastorakennus',
  '0710': 'Pelastusrakennus',
  '0720': 'Maatalousrakennus',
  '0730': 'Muu rakennus',
  '0810': 'Kirkko',
  '0820': 'Seurakuntarakennus',
  '0910': 'Urheilurakennus',
  '0920': 'Kokoontumisrakennus',
}

const RYHTI_PURPOSE_PREFIX: Record<string, string> = {
  '01': 'Asuinrakennus',
  '02': 'Vapaa-ajan rakennus',
  '03': 'Liikerakennus',
  '04': 'Hoitorakennus',
  '05': 'Opetusrakennus',
  '06': 'Tuotantorakennus',
  '07': 'Muu rakennus',
  '08': 'Uskonnollinen rakennus',
  '09': 'Urheilu-/kokoontumisrak.',
}

function getRyhtiPurposeLabel(code: string): string {
  return RYHTI_PURPOSE_EXACT[code]
    ?? RYHTI_PURPOSE_PREFIX[code.slice(0, 2)]
    ?? `Rakennus (${code})`
}
