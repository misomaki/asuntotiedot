'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/app/contexts/AuthContext'
import type { BuildingSignals, RoomCount } from '@/app/types'

/** Buyer interest preferences */
export interface InterestPreferences {
  room_count?: RoomCount
  min_sqm?: number
  max_sqm?: number
}

interface UseMarketplaceSignalsResult {
  signals: BuildingSignals | null
  isLoading: boolean
  /** Whether the current user has expressed interest */
  hasMyInterest: boolean
  /** Whether the current user has a sell intent */
  hasMySellIntent: boolean
  /** Submit interest with preferences (or remove if already set) */
  submitInterest: (prefs: InterestPreferences) => Promise<void>
  /** Remove existing interest */
  removeInterest: () => Promise<void>
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

  const submitInterest = useCallback(async (prefs: InterestPreferences) => {
    if (!buildingId || !user) return

    await fetch('/api/marketplace/interest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        building_id: buildingId,
        room_count: prefs.room_count ?? null,
        min_sqm: prefs.min_sqm ?? null,
        max_sqm: prefs.max_sqm ?? null,
      }),
    })
    refresh()
  }, [buildingId, user, refresh])

  const removeInterest = useCallback(async () => {
    if (!buildingId || !user) return
    await fetch(`/api/marketplace/interest?buildingId=${buildingId}`, { method: 'DELETE' })
    refresh()
  }, [buildingId, user, refresh])

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
    submitInterest,
    removeInterest,
    toggleSellIntent,
    refresh,
  }
}
