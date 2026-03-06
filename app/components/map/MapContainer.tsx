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
import { getMapLibreColorExpression } from '@/app/lib/colorScales'
import MapTooltip from './MapTooltip'
import MapLegend from './MapLegend'
import MapControls from './MapControls'

/** CartoCDN Dark Matter basemap (free, no token required) */
const MAP_STYLE =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

/** Properties attached to each GeoJSON feature */
interface HoveredFeatureProperties {
  area_code: string
  name: string
  municipality: string
  price_per_sqm_avg: number | null
  id: string
}

/** Cursor position for tooltip placement */
interface TooltipPosition {
  x: number
  y: number
}

/**
 * Main map component for the Asuntokartta application.
 *
 * Renders the MapLibre GL map with:
 * - Choropleth fill layer (color-coded by price per m2)
 * - Outline layer for area boundaries
 * - Hover tooltip and click-to-select interaction
 * - Navigation controls, legend, and custom controls
 * - Compare mode: highlights both selected and compared areas
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
  } = useMapContext()

  // Fetch GeoJSON based on current filters
  const { geojson, isLoading: dataLoading } = useMapData(
    filters.year,
    filters.propertyType
  )

  // Sync loading state with context
  useEffect(() => {
    setIsLoading(dataLoading)
  }, [dataLoading, setIsLoading])

  // Local hover state
  const [hoveredAreaCode, setHoveredAreaCode] = useState<string | null>(null)
  const [hoveredFeature, setHoveredFeature] =
    useState<HoveredFeatureProperties | null>(null)
  const [tooltipPosition, setTooltipPosition] =
    useState<TooltipPosition | null>(null)
  const [cursor, setCursor] = useState<string>('')

  // Area codes for highlighting
  const selectedAreaCode = selectedArea?.areaCode ?? ''
  const comparedAreaCode = comparedArea?.areaCode ?? ''

  // -------------------------------------------------------
  // Map layer paint expressions (memoised to avoid re-creation)
  // -------------------------------------------------------

  const colorExpression = useMemo(
    () => getMapLibreColorExpression() as ExpressionSpecification,
    []
  )

  /**
   * Fill color expression: In compare mode, override fill color for
   * selected area (blue tint) and compared area (purple tint).
   * Outside compare mode, use the standard choropleth color.
   */
  const fillColorExpression = useMemo(
    (): ExpressionSpecification =>
      isCompareMode
        ? [
            'case',
            ['==', ['get', 'area_code'], selectedAreaCode],
            '#3b82f6', // blue for selected area (area 2)
            ['==', ['get', 'area_code'], comparedAreaCode],
            '#8b5cf6', // purple for compared area (area 1)
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

  const handleMouseMove = useCallback((evt: MapLayerMouseEvent) => {
    const feature = evt.features?.[0]

    if (feature && feature.properties) {
      const props = feature.properties as HoveredFeatureProperties
      setHoveredAreaCode(props.area_code)
      setHoveredFeature(props)
      setTooltipPosition({ x: evt.point.x, y: evt.point.y })
      setCursor('pointer')
    } else {
      setHoveredAreaCode(null)
      setHoveredFeature(null)
      setTooltipPosition(null)
      setCursor('')
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHoveredAreaCode(null)
    setHoveredFeature(null)
    setTooltipPosition(null)
    setCursor('')
  }, [])

  const handleClick = useCallback(
    (evt: MapLayerMouseEvent) => {
      const feature = evt.features?.[0]
      if (!feature || !feature.properties) return

      const props = feature.properties as HoveredFeatureProperties

      // In compare mode, clicking sets the selectedArea (second area).
      // The comparedArea is already set from the sidebar "Vertaa" button.
      setSelectedArea({
        id: props.id,
        areaCode: props.area_code,
        name: props.name,
      })
      setIsSidebarOpen(true)
    },
    [setSelectedArea, setIsSidebarOpen]
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
        interactiveLayerIds={['area-fill']}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        reuseMaps
      >
        {/* Navigation controls (zoom +/-, compass) */}
        <NavigationControl position="top-left" showCompass visualizePitch />

        {/* GeoJSON source + layers */}
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
      </Map>

      {/* Hover tooltip */}
      {hoveredFeature && tooltipPosition && (
        <MapTooltip
          areaName={hoveredFeature.name}
          areaCode={hoveredFeature.area_code}
          price={hoveredFeature.price_per_sqm_avg}
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
