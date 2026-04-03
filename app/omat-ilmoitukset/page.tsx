'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/app/contexts/AuthContext'
import { cn } from '@/app/lib/utils'
import { formatNumber } from '@/app/lib/formatters'
import { Eye, HandCoins, Trash2, MapPin, ArrowLeft, LogIn } from 'lucide-react'
import Link from 'next/link'
import type { UserSignalWithBuilding } from '@/app/types'

export default function MySignalsPage() {
  const { user, loading: authLoading } = useAuth()
  const [signals, setSignals] = useState<UserSignalWithBuilding[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setIsLoading(false)
      return
    }
    fetchSignals()
  }, [user])

  async function fetchSignals() {
    setIsLoading(true)
    try {
      const res = await fetch('/api/marketplace/my-signals')
      if (res.ok) {
        setSignals(await res.json())
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
    }
  }

  async function handleDelete(signal: UserSignalWithBuilding) {
    setDeletingId(signal.id)
    try {
      const endpoint = signal.type === 'interest'
        ? `/api/marketplace/interest?buildingId=${signal.building_id}`
        : `/api/marketplace/sell-intent?buildingId=${signal.building_id}`
      await fetch(endpoint, { method: 'DELETE' })
      setSignals(prev => prev.filter(s => s.id !== signal.id))
    } catch {
      // ignore
    } finally {
      setDeletingId(null)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-[#1a1a1a] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center gap-6 px-4">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-display font-bold">Kirjaudu sisään</h1>
          <p className="text-sm text-muted-foreground max-w-sm">
            Nähdäksesi omat ilmoituksesi, kirjaudu ensin sisään.
          </p>
        </div>
        <Link
          href="/login"
          className={cn(
            'inline-flex items-center gap-2 px-6 py-3 rounded-xl',
            'bg-[#1a1a1a] text-white font-medium text-sm',
            'border-2 border-[#1a1a1a] shadow-hard-sm',
            'hover:bg-[#333] transition-colors',
          )}
        >
          <LogIn size={16} />
          Kirjaudu
        </Link>
      </div>
    )
  }

  const interests = signals.filter(s => s.type === 'interest')
  const sellIntents = signals.filter(s => s.type === 'sell_intent')

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/"
            className="h-9 w-9 rounded-lg border-2 border-[#1a1a1a]/15 flex items-center justify-center hover:bg-muted/50 transition-colors"
            aria-label="Takaisin kartalle"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-xl font-display font-bold">Omat ilmoitukset</h1>
            <p className="text-xs text-muted-foreground">
              {signals.length} ilmoitus{signals.length !== 1 ? 'ta' : ''}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : signals.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <p className="text-muted-foreground text-sm">
              Ei vielä ilmoituksia.
            </p>
            <p className="text-muted-foreground/70 text-xs">
              Klikkaa rakennusta kartalla ja merkitse kiinnostuksesi tai myynti-ilmoituksesi.
            </p>
            <Link
              href="/"
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg mt-2',
                'text-xs font-medium border-2 border-[#1a1a1a]/15',
                'hover:border-[#1a1a1a]/30 transition-colors',
              )}
            >
              <MapPin size={14} />
              Siirry kartalle
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Sell intents section */}
            {sellIntents.length > 0 && (
              <section>
                <h2 className="text-sm font-display font-bold text-foreground flex items-center gap-1.5 mb-3">
                  <HandCoins size={15} className="text-green-600" />
                  Myynti-ilmoitukset ({sellIntents.length})
                </h2>
                <div className="space-y-2">
                  {sellIntents.map(signal => (
                    <SignalCard
                      key={signal.id}
                      signal={signal}
                      onDelete={() => handleDelete(signal)}
                      isDeleting={deletingId === signal.id}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Interests section */}
            {interests.length > 0 && (
              <section>
                <h2 className="text-sm font-display font-bold text-foreground flex items-center gap-1.5 mb-3">
                  <Eye size={15} className="text-blue-600" />
                  Kiinnostukset ({interests.length})
                </h2>
                <div className="space-y-2">
                  {interests.map(signal => (
                    <SignalCard
                      key={signal.id}
                      signal={signal}
                      onDelete={() => handleDelete(signal)}
                      isDeleting={deletingId === signal.id}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SignalCard({
  signal,
  onDelete,
  isDeleting,
}: {
  signal: UserSignalWithBuilding
  onDelete: () => void
  isDeleting: boolean
}) {
  const isSell = signal.type === 'sell_intent'
  const isExpired = new Date(signal.expires_at) < new Date()

  return (
    <div
      className={cn(
        'rounded-xl border-2 p-3.5 flex items-start gap-3 transition-colors',
        isExpired
          ? 'border-[#1a1a1a]/10 bg-muted/20 opacity-60'
          : isSell
            ? 'border-green-200 bg-green-50/50'
            : 'border-blue-200 bg-blue-50/50',
      )}
    >
      <div
        className={cn(
          'h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0',
          isSell ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700',
        )}
      >
        {isSell ? <HandCoins size={16} /> : <Eye size={16} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {signal.address ?? `Rakennus ${signal.building_id.slice(0, 8)}`}
        </p>
        <p className="text-xs text-muted-foreground">
          {signal.area_code}
          {signal.estimated_price_per_sqm != null && (
            <span> &middot; {formatNumber(Math.round(signal.estimated_price_per_sqm))} €/m²</span>
          )}
        </p>
        {/* Interest preferences (room count + sqm) */}
        {signal.type === 'interest' && (signal.room_count || signal.min_sqm != null || signal.max_sqm != null) && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {signal.room_count && <span>{signal.room_count === '5+' ? '5+' : signal.room_count}h</span>}
            {signal.room_count && (signal.min_sqm != null || signal.max_sqm != null) && ' · '}
            {signal.min_sqm != null && signal.max_sqm != null && (
              <span>{signal.min_sqm}–{signal.max_sqm} m²</span>
            )}
            {signal.min_sqm != null && signal.max_sqm == null && (
              <span>&gt; {signal.min_sqm} m²</span>
            )}
            {signal.min_sqm == null && signal.max_sqm != null && (
              <span>&lt; {signal.max_sqm} m²</span>
            )}
          </p>
        )}
        {signal.note && (
          <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">{signal.note}</p>
        )}
        <p className="text-[11px] text-muted-foreground/50 mt-1">
          {isExpired ? 'Vanhentunut' : `Voimassa ${new Date(signal.expires_at).toLocaleDateString('fi-FI')}`}
        </p>
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={isDeleting}
        className={cn(
          'h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0',
          'text-muted-foreground/50 hover:text-red-500 hover:bg-red-50',
          'transition-colors disabled:opacity-30',
        )}
        aria-label="Poista ilmoitus"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}
