'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
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
import { getMapLibreColorExpression, getColorForPrice, PRICE_BREAKS, BUILDING_PRICE_COLORS, BUILDING_OUTLINE_COLORS, getDynamicScale, getDynamicColorExpression } from '@/app/lib/colorScales'
import { formatPricePerSqm, getBuildingTypeLabel } from '@/app/lib/formatters'
import { useMunicipalityData } from '@/app/hooks/useMunicipalityData'
import MapLegend from './MapLegend'
import MapTooltip from './MapTooltip'

/** CartoCDN Positron basemap — light, warm overrides (free, no token required) */
const MAP_STYLE =
  'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

/** Minimum zoom level at which individual buildings appear */
const BUILDING_ZOOM_THRESHOLD = 14

/** Properties attached to municipality features */
interface HoveredMunicipalityProperties {
  nimi: string
  price_per_sqm_avg: number | null
}

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

/** Tooltip content */
type TooltipContent =
  | { type: 'building'; props: HoveredBuildingProperties }
  | { type: 'municipality'; props: HoveredMunicipalityProperties }

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
    setFlyTo,
  } = useMapContext()

  // Fetch Voronoi GeoJSON based on current filters
  const { geojson, isLoading: dataLoading } = useMapData(
    filters.year,
    filters.propertyType
  )

  // Fetch municipality polygons for zoomed-out overview
  const { geojson: municipalityGeojson, priceRange: municipalityPriceRange } = useMunicipalityData(
    filters.year,
    filters.propertyType
  )

  // Sync loading state with context
  useEffect(() => {
    setIsLoading(dataLoading)
  }, [dataLoading, setIsLoading])

  // Map instance ref for hover highlight management
  const mapRef = useRef<MaplibreMap | null>(null)

  // Hovered building UUID — drives the highlight filter on building layers
  const [hoveredBuildingUuid, setHoveredBuildingUuid] = useState<string | null>(null)

  // Local hover state (buildings only — Voronoi is non-interactive)
  const [tooltipContent, setTooltipContent] = useState<TooltipContent | null>(
    null
  )
  const [tooltipPosition, setTooltipPosition] =
    useState<TooltipPosition | null>(null)
  const [cursor, setCursor] = useState<string>('')

  // Whether buildings are visible at current zoom
  const showBuildings = viewport.zoom >= BUILDING_ZOOM_THRESHOLD

  // Show zoom hint when user is approaching building level (z12–14)
  const showZoomHint = viewport.zoom >= 12 && viewport.zoom < BUILDING_ZOOM_THRESHOLD

  // Track building tile loading via MapLibre sourcedata events
  const [buildingsLoading, setBuildingsLoading] = useState(false)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const onSourceData = (e: { sourceId: string; isSourceLoaded: boolean }) => {
      if (e.sourceId === 'building-tiles') {
        setBuildingsLoading(!e.isSourceLoaded)
      }
    }

    map.on('sourcedata', onSourceData)
    return () => { map.off('sourcedata', onSourceData) }
  }, [mapReady])

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

  const showMunicipalities = viewport.zoom < 9.5

  const interactiveLayerIds = useMemo(() => {
    if (showBuildings) {
      return ['building-price-fill']
    }
    if (showMunicipalities) {
      return ['municipality-fill']
    }
    return []
  }, [showBuildings, showMunicipalities])

  // -------------------------------------------------------
  // Map layer paint expressions (memoised to avoid re-creation)
  // -------------------------------------------------------

  const colorExpression = useMemo(
    () => getMapLibreColorExpression() as ExpressionSpecification,
    []
  )

  // Dynamic color scale for municipality layer based on actual price range
  const municipalityScale = useMemo(() => {
    if (!municipalityPriceRange) return null
    return getDynamicScale(municipalityPriceRange.min, municipalityPriceRange.max)
  }, [municipalityPriceRange])

  const municipalityColorExpression = useMemo(
    (): ExpressionSpecification => {
      if (!municipalityScale) return colorExpression
      return getDynamicColorExpression(municipalityScale.breaks, municipalityScale.colors) as ExpressionSpecification
    },
    [municipalityScale, colorExpression]
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
      // Fade Voronoi in as municipality fades out: invisible at z8, full at z10
      return [
        'interpolate', ['linear'], ['zoom'],
        8, 0,
        9, 0.35,
        10, 0.7,
      ] as unknown as ExpressionSpecification
    },
    [isCompareMode, selectedAreaCode, comparedAreaCode]
  )

  /** Building fill color — lighter mint→pink fills that pop via strong outlines.
   *  Colors from BUILDING_PRICE_COLORS, breaks from PRICE_BREAKS (colorScales.ts). */
  const buildingColorExpression = useMemo(
    (): ExpressionSpecification => {
      const interpolate: unknown[] = [
        'interpolate', ['linear'], ['coalesce', ['get', 'price'], 0],
        0, '#d8d4d0',   // no price — warm neutral
      ]
      for (let i = 0; i < PRICE_BREAKS.length; i++) {
        interpolate.push(PRICE_BREAKS[i], BUILDING_PRICE_COLORS[i])
      }
      interpolate.push(10000, BUILDING_PRICE_COLORS[BUILDING_PRICE_COLORS.length - 1])

      return [
        'case',
        ['==', ['get', 'is_residential'], false],
        '#c8c4c0',   // non-residential — quiet warm gray
        interpolate,
      ] as unknown as ExpressionSpecification
    },
    []
  )

  /** Building outline color — darker version of fill, same hue per price band. */
  const buildingOutlineColorExpression = useMemo(
    (): ExpressionSpecification => {
      const interpolate: unknown[] = [
        'interpolate', ['linear'], ['coalesce', ['get', 'price'], 0],
        0, '#b0aca8',   // no price — darker neutral
      ]
      for (let i = 0; i < PRICE_BREAKS.length; i++) {
        interpolate.push(PRICE_BREAKS[i], BUILDING_OUTLINE_COLORS[i])
      }
      interpolate.push(10000, BUILDING_OUTLINE_COLORS[BUILDING_OUTLINE_COLORS.length - 1])

      return [
        'case',
        ['==', ['get', 'is_residential'], false],
        '#a8a4a0',   // non-residential — darker gray
        interpolate,
      ] as unknown as ExpressionSpecification
    },
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
        setHoveredBuildingUuid(props.id ?? (String(feature.id ?? '') || null))
        setTooltipContent({ type: 'building', props })
        setTooltipPosition({ x: evt.point.x, y: evt.point.y })
        setCursor(props.is_residential === false ? 'default' : 'pointer')
      } else if (feature && feature.properties && feature.layer?.id === 'municipality-fill') {
        setHoveredBuildingUuid(null)
        const props = feature.properties as HoveredMunicipalityProperties
        setTooltipContent({ type: 'municipality', props })
        setTooltipPosition({ x: evt.point.x, y: evt.point.y })
        setCursor('default')
      } else {
        setHoveredBuildingUuid(null)
        setTooltipContent(null)
        setTooltipPosition(null)
        setCursor('')
      }
    },
    []
  )

  const handleMouseLeave = useCallback(() => {
    setHoveredBuildingUuid(null)
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

      // MVT features may store 'id' as protobuf feature ID instead of property
      const buildingId = props.id ?? String(feature.id ?? '')
      if (!buildingId) return

      setSelectedBuilding(buildingId)
      setIsSidebarOpen(true)

      // Clear tooltip immediately so it doesn't linger over the building card
      setTooltipContent(null)
      setTooltipPosition(null)
      setHoveredBuildingUuid(null)
    },
    [setSelectedBuilding, setIsSidebarOpen]
  )

  // -------------------------------------------------------
  // Basemap color overrides — "Blue-gray & Teal" palette
  // -------------------------------------------------------

  /**
   * Override Positron basemap colors for quiet, recessive Neliöt aesthetic.
   *
   * Cool paper background (#f5f4f2), slate-blue water (#9bbcd4),
   * neutral roads (#d0ccc8), light buildings (#e4e0dc),
   * and soft labels (#78746e). Basemap recedes so Voronoi terrain reads clearly.
   *
   * NOTE: reuseMaps caches the map instance — onLoad only fires once.
   * After changing this code, open a NEW browser tab to see changes.
   */
  const handleMapLoad = useCallback(
    (evt: { target: MaplibreMap }) => {
      const map = evt.target
      mapRef.current = map
      setMapReady(true)

      // Register flyTo for smooth animated camera transitions
      setFlyTo(({ longitude, latitude, zoom: z }) => {
        map.flyTo({
          center: [longitude, latitude],
          zoom: z,
          duration: 1800,
          essential: true,
        })
      })

      // ── Generate building texture pattern (synchronous) ──
      // Subtle diagonal dots — gives buildings a tactile paper grain
      if (!map.hasImage('building-texture')) {
        const size = 6
        const data = new Uint8ClampedArray(size * size * 4) // RGBA
        // Place two dots at (0,0) and (3,3) with ~6% opacity black
        for (const [px, py] of [[0, 0], [3, 3]]) {
          const i = (py * size + px) * 4
          data[i] = 0       // R
          data[i + 1] = 0   // G
          data[i + 2] = 0   // B
          data[i + 3] = 15  // A (~6%)
        }
        map.addImage('building-texture', { width: size, height: size, data }, { pixelRatio: 2 })
      }

      /** Helper: safely set a paint property (layer may not exist in this style) */
      const paint = (layer: string, prop: string, value: string | number | boolean) => {
        if (map.getLayer(layer)) {
          map.setPaintProperty(layer, prop, value)
        }
      }

      // =======================================================
      // BACKGROUND — cool paper (recedes behind warm Voronoi)
      // =======================================================

      paint('background', 'background-color', '#f5f4f2')

      // =======================================================
      // LANDCOVER & LANDUSE — cool neutrals (no warm tones)
      // =======================================================

      for (const id of ['landcover-grass', 'landcover-wood', 'landcover_grass', 'landcover_wood']) {
        paint(id, 'fill-color', '#e8ebe6')
      }
      for (const id of ['landuse-cemetery', 'landuse-commercial', 'landuse-industrial', 'landuse-residential',
        'landuse_cemetery', 'landuse_commercial', 'landuse_industrial', 'landuse_residential']) {
        paint(id, 'fill-color', '#eeedeb')
      }
      for (const id of ['park', 'park_outline']) {
        paint(id, 'fill-color', '#e0e8de')
      }

      // =======================================================
      // ROADS — cool grey (distinct from warm price tones)
      // =======================================================

      const roadColor = '#b8b6b4'

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

      // Hide all road casings (outlines) for clean look
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
      // RAILWAYS — cool grey, visible from zoom 8+
      // =======================================================

      for (const id of ['rail', 'rail_dash', 'tunnel_rail', 'tunnel_rail_dash']) {
        if (map.getLayer(id)) {
          map.setLayerZoomRange(id, 8, 24)
        }
      }

      paint('rail', 'line-color', '#c0bfbd')
      paint('rail', 'line-width', 1.5)
      paint('rail_dash', 'line-color', '#d0cfcd')
      paint('rail_dash', 'line-width', 1)
      paint('tunnel_rail', 'line-color', '#c0bfbd')
      paint('tunnel_rail', 'line-width', 1.5)
      paint('tunnel_rail_dash', 'line-color', '#d0cfcd')
      paint('tunnel_rail_dash', 'line-width', 1)

      // =======================================================
      // BASEMAP BUILDINGS — cool grey (fill only, no outline)
      // =======================================================

      paint('building', 'fill-color', 'transparent')
      paint('building', 'fill-outline-color', 'transparent')
      paint('building', 'fill-antialias', false)
      paint('building-top', 'fill-color', '#e2e1df')
      paint('building-top', 'fill-outline-color', '#e2e1df')
      paint('building-top', 'fill-antialias', false)

      // =======================================================
      // AEROWAYS — match road color
      // =======================================================

      paint('aeroway-runway', 'line-color', roadColor)
      paint('aeroway-taxiway', 'line-color', roadColor)

      // =======================================================
      // WATER — clear blue (distinct from warm price tones)
      // =======================================================

      paint('water', 'fill-color', '#9bbcd4')
      paint('waterway', 'line-color', '#88b0cc')

      // Water labels — muted blue
      for (const id of [
        'watername_ocean',
        'watername_sea',
        'watername_lake',
        'watername_lake_line',
      ]) {
        paint(id, 'text-color', '#88a0b4')
      }

      // =======================================================
      // LABELS — cool charcoal
      // =======================================================

      for (const id of [
        'place_city', 'place_town', 'place_village',
        'place_hamlet', 'place_suburb', 'place_neighbourhood',
        'place_city_r', 'place_town_r', 'place_village_r',
      ]) {
        paint(id, 'text-color', '#706c66')
      }
    },
    [setFlyTo]
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
        {/* Municipality choropleth — visible at low zoom, fades as Voronoi takes over */}
        {municipalityGeojson && (
          <Source id="municipalities" type="geojson" data={municipalityGeojson}>
            <Layer
              id="municipality-fill"
              type="fill"
              beforeId="water"
              paint={{
                'fill-color': municipalityColorExpression,
                'fill-opacity': [
                  'interpolate', ['linear'], ['zoom'],
                  5, 0.75,
                  8, 0.65,
                  9.5, 0,
                ] as unknown as ExpressionSpecification,
                'fill-antialias': false,
              }}
            />
          </Source>
        )}

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
          {/* Base building fill */}
          <Layer
            id="building-price-fill"
            type="fill"
            source-layer="buildings"
            minzoom={14}
            paint={{
              'fill-color': buildingColorExpression,
              'fill-opacity': [
                'case',
                ['==', ['get', 'is_residential'], false],
                0.35,
                0.68,
              ] as unknown as ExpressionSpecification,
            }}
          />
          {/* Subtle texture overlay — diagonal dot grain on buildings */}
          <Layer
            id="building-texture"
            type="fill"
            source-layer="buildings"
            minzoom={15}
            paint={{
              'fill-pattern': 'building-texture' as unknown as ExpressionSpecification,
              'fill-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.5, 0.5] as unknown as ExpressionSpecification,
            }}
          />
          {/* Base building outline */}
          <Layer
            id="building-outline"
            type="line"
            source-layer="buildings"
            minzoom={14}
            paint={{
              'line-color': buildingOutlineColorExpression,
              'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1.2, 16, 2.0] as unknown as ExpressionSpecification,
              'line-blur': 0.4,
              'line-opacity': [
                'case',
                ['==', ['get', 'is_residential'], false],
                0.35,
                1,
              ] as unknown as ExpressionSpecification,
            }}
          />
          {/* Hover highlight — brighter fill on hovered building */}
          <Layer
            id="building-hover-fill"
            type="fill"
            source-layer="buildings"
            minzoom={14}
            filter={hoveredBuildingUuid
              ? ['==', ['get', 'id'], hoveredBuildingUuid] as unknown as ExpressionSpecification
              : ['==', ['get', 'id'], ''] as unknown as ExpressionSpecification
            }
            paint={{
              'fill-color': buildingColorExpression,
              'fill-opacity': 0.92,
            }}
          />
          {/* Hover highlight — thicker, sharper outline on hovered building */}
          <Layer
            id="building-hover-outline"
            type="line"
            source-layer="buildings"
            minzoom={14}
            filter={hoveredBuildingUuid
              ? ['==', ['get', 'id'], hoveredBuildingUuid] as unknown as ExpressionSpecification
              : ['==', ['get', 'id'], ''] as unknown as ExpressionSpecification
            }
            paint={{
              'line-color': buildingOutlineColorExpression,
              'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2.4, 16, 3.5] as unknown as ExpressionSpecification,
              'line-blur': 0,
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

      {/* Municipality hover tooltip */}
      {tooltipContent && tooltipPosition && tooltipContent.type === 'municipality' && (
        <MapTooltip
          areaName={tooltipContent.props.nimi}
          price={tooltipContent.props.price_per_sqm_avg}
          x={tooltipPosition.x}
          y={tooltipPosition.y}
        />
      )}

      {/* Legend — switches between municipality and building scale based on zoom */}
      <MapLegend
        municipalityScale={municipalityScale}
        zoom={viewport.zoom}
      />

      {/* Zoom hint — shown when approaching building zoom level (z12–14) */}
      {showZoomHint && (
        <div className="absolute bottom-28 md:bottom-20 left-1/2 -translate-x-1/2 z-40 animate-fade-in">
          <div className="bg-[#FFFBF5] border-2 border-[#1a1a1a] rounded-full px-4 py-2 text-xs text-muted-foreground font-body shadow-hard-sm flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-pink animate-pulse" />
            Lähennä nähdäksesi rakennukset
          </div>
        </div>
      )}

      {/* Building tile loading indicator — only when Voronoi isn't also loading */}
      {showBuildings && buildingsLoading && !dataLoading && (
        <div className="absolute top-[4.5rem] left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="relative overflow-hidden bg-[#FFFBF5] border-2 border-[#1a1a1a] rounded-full px-4 py-2 text-xs text-[#1a1a1a] font-body flex items-center gap-2 shadow-hard-sm">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-pink-baby/60 to-transparent bg-[length:200%_100%] animate-shimmer rounded-full" />
            <span className="relative inline-block h-2.5 w-2.5 rounded-full border-2 border-pink border-t-transparent animate-spin" />
            <span className="relative">Ladataan rakennuksia...</span>
          </div>
        </div>
      )}

      {/* Compare mode indicator */}
      {isCompareMode && !selectedArea && comparedArea && (
        <div className="absolute top-[4.5rem] left-1/2 -translate-x-1/2 z-50">
          <div className="bg-[#FFFBF5] border-2 border-[#1a1a1a] rounded-full px-4 py-2 text-sm text-[#1a1a1a] font-body flex items-center gap-2 shadow-hard-sm animate-fade-in">
            <div className="h-3 w-3 rounded-full bg-purple-500 animate-pulse" />
            Valitse toinen alue vertailuun
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {dataLoading && (
        <div className="absolute top-[4.5rem] left-1/2 -translate-x-1/2 z-50">
          <div className="relative overflow-hidden bg-[#FFFBF5] border-2 border-[#1a1a1a] rounded-full px-4 py-2 text-sm text-[#1a1a1a] font-body flex items-center gap-2 shadow-hard-sm animate-fade-in">
            {/* Shimmer sweep across the pill */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-pink-baby/60 to-transparent bg-[length:200%_100%] animate-shimmer rounded-full" />
            <span className="relative inline-block h-3 w-3 rounded-full border-2 border-pink border-t-transparent animate-spin" />
            <span className="relative">Ladataan aluedataa...</span>
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
    const buildingLabel = props.building_type
      ? getBuildingTypeLabel(props.building_type)
      : 'Ei asuinkäytössä'

    return (
      <div
        className="absolute z-40 pointer-events-none animate-scale-in"
        style={{
          left: x + 12,
          top: y - 24,
          transform: 'translateY(-100%)',
          transformOrigin: 'bottom left',
        }}
      >
        <div className="bg-[#FFFBF5] border-2 border-[#1a1a1a] rounded-xl px-3 py-2 shadow-hard-sm">
          <div className="text-sm text-muted-foreground">
            {buildingLabel}
          </div>
        </div>
      </div>
    )
  }

  const price = props.price
  const priceColor = price !== null ? getColorForPrice(price) : null
  const priceStr =
    price !== null
      ? formatPricePerSqm(price)
      : 'Ei hinta-arviota'

  const details: string[] = []
  if (props.address) details.push(props.address)
  if (props.construction_year) details.push(`Rak. ${props.construction_year}`)
  if (props.floor_count) details.push(`${props.floor_count} krs`)

  return (
    <div
      className="absolute z-40 pointer-events-none animate-scale-in"
      style={{
        left: x + 12,
        top: y - 24,
        transform: 'translateY(-100%)',
        transformOrigin: 'bottom left',
      }}
    >
      <div className="bg-[#FFFBF5] border-2 border-[#1a1a1a] rounded-xl px-3 py-2 shadow-hard-sm min-w-[140px]">
        <div className="flex items-center gap-2">
          {priceColor && (
            <span
              className="inline-block h-3 w-5 rounded-sm flex-shrink-0"
              style={{
                backgroundColor: priceColor,
                border: '1.5px solid rgba(0,0,0,0.2)',
              }}
            />
          )}
          <span className="text-sm font-display font-bold text-[#1a1a1a] tabular-nums">
            {priceStr}
          </span>
        </div>
        {details.length > 0 && (
          <div className="text-xs text-[#999] mt-1 font-body">
            {details.join(' · ')}
          </div>
        )}
      </div>
    </div>
  )
}
