'use client'

import { useState, useEffect, useRef } from 'react'
import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson'

type PropertyTypeFilter = 'kerrostalo' | 'rivitalo' | 'omakotitalo'

type AreaGeoJSON = FeatureCollection<Geometry, GeoJsonProperties>

interface UseMapDataReturn {
  geojson: AreaGeoJSON | null
  isLoading: boolean
  error: string | null
}

/**
 * Hook that fetches GeoJSON area data from the API.
 * Re-fetches when year or propertyType changes.
 * Uses AbortController for cleanup on unmount or dependency change.
 */
export function useMapData(
  year: number,
  propertyType: PropertyTypeFilter
): UseMapDataReturn {
  const [geojson, setGeojson] = useState<AreaGeoJSON | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    async function fetchData() {
      setIsLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          year: String(year),
          type: propertyType,
        })

        const response = await fetch(`/api/areas?${params.toString()}`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(
            `API-virhe: ${response.status} ${response.statusText}`
          )
        }

        const data = (await response.json()) as AreaGeoJSON
        setGeojson(data)
      } catch (err: unknown) {
        // Ignore abort errors -- they are expected during cleanup
        if (err instanceof DOMException && err.name === 'AbortError') {
          return
        }

        const message =
          err instanceof Error ? err.message : 'Tuntematon virhe datan haussa'
        setError(message)
        console.error('useMapData fetch error:', message)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()

    return () => {
      controller.abort()
    }
  }, [year, propertyType])

  return { geojson, isLoading, error }
}
