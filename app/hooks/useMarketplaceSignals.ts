'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/app/contexts/AuthContext'
import type { BuildingSignals } from '@/app/types'

interface UseMarketplaceSignalsResult {
  signals: BuildingSignals | null
  isLoading: boolean
  /** Whether the current user has expressed interest */
  hasMyInterest: boolean
  /** Whether the current user has a sell intent */
  hasMySellIntent: boolean
  /** Toggle interest on/off */
  toggleInterest: () => Promise<void>
  /** Toggle sell intent on/off */
  toggleSellIntent: () => Promise<void>
  /** Refresh signal counts */
  refresh: () => void
}

export function useMarketplaceSignals(buildingId: string | null): UseMarketplaceSignalsResult {
  const { user } = useAuth()
  const [signals, setSignals] = useState<BuildingSignals | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasMyInterest, setHasMyInterest] = useState(false)
  const [hasMySellIntent, setHasMySellIntent] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey(k => k + 1), [])

  // Fetch aggregate signals (public)
  useEffect(() => {
    if (!buildingId) {
      setSignals(null)
      return
    }

    setIsLoading(true)
    fetch(`/api/marketplace/signals?buildingId=${buildingId}`)
      .then(res => res.ok ? res.json() : null)
      .then((data: BuildingSignals | null) => {
        setSignals(data)
      })
      .catch(() => setSignals(null))
      .finally(() => setIsLoading(false))
  }, [buildingId, refreshKey])

  // Check if current user has existing signals on this building
  useEffect(() => {
    if (!buildingId || !user) {
      setHasMyInterest(false)
      setHasMySellIntent(false)
      return
    }

    fetch('/api/marketplace/my-signals')
      .then(res => res.ok ? res.json() : [])
      .then((data: Array<{ building_id: string; type: string }>) => {
        setHasMyInterest(data.some(s => s.building_id === buildingId && s.type === 'interest'))
        setHasMySellIntent(data.some(s => s.building_id === buildingId && s.type === 'sell_intent'))
      })
      .catch(() => {
        setHasMyInterest(false)
        setHasMySellIntent(false)
      })
  }, [buildingId, user, refreshKey])

  const toggleInterest = useCallback(async () => {
    if (!buildingId || !user) return

    if (hasMyInterest) {
      await fetch(`/api/marketplace/interest?buildingId=${buildingId}`, { method: 'DELETE' })
    } else {
      await fetch('/api/marketplace/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ building_id: buildingId }),
      })
    }
    refresh()
  }, [buildingId, user, hasMyInterest, refresh])

  const toggleSellIntent = useCallback(async () => {
    if (!buildingId || !user) return

    if (hasMySellIntent) {
      await fetch(`/api/marketplace/sell-intent?buildingId=${buildingId}`, { method: 'DELETE' })
    } else {
      await fetch('/api/marketplace/sell-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ building_id: buildingId }),
      })
    }
    refresh()
  }, [buildingId, user, hasMySellIntent, refresh])

  return {
    signals,
    isLoading,
    hasMyInterest,
    hasMySellIntent,
    toggleInterest,
    toggleSellIntent,
    refresh,
  }
}
