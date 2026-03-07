'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson'
import { useMapContext } from '@/app/contexts/MapContext'

type BuildingGeoJSON = FeatureCollection<Geometry, GeoJsonProperties>

interface UseBuildingDataReturn {
  buildings: BuildingGeoJSON | null
  isLoading: boolean
}

/** Minimum zoom level at which individual buildings are fetched */
const MIN_BUILDING_ZOOM = 14

/** Debounce delay for viewport changes (ms) */
const DEBOUNCE_MS = 300

/**
 * Hook that fetches building outlines within the current viewport.
 * Only active when zoom >= 14. Debounces viewport changes to avoid
 * excessive API calls during panning/zooming.
 */
export function useBuildingData(): UseBuildingDataReturn {
  const { viewport, filters } = useMapContext()
  const [buildings, setBuildings] = useState<BuildingGeoJSON | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchBuildings = useCallback(
    async (
      west: number,
      south: number,
      east: number,
      north: number,
      year: number,
      signal: AbortSignal
    ) => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams({
          west: String(west),
          south: String(south),
          east: String(east),
          north: String(north),
          year: String(year),
        })

        const response = await fetch(`/api/buildings?${params}`, { signal })

        if (!response.ok) return

        const data = (await response.json()) as BuildingGeoJSON
        setBuildings(data)
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.error('useBuildingData fetch error:', err)
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    // Clear buildings when zoomed out
    if (viewport.zoom < MIN_BUILDING_ZOOM) {
      setBuildings(null)
      return
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Clear previous debounce timer
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    // Compute approximate viewport bounds from center + zoom
    const latRange = 360 / Math.pow(2, viewport.zoom + 1)
    const lngRange = 360 / Math.pow(2, viewport.zoom)

    const west = viewport.longitude - lngRange / 2
    const east = viewport.longitude + lngRange / 2
    const south = viewport.latitude - latRange / 2
    const north = viewport.latitude + latRange / 2

    const controller = new AbortController()
    abortControllerRef.current = controller

    timerRef.current = setTimeout(() => {
      fetchBuildings(west, south, east, north, filters.year, controller.signal)
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      controller.abort()
    }
  }, [viewport.zoom, viewport.longitude, viewport.latitude, filters.year, fetchBuildings])

  return { buildings, isLoading }
}
