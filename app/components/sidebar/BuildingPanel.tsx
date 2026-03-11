'use client'

import { useState, useEffect, useRef } from 'react'
import { useMapContext } from '@/app/contexts/MapContext'
import { cn } from '@/app/lib/utils'
import { Skeleton } from '@/app/components/ui/skeleton'
import { Badge } from '@/app/components/ui/badge'
import {
  Building2,
  Calendar,
  Layers,
  Droplets,
  MapPin,
  ArrowLeft,
} from 'lucide-react'
import type { BuildingWithPrice } from '@/app/types'

/**
 * BuildingPanel – Sidebar content for a selected building.
 *
 * Shows the building's estimated price per m² with a breakdown
 * of factors (age, water proximity, floor count).
 */
export function BuildingPanel() {
  const {
    selectedBuilding,
    setSelectedBuilding,
  } = useMapContext()

  const [building, setBuilding] = useState<BuildingWithPrice | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [fetchFailed, setFetchFailed] = useState(false)
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

  function handleBack() {
    setSelectedBuilding(null)
  }

  if (isLoading) return <BuildingPanelSkeleton onBack={handleBack} />

  if (!building) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2">
        <p className="text-sm text-muted-foreground">
          {fetchFailed ? 'Rakennustietoja ei löytynyt.' : 'Ladataan tietoja…'}
        </p>
        {fetchFailed && (
          <button
            type="button"
            onClick={handleBack}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Takaisin
          </button>
        )}
      </div>
    )
  }

  const price = building.estimated_price_per_sqm
  const hasPrice = price !== null && price > 0

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Back button */}
      <button
        type="button"
        onClick={handleBack}
        className={cn(
          'flex items-center gap-1.5 text-sm',
          'text-muted-foreground hover:text-foreground transition-colors'
        )}
      >
        <ArrowLeft size={14} />
        Takaisin aluenäkymään
      </button>

      {/* Header */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Building2 size={18} className="text-[var(--color-accent)]" />
          <h2 className="text-lg font-semibold text-foreground">
            Rakennus
          </h2>
        </div>
        {building.address && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin size={13} />
            {building.address}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {(building.ryhti_main_purpose || building.building_type) && (
            <Badge variant="secondary" className="text-xs capitalize">
              {building.ryhti_main_purpose
                ? getRyhtiPurposeLabel(building.ryhti_main_purpose)
                : getBuildingTypeLabel(building.building_type!)}
            </Badge>
          )}
          {building.is_residential === false && (
            <Badge variant="outline" className="text-xs text-amber-400 border-amber-400/40">
              Ei asuinkäytössä
            </Badge>
          )}
          {building.area_name && (
            <Badge variant="outline" className="text-xs">
              {building.area_code} {building.area_name}
            </Badge>
          )}
        </div>
      </div>

      {/* Price estimate */}
      {hasPrice && (
        <div className="rounded-xl bg-muted/30 border border-border p-4 space-y-3">
          <div className="text-sm text-muted-foreground">Hinta-arvio</div>
          <div className="text-3xl font-bold text-foreground tabular-nums">
            {formatPrice(price)} €/m²
          </div>
        </div>
      )}

      {/* Building attributes */}
      <div className="grid grid-cols-2 gap-3">
        <AttributeCard
          icon={<Calendar size={15} />}
          label="Rakennusvuosi"
          value={building.construction_year?.toString() ?? 'Ei tiedossa'}
        />
        <AttributeCard
          icon={<Layers size={15} />}
          label="Kerroksia"
          value={building.floor_count?.toString() ?? 'Ei tiedossa'}
        />
        <AttributeCard
          icon={<Droplets size={15} />}
          label="Etäisyys veteen"
          value={
            building.min_distance_to_water_m !== null
              ? `${Math.round(building.min_distance_to_water_m)} m`
              : 'Ei tiedossa'
          }
        />
        <AttributeCard
          icon={<Building2 size={15} />}
          label="Pohjan ala"
          value={
            building.footprint_area_sqm !== null
              ? `${Math.round(building.footprint_area_sqm)} m²`
              : 'Ei tiedossa'
          }
        />
      </div>

      {/* Price estimation breakdown */}
      {hasPrice && building.base_price !== null && (
        <div className="rounded-xl bg-muted/30 border border-border p-4 space-y-3">
          <div className="text-sm font-medium text-foreground">
            Hinta-arvion erittely
          </div>

          <div className="space-y-2 text-sm">
            <FactorRow
              label="Alueen perushinta"
              value={`${formatPrice(building.base_price)} €/m²`}
            />
            <FactorRow
              label="Ikäkerroin"
              value={formatFactor(building.age_factor)}
              neutral={building.age_factor === 1}
              positive={building.age_factor > 1}
            />
            <FactorRow
              label="Vesikerroin"
              value={formatFactor(building.water_factor)}
              neutral={building.water_factor === 1}
              positive={building.water_factor > 1}
            />
            <FactorRow
              label="Kerroskerroin"
              value={formatFactor(building.floor_factor)}
              neutral={building.floor_factor === 1}
              positive={building.floor_factor > 1}
            />

            <div className="border-t border-border pt-2 mt-2 flex items-center justify-between font-medium">
              <span className="text-foreground">Lopullinen arvio</span>
              <span className="text-foreground tabular-nums">
                {formatPrice(price)} €/m²
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Hinta-arvio perustuu alueen tilastohintoihin (Tilastokeskus) sekä
        rakennuksen ominaisuuksiin. Arvio on suuntaa-antava eikä vastaa
        virallista arviota.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AttributeCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg bg-muted/20 border border-border p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <div className="text-sm font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
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
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'tabular-nums font-medium',
          neutral && 'text-muted-foreground',
          positive && 'text-emerald-400',
          !neutral && !positive && 'text-amber-400'
        )}
      >
        {value}
      </span>
    </div>
  )
}

function BuildingPanelSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-5 animate-fade-in">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} />
        Takaisin
      </button>
      <div className="space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-24 rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
      <Skeleton className="h-40 rounded-xl" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(price: number | null): string {
  if (price === null) return '–'
  return new Intl.NumberFormat('fi-FI').format(Math.round(price))
}

function formatFactor(factor: number): string {
  if (factor === 1) return '×1.00'
  const sign = factor > 1 ? '+' : ''
  const pct = ((factor - 1) * 100).toFixed(0)
  return `×${factor.toFixed(2)} (${sign}${pct}%)`
}

function getBuildingTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    apartments: 'Kerrostalo',
    residential: 'Asuinrakennus',
    house: 'Omakotitalo',
    detached: 'Omakotitalo',
    semidetached_house: 'Paritalo',
    terrace: 'Rivitalo',
    commercial: 'Liikerakennus',
    industrial: 'Teollisuusrakennus',
    retail: 'Liikerakennus',
    office: 'Toimistorakennus',
    garage: 'Autotalli',
    shed: 'Varasto',
    yes: 'Rakennus',
  }
  return labels[type] ?? type
}

/**
 * Map Ryhti main_purpose codes to Finnish labels.
 * Codes follow the Finnish national building classification.
 * See: https://koodistot.suomi.fi/codelist;registryCode=rak;schemeCode=kayttotarkoitus
 */
function getRyhtiPurposeLabel(code: string): string {
  // Exact match first, then prefix match
  const exact: Record<string, string> = {
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

  if (exact[code]) return exact[code]

  // Prefix-based fallback (2-digit)
  const prefix = code.slice(0, 2)
  const prefixLabels: Record<string, string> = {
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

  return prefixLabels[prefix] ?? `Rakennus (${code})`
}
