'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/app/contexts/AuthContext'
import type { UserAddress } from '@/app/types'

/** Set of building_ids that have active sell intents */
type SellIntentSet = Set<string>

interface UseUserAddressesResult {
  addresses: UserAddress[]
  isLoading: boolean
  error: string | null
  /** Add a new address (geocoded + matched to building) */
  addAddress: (address: string) => Promise<{ success: boolean; error?: string }>
  /** Remove an address by ID */
  removeAddress: (id: string) => Promise<void>
  /** Check if a building_id is in the user's addresses */
  ownsBuilding: (buildingId: string) => boolean
  /** Check if a building has an active sell intent */
  hasSellIntent: (buildingId: string) => boolean
  /** Toggle sell intent for a building (create or remove). Returns match info if buyers exist. */
  toggleSellIntent: (buildingId: string, note?: string) => Promise<{ success: boolean; error?: string; match?: { interest_count: number } }>
  /** Refresh address list */
  refresh: () => void
}

export function useUserAddresses(): UseUserAddressesResult {
  const { user } = useAuth()
  const [addresses, setAddresses] = useState<UserAddress[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [sellIntents, setSellIntents] = useState<SellIntentSet>(new Set())

  const refresh = useCallback(() => setRefreshKey(k => k + 1), [])

  // Fetch addresses
  useEffect(() => {
    if (!user) {
      setAddresses([])
      setSellIntents(new Set())
      return
    }

    setIsLoading(true)
    setError(null)

    // Fetch addresses and sell intents in parallel
    Promise.all([
      fetch('/api/marketplace/my-addresses').then(res => {
        if (!res.ok) throw new Error('Fetch failed')
        return res.json() as Promise<UserAddress[]>
      }),
      fetch('/api/marketplace/my-signals').then(res => {
        if (!res.ok) return []
        return res.json() as Promise<Array<{ building_id: string; type: string }>>
      }),
    ])
      .then(([addrs, signals]) => {
        setAddresses(addrs)
        setSellIntents(new Set(
          signals
            .filter(s => s.type === 'sell_intent')
            .map(s => s.building_id)
        ))
      })
      .catch(() => {
        setError('Osoitteiden lataaminen epäonnistui')
        setAddresses([])
        setSellIntents(new Set())
      })
      .finally(() => setIsLoading(false))
  }, [user, refreshKey])

  const addAddress = useCallback(async (address: string) => {
    if (!user) return { success: false, error: 'Kirjaudu sisään' }

    try {
      const res = await fetch('/api/marketplace/my-addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      })

      if (!res.ok) {
        const body = await res.json()
        return { success: false, error: body.error || 'Osoitteen lisääminen epäonnistui' }
      }

      refresh()
      return { success: true }
    } catch {
      return { success: false, error: 'Verkkovirhe' }
    }
  }, [user, refresh])

  const removeAddress = useCallback(async (id: string) => {
    if (!user) return
    await fetch(`/api/marketplace/my-addresses?id=${id}`, { method: 'DELETE' })
    refresh()
  }, [user, refresh])

  const ownsBuilding = useCallback((buildingId: string) => {
    return addresses.some(a => a.building_id === buildingId)
  }, [addresses])

  const hasSellIntent = useCallback((buildingId: string) => {
    return sellIntents.has(buildingId)
  }, [sellIntents])

  const toggleSellIntent = useCallback(async (buildingId: string, note?: string): Promise<{ success: boolean; error?: string; match?: { interest_count: number } }> => {
    if (!user) return { success: false, error: 'Kirjaudu sisään' }

    const isActive = sellIntents.has(buildingId)

    try {
      if (isActive) {
        // Remove sell intent
        const res = await fetch(`/api/marketplace/sell-intent?buildingId=${buildingId}`, {
          method: 'DELETE',
        })
        if (!res.ok) {
          const body = await res.json()
          return { success: false, error: body.error || 'Myynti-ilmoituksen poistaminen epäonnistui' }
        }
        refresh()
        return { success: true }
      } else {
        // Create sell intent
        const res = await fetch('/api/marketplace/sell-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            building_id: buildingId,
            note: note ?? null,
          }),
        })
        if (!res.ok) {
          const body = await res.json()
          return { success: false, error: body.error || 'Myynti-ilmoituksen luominen epäonnistui' }
        }

        // Parse match data from response
        const data = await res.json()
        refresh()
        return {
          success: true,
          match: data.match ?? undefined,
        }
      }
    } catch {
      return { success: false, error: 'Verkkovirhe' }
    }
  }, [user, sellIntents, refresh])

  return {
    addresses,
    isLoading,
    error,
    addAddress,
    removeAddress,
    ownsBuilding,
    hasSellIntent,
    toggleSellIntent,
    refresh,
  }
}
