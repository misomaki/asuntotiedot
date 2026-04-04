'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { AISearchFilters, AISearchResult } from '@/app/types'

interface AISearchState {
  /** Whether AI search is active */
  isActive: boolean
  /** Current parsed filters */
  filters: AISearchFilters | null
  /** Filter chips (human-readable labels) */
  filterChips: string[]
  /** Search results */
  results: AISearchResult[]
  /** Total matching count (may be more than results.length) */
  totalCount: number
  /** Cluster data for map visualization at low zoom */
  clusters: Array<{ lat: number; lng: number; count: number; avg_price: number }>
  /** Loading state */
  isLoading: boolean
  /** Error message */
  error: string | null
  /** The original query text */
  queryText: string
  /** Set of matching building IDs (for map glow) */
  matchingBuildingIds: Set<string>
}

interface AISearchContextValue extends AISearchState {
  /** Run an AI search from natural language */
  search: (query: string) => Promise<void>
  /** Remove a filter chip and re-search */
  removeChip: (chipIndex: number) => void
  /** Clear search and return to normal map */
  clearSearch: () => void
}

const AISearchContext = createContext<AISearchContextValue | undefined>(undefined)

export function AISearchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AISearchState>({
    isActive: false,
    filters: null,
    filterChips: [],
    results: [],
    totalCount: 0,
    clusters: [],
    isLoading: false,
    error: null,
    queryText: '',
    matchingBuildingIds: new Set(),
  })

  const search = useCallback(async (query: string) => {
    setState(prev => ({
      ...prev,
      isActive: true,
      isLoading: true,
      error: null,
      queryText: query,
    }))

    try {
      // Step 1: Parse query with AI
      const parseRes = await fetch('/api/marketplace/ai-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })

      if (!parseRes.ok) {
        const errBody = await parseRes.json().catch(() => ({})) as { error?: string }
        console.error('AI search parse failed:', parseRes.status, errBody)
        throw new Error(errBody.error || 'Haun analysointi epäonnistui')
      }

      const { filters, chips } = await parseRes.json() as {
        filters: AISearchFilters
        chips: string[]
      }

      // Step 2: Search buildings with parsed filters
      const searchRes = await fetch('/api/marketplace/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters, limit: 200 }),
      })

      if (!searchRes.ok) {
        throw new Error('Rakennushaku epäonnistui')
      }

      const { total, buildings, clusters } = await searchRes.json() as {
        total: number
        buildings: AISearchResult[]
        clusters: Array<{ lat: number; lng: number; count: number; avg_price: number }>
      }

      setState({
        isActive: true,
        filters,
        filterChips: chips,
        results: buildings,
        totalCount: total,
        clusters,
        isLoading: false,
        error: null,
        queryText: query,
        matchingBuildingIds: new Set(buildings.map(b => b.id)),
      })
    } catch (err) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: (err as Error).message ?? 'Haku epäonnistui',
      }))
    }
  }, [])

  const removeChip = useCallback((_chipIndex: number) => {
    // For Phase 1, re-run the search without the removed filter
    // Full implementation would modify filters and re-query
    // For now, just remove the chip visually
    setState(prev => ({
      ...prev,
      filterChips: prev.filterChips.filter((_, i) => i !== _chipIndex),
    }))
  }, [])

  const clearSearch = useCallback(() => {
    setState({
      isActive: false,
      filters: null,
      filterChips: [],
      results: [],
      totalCount: 0,
      clusters: [],
      isLoading: false,
      error: null,
      queryText: '',
      matchingBuildingIds: new Set(),
    })
  }, [])

  return (
    <AISearchContext.Provider value={{ ...state, search, removeChip, clearSearch }}>
      {children}
    </AISearchContext.Provider>
  )
}

export function useAISearch(): AISearchContextValue {
  const ctx = useContext(AISearchContext)
  if (!ctx) throw new Error('useAISearch must be used within AISearchProvider')
  return ctx
}
