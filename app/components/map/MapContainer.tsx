'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import Map, {
  Source,
  Layer,
  NavigationControl,
} from 'react-map-gl/maplibre'
import type {
  MapLayerMouseEvent,
  ViewStateChangeEvent,
} from 'react-map-gl/maplibre'
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec'
import 'maplibre-gl/dist/maplibre-gl.css'

import { useMapContext } from '@/app/contexts/MapContext'
import { useMapData } from '@/app/hooks/useMapData'
import { useBuildingData } from '@/app/hooks/useBuildingData'
import { getMapLibreColorExpression } from '@/app/lib/colorScales'
import MapTooltip from './MapTooltip'
import MapLegend from './MapLegend'
import MapControls from './MapControls'

/** CartoCDN Dark Matter basemap (free, no token required) */
const MAP_STYLE =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

/** Minimum zoom level at which individual buildings appear */
const BUILDING_ZOOM_THRESHOLD = 14

/** Properties attached to each Voronoi GeoJSON feature */
interface HoveredFeatureProperties {
  area_code: string
  name: string
  municipality: string
  price_per_sqm_avg: number | null
  id: string
}

/** Properties attached to building features */
interface HoveredBuildingProperties {
  id: string
  building_type: string | null
  construction_year: number | null
  floor_count: number | null
  address: string | null
  estimated_price_per_sqm: number | null
}

/** Cursor position for tooltip placement */
interface TooltipPosition {
  x: number
  y: number
}

/** Tooltip content union */
type TooltipContent =
  | { type: 'area'; props: HoveredFeatureProperties }
  | { type: 'building'; props: HoveredBuildingProperties }

/**
 * Main map component for the Asuntokartta application.
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
    setSelectedArea,
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

  // Fetch building outlines (only when zoomed in enough)
  const { buildings } = useBuildingData()

  // Sync loading state with context
  useEffect(() => {
    setIsLoading(dataLoading)
  }, [dataLoading, setIsLoading])

  // Local hover state
  const [hoveredAreaCode, setHoveredAreaCode] = useState<string | null>(null)
  const [tooltipContent, setTooltipContent] = useState<TooltipContent | null>(
    null
  )
  const [tooltipPosition, setTooltipPosition] =
    useState<TooltipPosition | null>(null)
  const [cursor, setCursor] = useState<string>('')

  // Whether buildings are visible at current zoom
  const showBuildings = viewport.zoom >= BUILDING_ZOOM_THRESHOLD

  // Area codes for highlighting
  const selectedAreaCode = selectedArea?.areaCode ?? ''
  const comparedAreaCode = comparedArea?.areaCode ?? ''

  // -------------------------------------------------------
  // Interactive layer IDs (changes based on zoom level)
  // -------------------------------------------------------

  const interactiveLayerIds = useMemo(() => {
    const ids = ['area-fill']
    if (showBuildings && buildings) {
      ids.push('building-fill')
    }
    return ids
  }, [showBuildings, buildings])

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
          ['==', ['get', 'area_code'], hoveredAreaCode ?? ''],
          0.85,
          0.8,
        ]
      }
      return [
        'case',
        ['==', ['get', 'area_code'], hoveredAreaCode ?? ''],
        0.9,
        0.8,
      ]
    },
    [hoveredAreaCode, isCompareMode, selectedAreaCode, comparedAreaCode]
  )

  /** Building fill color — same color scale as Voronoi, keyed on estimated_price_per_sqm */
  const buildingColorExpression = useMemo(
    (): ExpressionSpecification => [
      'interpolate',
      ['linear'],
      ['coalesce', ['get', 'estimated_price_per_sqm'], 0],
      0,
      '#374151',
      1000,
      '#1a237e',
      1500,
      '#1565c0',
      2000,
      '#42a5f5',
      2500,
      '#66bb6a',
      3000,
      '#ffee58',
      4000,
      '#ffa726',
      5000,
      '#ef5350',
      7000,
      '#b71c1c',
      10000,
      '#4a0072',
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

      if (feature && feature.properties) {
        const layerId = feature.layer?.id

        if (layerId === 'building-fill') {
          const props = feature.properties as HoveredBuildingProperties
          setTooltipContent({ type: 'building', props })
          setHoveredAreaCode(null)
        } else {
          const props = feature.properties as HoveredFeatureProperties
          setTooltipContent({ type: 'area', props })
          setHoveredAreaCode(props.area_code)
        }
        setTooltipPosition({ x: evt.point.x, y: evt.point.y })
        setCursor('pointer')
      } else {
        setHoveredAreaCode(null)
        setTooltipContent(null)
        setTooltipPosition(null)
        setCursor('')
      }
    },
    []
  )

  const handleMouseLeave = useCallback(() => {
    setHoveredAreaCode(null)
    setTooltipContent(null)
    setTooltipPosition(null)
    setCursor('')
  }, [])

  const handleClick = useCallback(
    (evt: MapLayerMouseEvent) => {
      const feature = evt.features?.[0]
      if (!feature || !feature.properties) return

      const layerId = feature.layer?.id

      if (layerId === 'building-fill') {
        // Click on a building -> show building details panel
        const props = feature.properties as HoveredBuildingProperties
        setSelectedBuilding(props.id)
        setIsSidebarOpen(true)
        return
      }

      // Click on Voronoi area
      const props = feature.properties as HoveredFeatureProperties
      setSelectedBuilding(null)
      setSelectedArea({
        id: props.id,
        areaCode: props.area_code,
        name: props.name,
      })
      setIsSidebarOpen(true)
    },
    [setSelectedArea, setSelectedBuilding, setIsSidebarOpen]
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
        reuseMaps
      >
        {/* Navigation controls (zoom +/-, compass) */}
        <NavigationControl position="top-left" showCompass visualizePitch />

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
              }}
            />
          </Source>
        )}

        {/* Building layers — visible at zoom >= 14 */}
        {buildings && showBuildings && (
          <Source id="buildings" type="geojson" data={buildings}>
            <Layer
              id="building-fill"
              type="fill"
              paint={{
                'fill-color': buildingColorExpression,
                'fill-opacity': 0.85,
              }}
            />
            <Layer
              id="building-outline"
              type="line"
              paint={{
                'line-color': 'rgba(255, 255, 255, 0.3)',
                'line-width': 0.5,
              }}
            />
          </Source>
        )}
      </Map>

      {/* Hover tooltip */}
      {tooltipContent && tooltipPosition && (
        <>
          {tooltipContent.type === 'area' ? (
            <MapTooltip
              areaName={tooltipContent.props.name}
              areaCode={tooltipContent.props.area_code}
              price={tooltipContent.props.price_per_sqm_avg}
              x={tooltipPosition.x}
              y={tooltipPosition.y}
            />
          ) : (
            <BuildingTooltip
              props={tooltipContent.props}
              x={tooltipPosition.x}
              y={tooltipPosition.y}
            />
          )}
        </>
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
  const price = props.estimated_price_per_sqm
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
