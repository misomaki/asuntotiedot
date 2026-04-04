'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/app/contexts/AuthContext'
import type { BuildingSignals, RoomCount } from '@/app/types'

/** Buyer interest preferences */
export interface InterestPreferences {
  room_count?: RoomCount
  min_sqm?: number
  max_sqm?: number
  note?: string
}

/** Seller listing options */
export interface SellIntentOptions {
  note?: string
  asking_price_per_sqm?: number
}

interface UseMarketplaceSignalsResult {
  signals: BuildingSignals | null
  isLoading: boolean
  hasMyInterest: boolean
  hasMySellIntent: boolean
  /** Submit interest with preferences and optional note */
  submitInterest: (prefs: InterestPreferences) => Promise<void>
  /** Remove existing interest */
  removeInterest: () => Promise<void>
  /** Submit sell intent with note */
  submitSellIntent: (opts: SellIntentOptions) => Promise<void>
  /** Remove existing sell intent */
  removeSellIntent: () => Promise<void>
  /** Generate AI summary for seller or buyer */
  generateSummary: (type: 'seller' | 'buyer', preferences?: InterestPreferences) => Promise<string>
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
        note: prefs.note ?? null,
      }),
    })
    refresh()
  }, [buildingId, user, refresh])

  const removeInterest = useCallback(async () => {
    if (!buildingId || !user) return
    await fetch(`/api/marketplace/interest?buildingId=${buildingId}`, { method: 'DELETE' })
    refresh()
  }, [buildingId, user, refresh])

  const submitSellIntent = useCallback(async (opts: SellIntentOptions) => {
    if (!buildingId || !user) return

    await fetch('/api/marketplace/sell-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        building_id: buildingId,
        note: opts.note ?? null,
        asking_price_per_sqm: opts.asking_price_per_sqm ?? null,
      }),
    })
    refresh()
  }, [buildingId, user, refresh])

  const removeSellIntent = useCallback(async () => {
    if (!buildingId || !user) return
    await fetch(`/api/marketplace/sell-intent?buildingId=${buildingId}`, { method: 'DELETE' })
    refresh()
  }, [buildingId, user, refresh])

  const generateSummary = useCallback(async (
    type: 'seller' | 'buyer',
    preferences?: InterestPreferences
  ): Promise<string> => {
    if (!buildingId) return ''

    try {
      const res = await fetch('/api/marketplace/generate-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building_id: buildingId,
          type,
          preferences: preferences ? {
            room_count: preferences.room_count,
            min_sqm: preferences.min_sqm,
            max_sqm: preferences.max_sqm,
          } : undefined,
        }),
      })

      if (!res.ok) return ''
      const { summary } = await res.json() as { summary: string }
      return summary
    } catch {
      return ''
    }
  }, [buildingId])

  return {
    signals,
    isLoading,
    hasMyInterest,
    hasMySellIntent,
    submitInterest,
    removeInterest,
    submitSellIntent,
    removeSellIntent,
    generateSummary,
    refresh,
  }
}
