'use client'

import { useState, useEffect, useRef } from 'react'
import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson'

type PropertyTypeFilter = 'kerrostalo' | 'rivitalo' | 'omakotitalo'
type MunicipalityGeoJSON = FeatureCollection<Geometry, GeoJsonProperties>

export interface PriceRange {
  min: number
  max: number
}

interface UseMunicipalityDataReturn {
  geojson: MunicipalityGeoJSON | null
  priceRange: PriceRange | null
  isLoading: boolean
}

/**
 * Fetches municipality boundary polygons with median prices.
 * Used for the zoomed-out overview layer.
 */
export function useMunicipalityData(
  year: number,
  propertyType: PropertyTypeFilter
): UseMunicipalityDataReturn {
  const [geojson, setGeojson] = useState<MunicipalityGeoJSON | null>(null)
  const [priceRange, setPriceRange] = useState<PriceRange | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    async function fetchData() {
      setIsLoading(true)

      try {
        const params = new URLSearchParams({
          year: String(year),
          type: propertyType,
        })

        const response = await fetch(`/api/municipalities?${params.toString()}`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }

        const data = await response.json()
        // Extract priceRange from response (outside standard GeoJSON spec)
        const range = data.priceRange as PriceRange | undefined
        setPriceRange(range ?? null)

        // Set geojson (features only — standard GeoJSON)
        setGeojson({
          type: 'FeatureCollection',
          features: data.features ?? [],
        })
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.error('useMunicipalityData fetch error:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()

    return () => {
      controller.abort()
    }
  }, [year, propertyType])

  return { geojson, priceRange, isLoading }
}
