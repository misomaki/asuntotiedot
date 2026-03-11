'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import Map, { Source, Layer } from 'react-map-gl/maplibre'
import type {
  MapLayerMouseEvent,
  ViewStateChangeEvent,
} from 'react-map-gl/maplibre'
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec'
import type { Map as MaplibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { useMapContext } from '@/app/contexts/MapContext'
import { useMapData } from '@/app/hooks/useMapData'
// useBuildingData hook removed — buildings now served as vector tiles
// managed natively by MapLibre (no React-level data fetching needed)
import { getMapLibreColorExpression } from '@/app/lib/colorScales'
import MapLegend from './MapLegend'
import MapControls from './MapControls'

/** CartoCDN Dark Matter basemap (free, no token required) */
const MAP_STYLE =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

/** Minimum zoom level at which individual buildings appear */
const BUILDING_ZOOM_THRESHOLD = 14

/** Properties attached to building features */
interface HoveredBuildingProperties {
  id: string
  building_type: string | null
  construction_year: number | null
  floor_count: number | null
  address: string | null
  price: number | null
  is_residential: boolean
}

/** Cursor position for tooltip placement */
interface TooltipPosition {
  x: number
  y: number
}

/** Tooltip content (buildings only) */
type TooltipContent = { type: 'building'; props: HoveredBuildingProperties }

/**
 * Main map component for the Talotutka application.
 *
 * Renders the MapLibre GL map with:
 * - Voronoi fill layer (color-coded by area price per m²)
 * - Building fill + outline layers (visible at zoom >= 14)
 * - Hover tooltip and click-to-select interaction for both areas and buildings
 * - Navigation controls, legend, and custom controls
 * - Compare mode for area comparison
 */
export default function MapContainer() {
  const {
    viewport,
    setViewport,
    selectedArea,
    comparedArea,
    isCompareMode,
    filters,
    setIsLoading,
    setIsSidebarOpen,
    setSelectedBuilding,
  } = useMapContext()

  // Fetch Voronoi GeoJSON based on current filters
  const { geojson, isLoading: dataLoading } = useMapData(
    filters.year,
    filters.propertyType
  )

  // Sync loading state with context
  useEffect(() => {
    setIsLoading(dataLoading)
  }, [dataLoading, setIsLoading])

  // Local hover state (buildings only — Voronoi is non-interactive)
  const [tooltipContent, setTooltipContent] = useState<TooltipContent | null>(
    null
  )
  const [tooltipPosition, setTooltipPosition] =
    useState<TooltipPosition | null>(null)
  const [cursor, setCursor] = useState<string>('')

  // Whether buildings are visible at current zoom
  const showBuildings = viewport.zoom >= BUILDING_ZOOM_THRESHOLD

  // Absolute tile URL — MapLibre fetches tiles in a Web Worker where
  // relative URLs fail (worker base is a blob: URL, not the page origin).
  const buildingTileUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/api/tiles/buildings/{z}/{x}/{y}'
    return `${window.location.origin}/api/tiles/buildings/{z}/{x}/{y}`
  }, [])

  // Area codes for highlighting
  const selectedAreaCode = selectedArea?.areaCode ?? ''
  const comparedAreaCode = comparedArea?.areaCode ?? ''

  // -------------------------------------------------------
  // Interactive layer IDs (changes based on zoom level)
  // -------------------------------------------------------

  const interactiveLayerIds = useMemo(() => {
    if (showBuildings) {
      return ['building-price-fill']
    }
    return []
  }, [showBuildings])

  // -------------------------------------------------------
  // Map layer paint expressions (memoised to avoid re-creation)
  // -------------------------------------------------------

  const colorExpression = useMemo(
    () => getMapLibreColorExpression() as ExpressionSpecification,
    []
  )

  const fillColorExpression = useMemo(
    (): ExpressionSpecification =>
      isCompareMode
        ? [
            'case',
            ['==', ['get', 'area_code'], selectedAreaCode],
            '#3b82f6',
            ['==', ['get', 'area_code'], comparedAreaCode],
            '#8b5cf6',
            colorExpression,
          ]
        : colorExpression,
    [isCompareMode, selectedAreaCode, comparedAreaCode, colorExpression]
  )

  const fillOpacityExpression = useMemo(
    (): ExpressionSpecification => {
      if (isCompareMode) {
        return [
          'case',
          ['==', ['get', 'area_code'], selectedAreaCode],
          0.9,
          ['==', ['get', 'area_code'], comparedAreaCode],
          0.9,
          0.8,
        ]
      }
      return 0.8 as unknown as ExpressionSpecification
    },
    [isCompareMode, selectedAreaCode, comparedAreaCode]
  )

  /** Building fill color — brightened price scale to stand out from Voronoi terrain */
  const buildingColorExpression = useMemo(
    (): ExpressionSpecification => [
      'case',
      ['==', ['get', 'is_residential'], false],
      '#2a3040',   // non-residential — dark muted gray
      [
        'interpolate',
        ['linear'],
        ['coalesce', ['get', 'price'], 0],
        0,
        '#4b5563',   // no price — gray-600 (brighter than Voronoi gray-700)
        1000,
        '#3730a3',   // < 1000  — indigo-700
        1500,
        '#4f46e5',   // 1000-1500 — indigo-600
        2000,
        '#0f766e',   // 1500-2000 — teal-700
        2500,
        '#14b8a6',   // 2000-2500 — teal-500
        3000,
        '#5eead4',   // 2500-3000 — teal-300
        4000,
        '#bef264',   // 3000-4000 — lime-300
        5000,
        '#fde047',   // 4000-5000 — yellow-300
        7000,
        '#fbbf24',   // 5000-7000 — amber-400
        10000,
        '#d97706',   // > 7000   — amber-600
      ],
    ],
    []
  )

  // -------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------

  const handleViewStateChange = useCallback(
    (evt: ViewStateChangeEvent) => {
      setViewport({
        longitude: evt.viewState.longitude,
        latitude: evt.viewState.latitude,
        zoom: evt.viewState.zoom,
        bearing: evt.viewState.bearing,
        pitch: evt.viewState.pitch,
      })
    },
    [setViewport]
  )

  const handleMouseMove = useCallback(
    (evt: MapLayerMouseEvent) => {
      const feature = evt.features?.[0]

      if (feature && feature.properties && feature.layer?.id === 'building-price-fill') {
        const props = feature.properties as HoveredBuildingProperties
        setTooltipContent({ type: 'building', props })
        setTooltipPosition({ x: evt.point.x, y: evt.point.y })
        setCursor('pointer')
      } else {
        setTooltipContent(null)
        setTooltipPosition(null)
        setCursor('')
      }
    },
    []
  )

  const handleMouseLeave = useCallback(() => {
    setTooltipContent(null)
    setTooltipPosition(null)
    setCursor('')
  }, [])

  const handleClick = useCallback(
    (evt: MapLayerMouseEvent) => {
      const feature = evt.features?.[0]
      if (!feature || !feature.properties) return
      if (feature.layer?.id !== 'building-price-fill') return

      const props = feature.properties as HoveredBuildingProperties
      // Only open details panel for residential buildings
      if (props.is_residential === false) return

      setSelectedBuilding(props.id)
      setIsSidebarOpen(true)
    },
    [setSelectedBuilding, setIsSidebarOpen]
  )

  // -------------------------------------------------------
  // Basemap color overrides — "Blue-gray & Teal" palette
  // -------------------------------------------------------

  /**
   * Override basemap infrastructure colors on map load.
   *
   * Blue-gray roads (#4a5c6c) with width-based hierarchy,
   * pink-tinted railways (#8a5c6e), blue-gray buildings (#3a4a56),
   * and vivid teal water (#12484c). The muted blue-gray tones
   * stay neutral against the warm Voronoi price gradient while
   * teal fills the spectral gap that the price colors don't use.
   *
   * NOTE: reuseMaps caches the map instance — onLoad only fires once.
   * After changing this code, open a NEW browser tab to see changes.
   */
  const handleMapLoad = useCallback(
    (evt: { target: MaplibreMap }) => {
      const map = evt.target
      /** Helper: safely set a paint property (layer may not exist in this style) */
      const paint = (layer: string, prop: string, value: string | number | boolean) => {
        if (map.getLayer(layer)) {
          map.setPaintProperty(layer, prop, value)
        }
      }

      // =======================================================
      // ROADS — blue-gray, width-based hierarchy
      // =======================================================

      // Roads — blue-gray, single lane per type, width by importance
      const roadColor = '#4a5c6c'

      // Service / path (thinnest)
      for (const id of [
        'road_service_fill', 'road_path',
        'tunnel_service_fill', 'tunnel_path',
        'bridge_service_fill', 'bridge_path',
      ]) {
        paint(id, 'line-color', roadColor)
        paint(id, 'line-width', 0.5)
      }

      // Minor roads
      for (const id of ['road_minor_fill', 'tunnel_minor_fill', 'bridge_minor_fill']) {
        paint(id, 'line-color', roadColor)
        paint(id, 'line-width', 0.8)
      }

      // Secondary roads
      for (const id of ['road_sec_fill_noramp', 'tunnel_sec_fill', 'bridge_sec_fill']) {
        paint(id, 'line-color', roadColor)
        paint(id, 'line-width', 1.2)
      }

      // Primary roads
      for (const id of [
        'road_pri_fill_noramp', 'road_pri_fill_ramp',
        'tunnel_pri_fill', 'bridge_pri_fill',
      ]) {
        paint(id, 'line-color', roadColor)
        paint(id, 'line-width', 1.6)
      }

      // Trunk roads
      for (const id of [
        'road_trunk_fill_noramp', 'road_trunk_fill_ramp',
        'tunnel_trunk_fill', 'bridge_trunk_fill',
      ]) {
        paint(id, 'line-color', roadColor)
        paint(id, 'line-width', 2)
      }

      // Motorways (thickest)
      for (const id of [
        'road_mot_fill_noramp', 'road_mot_fill_ramp',
        'tunnel_mot_fill', 'bridge_mot_fill',
      ]) {
        paint(id, 'line-color', roadColor)
        paint(id, 'line-width', 2.5)
      }

      // Hide all road casings (outlines)
      for (const id of [
        'road_service_case', 'road_minor_case',
        'road_sec_case_noramp',
        'road_pri_case_noramp', 'road_pri_case_ramp',
        'road_trunk_case_noramp', 'road_trunk_case_ramp',
        'road_mot_case_noramp', 'road_mot_case_ramp',
        'tunnel_service_case', 'tunnel_minor_case', 'tunnel_sec_case',
        'tunnel_pri_case', 'tunnel_trunk_case', 'tunnel_mot_case',
        'bridge_service_case', 'bridge_minor_case', 'bridge_sec_case',
        'bridge_pri_case', 'bridge_trunk_case', 'bridge_mot_case',
      ]) {
        paint(id, 'line-opacity', 0)
      }

      // =======================================================
      // RAILWAYS — pink-tinted, visible from zoom 8+
      // =======================================================

      // Show railways from zoom 8+ (basemap default is ~12)
      for (const id of ['rail', 'rail_dash', 'tunnel_rail', 'tunnel_rail_dash']) {
        if (map.getLayer(id)) {
          map.setLayerZoomRange(id, 8, 24)
        }
      }

      paint('rail', 'line-color', '#8a5c6e')
      paint('rail', 'line-width', 1.5)
      paint('rail_dash', 'line-color', '#b07890')
      paint('rail_dash', 'line-width', 1)
      paint('tunnel_rail', 'line-color', '#8a5c6e')
      paint('tunnel_rail', 'line-width', 1.5)
      paint('tunnel_rail_dash', 'line-color', '#b07890')
      paint('tunnel_rail_dash', 'line-width', 1)

      // =======================================================
      // BASEMAP BUILDINGS — blue-gray (fill only, no outline)
      // =======================================================

      paint('building', 'fill-color', 'transparent')
      paint('building', 'fill-outline-color', 'transparent')
      paint('building', 'fill-antialias', false)   // disable outline rendering
      paint('building-top', 'fill-color', '#3a4a56')
      paint('building-top', 'fill-outline-color', '#3a4a56')
      paint('building-top', 'fill-antialias', false) // disable outline rendering

      // =======================================================
      // AEROWAYS — match road color
      // =======================================================

      paint('aeroway-runway', 'line-color', roadColor)
      paint('aeroway-taxiway', 'line-color', roadColor)

      // =======================================================
      // WATER — vivid teal (spectral gap in price palette)
      // =======================================================

      paint('water', 'fill-color', '#12484c')
      paint('waterway', 'line-color', '#20888e')

      // Water labels — bright teal for contrast
      for (const id of [
        'watername_ocean',
        'watername_sea',
        'watername_lake',
        'watername_lake_line',
      ]) {
        paint(id, 'text-color', '#38a8b0')
      }
    },
    []
  )

  // -------------------------------------------------------
  // Render
  // -------------------------------------------------------

  return (
    <div className="relative w-full h-full">
      <Map
        {...viewport}
        onMove={handleViewStateChange}
        mapStyle={MAP_STYLE}
        style={{ width: '100%', height: '100%' }}
        cursor={cursor}
        interactiveLayerIds={interactiveLayerIds}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onLoad={handleMapLoad}
        reuseMaps
      >
        {/* Voronoi area fill layer */}
        {geojson && (
          <Source id="areas" type="geojson" data={geojson}>
            <Layer
              id="area-fill"
              type="fill"
              beforeId="water"
              paint={{
                'fill-color': fillColorExpression,
                'fill-opacity': fillOpacityExpression,
                'fill-antialias': false,
              }}
            />
          </Source>
        )}

        {/* Building layers — vector tiles, always mounted so MapLibre manages tile lifecycle.
            minzoom on Source prevents tile fetching below z14; minzoom on Layer prevents rendering. */}
        <Source
          id="building-tiles"
          type="vector"
          tiles={[buildingTileUrl]}
          minzoom={14}
          maxzoom={16}
        >
          <Layer
            id="building-price-fill"
            type="fill"
            source-layer="buildings"
            minzoom={14}
            paint={{
              'fill-color': buildingColorExpression,
              'fill-opacity': 0.95,
            }}
          />
          <Layer
            id="building-outline"
            type="line"
            source-layer="buildings"
            minzoom={14}
            paint={{
              'line-color': 'rgba(255, 255, 255, 0.15)',
              'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.5, 16, 1.2] as unknown as ExpressionSpecification,
              'line-blur': 0.5,
            }}
          />
        </Source>
      </Map>

      {/* Building hover tooltip */}
      {tooltipContent && tooltipPosition && tooltipContent.type === 'building' && (
        <BuildingTooltip
          props={tooltipContent.props}
          x={tooltipPosition.x}
          y={tooltipPosition.y}
        />
      )}

      {/* Legend */}
      <MapLegend />

      {/* Custom controls */}
      <MapControls />

      {/* Compare mode indicator */}
      {isCompareMode && !selectedArea && comparedArea && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
          <div className="glass rounded-full px-4 py-2 text-sm text-[var(--color-text-secondary)] flex items-center gap-2 shadow-glass-sm animate-fade-in">
            <div className="h-3 w-3 rounded-full bg-purple-500 animate-pulse" />
            Valitse toinen alue vertailuun
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {dataLoading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
          <div className="glass rounded-full px-4 py-2 text-sm text-[var(--color-text-secondary)] flex items-center gap-2 shadow-glass-sm animate-fade-in">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
            Ladataan aluedataa...
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Building tooltip sub-component
// ---------------------------------------------------------------------------

function BuildingTooltip({
  props,
  x,
  y,
}: {
  props: HoveredBuildingProperties
  x: number
  y: number
}) {
  const isResidential = props.is_residential !== false

  if (!isResidential) {
    return (
      <div
        className="absolute z-40 pointer-events-none"
        style={{
          left: x + 12,
          top: y - 24,
          transform: 'translateY(-100%)',
        }}
      >
        <div className="glass rounded-lg px-3 py-2 shadow-glass-sm">
          <div className="text-sm text-muted-foreground">
            Ei asuinkäytössä
          </div>
        </div>
      </div>
    )
  }

  const price = props.price
  const priceStr =
    price !== null
      ? `${new Intl.NumberFormat('fi-FI').format(Math.round(price))} €/m²`
      : 'Ei hinta-arviota'

  const details: string[] = []
  if (props.address) details.push(props.address)
  if (props.construction_year) details.push(`Rak. ${props.construction_year}`)
  if (props.floor_count) details.push(`${props.floor_count} krs`)

  return (
    <div
      className="absolute z-40 pointer-events-none"
      style={{
        left: x + 12,
        top: y - 24,
        transform: 'translateY(-100%)',
      }}
    >
      <div className="glass rounded-lg px-3 py-2 shadow-glass-sm">
        <div className="text-sm font-semibold text-foreground tabular-nums">
          {priceStr}
        </div>
        {details.length > 0 && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {details.join(' · ')}
          </div>
        )}
      </div>
    </div>
  )
}
