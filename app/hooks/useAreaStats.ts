'use client'

import { useState, useEffect, useRef } from 'react'
import type { AreaWithStats } from '@/app/types'

interface UseAreaStatsReturn {
  data: AreaWithStats | null
  isLoading: boolean
  error: string | null
}

/**
 * Hook that fetches detailed stats for a single postal code area.
 * Fetches from /api/areas/${areaCode}?year=${year}.
 * Uses AbortController for cleanup when areaCode or year changes.
 * Returns null when areaCode is null (no area selected).
 */
export function useAreaStats(
  areaCode: string | null,
  year: number
): UseAreaStatsReturn {
  const [data, setData] = useState<AreaWithStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    // Reset state when no area is selected
    if (!areaCode) {
      setData(null)
      setIsLoading(false)
      setError(null)
      return
    }

    // Abort any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    async function fetchAreaStats() {
      setIsLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({ year: String(year) })
        const response = await fetch(
          `/api/areas/${areaCode}?${params.toString()}`,
          { signal: controller.signal }
        )

        if (!response.ok) {
          throw new Error(
            `API-virhe: ${response.status} ${response.statusText}`
          )
        }

        const result: AreaWithStats = await response.json()
        setData(result)
      } catch (err: unknown) {
        // Ignore abort errors – they are expected during cleanup
        if (err instanceof DOMException && err.name === 'AbortError') {
          return
        }

        const message =
          err instanceof Error
            ? err.message
            : 'Tuntematon virhe aluetietojen haussa'
        setError(message)
        console.error('useAreaStats fetch error:', message)
      } finally {
        setIsLoading(false)
      }
    }

    fetchAreaStats()

    return () => {
      controller.abort()
    }
  }, [areaCode, year])

  return { data, isLoading, error }
}
