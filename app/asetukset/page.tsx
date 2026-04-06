'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/contexts/AuthContext'
import { useUserAddresses } from '@/app/hooks/useUserAddresses'
import { cn } from '@/app/lib/utils'
import { MatchCelebration } from '@/app/components/ui/MatchCelebration'
import { ArrowLeft, Download, Trash2, Shield, LogIn, Home, Plus, X, MapPin, Loader2, AlertCircle, HandCoins } from 'lucide-react'
import Link from 'next/link'

export default function SettingsPage() {
  const { user, loading: authLoading, signOut } = useAuth()
  const router = useRouter()
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Address management
  const { addresses, isLoading: addressesLoading, addAddress, removeAddress, hasSellIntent, toggleSellIntent } = useUserAddresses()
  const [newAddress, setNewAddress] = useState('')
  const [addressSubmitting, setAddressSubmitting] = useState(false)
  const [addressError, setAddressError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  // Match celebration state: { addressId → interestCount }
  const [matchCelebration, setMatchCelebration] = useState<{ addressId: string; interestCount: number } | null>(null)

  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch('/api/user/export-data')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `neliot-data-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Tietojen lataaminen epäonnistui.')
    } finally {
      setExporting(false)
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/delete-account', { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Deletion failed')
      }
      await signOut()
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tilin poistaminen epäonnistui.')
      setDeleting(false)
    }
  }

  async function handleAddAddress(e: React.FormEvent) {
    e.preventDefault()
    if (!newAddress.trim()) return

    setAddressSubmitting(true)
    setAddressError(null)

    const result = await addAddress(newAddress.trim())
    if (result.success) {
      setNewAddress('')
    } else {
      setAddressError(result.error ?? 'Osoitteen lisääminen epäonnistui')
    }
    setAddressSubmitting(false)
  }

  async function handleRemoveAddress(id: string) {
    setRemovingId(id)
    await removeAddress(id)
    setRemovingId(null)
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
            Nähdäksesi asetukset, kirjaudu ensin sisään.
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

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/"
            className="h-9 w-9 rounded-lg border-2 border-[#1a1a1a]/15 flex items-center justify-center hover:bg-muted/50 transition-colors"
            aria-label="Takaisin kartalle"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-xl font-display font-bold">Asetukset</h1>
        </div>

        {/* Account info */}
        <section className="mb-8">
          <h2 className="text-sm font-display font-bold text-[#1a1a1a] mb-3 flex items-center gap-1.5">
            <Shield size={15} className="text-[#999]" />
            Tili
          </h2>
          <div className={cn(
            'rounded-xl border-2 border-[#1a1a1a]/15 p-4 space-y-1',
          )}>
            <p className="text-sm font-body">
              <span className="text-[#666]">Sähköposti:</span>{' '}
              <span className="font-medium">{user.email}</span>
            </p>
            <p className="text-sm font-body">
              <span className="text-[#666]">Luotu:</span>{' '}
              <span className="font-medium">{new Date(user.created_at).toLocaleDateString('fi-FI')}</span>
            </p>
          </div>
        </section>

        {/* My addresses */}
        <section className="mb-8">
          <h2 className="text-sm font-display font-bold text-[#1a1a1a] mb-3 flex items-center gap-1.5">
            <Home size={15} className="text-[#999]" />
            Omat asunnot
          </h2>
          <p className="text-xs text-[#666] font-body mb-3 leading-relaxed">
            Lisää osoitteesi ja merkitse myynnissä olevat asunnot. Kiinnostuneet ostajat näkevät ilmoituksesi kartalla.
          </p>

          {/* Existing addresses */}
          {addressesLoading ? (
            <div className="flex items-center gap-2 text-xs text-[#999] mb-3">
              <Loader2 size={14} className="animate-spin" />
              Ladataan...
            </div>
          ) : addresses.length > 0 ? (
            <div className="space-y-2 mb-3">
              {addresses.map(addr => {
                const isSelling = addr.building_id ? hasSellIntent(addr.building_id) : false
                const isToggling = togglingId === addr.id

                return (
                  <div
                    key={addr.id}
                    className={cn(
                      'rounded-xl border-2 p-3 transition-colors',
                      matchCelebration?.addressId === addr.id
                        ? 'animate-border-flash border-pink bg-gradient-to-br from-pink-pale/60 via-yellow-pale/40 to-pink-pale/60'
                        : isSelling
                          ? 'border-green-300 bg-green-50/40'
                          : addr.building_id
                            ? 'border-[#1a1a1a]/15 bg-white'
                            : 'border-amber-200 bg-amber-50/30'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium font-body truncate">
                          {addr.address_text}
                        </p>
                        {addr.building_id ? (
                          <p className="text-xs text-green-700 flex items-center gap-1 mt-0.5">
                            <MapPin size={11} />
                            Rakennus löytyi
                            {addr.building_address && addr.building_address !== addr.address_text && (
                              <span className="text-[#666]"> — {addr.building_address}</span>
                            )}
                          </p>
                        ) : (
                          <p className="text-xs text-amber-700 flex items-center gap-1 mt-0.5">
                            <AlertCircle size={11} />
                            Rakennusta ei löytynyt 50m säteeltä
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAddress(addr.id)}
                        disabled={removingId === addr.id}
                        className={cn(
                          'flex-shrink-0 h-7 w-7 rounded-lg border border-[#1a1a1a]/15',
                          'flex items-center justify-center',
                          'hover:bg-red-50 hover:border-red-300 transition-colors',
                          'disabled:opacity-50'
                        )}
                        aria-label="Poista osoite"
                      >
                        {removingId === addr.id
                          ? <Loader2 size={12} className="animate-spin" />
                          : <X size={12} />
                        }
                      </button>
                    </div>

                    {/* Sell toggle — only for matched buildings */}
                    {addr.building_id && (
                      <div className="mt-2.5 pt-2.5 border-t border-[#1a1a1a]/10">
                        <button
                          type="button"
                          onClick={async () => {
                            setTogglingId(addr.id)
                            setMatchCelebration(null)
                            const result = await toggleSellIntent(addr.building_id!)
                            setTogglingId(null)
                            // Show celebration if match found (seller just activated + buyers exist)
                            if (result.success && result.match && result.match.interest_count > 0) {
                              setMatchCelebration({
                                addressId: addr.id,
                                interestCount: result.match.interest_count,
                              })
                            }
                          }}
                          disabled={isToggling}
                          className={cn(
                            'w-full flex items-center justify-between gap-2',
                            'px-3 py-2 rounded-lg text-xs font-medium',
                            'border-2 transition-all duration-150',
                            'disabled:opacity-50 disabled:cursor-not-allowed',
                            isSelling
                              ? 'bg-green-100 border-green-300 text-green-800'
                              : 'bg-white border-[#1a1a1a]/10 text-[#666] hover:border-green-300 hover:text-green-800 hover:bg-green-50/50',
                          )}
                        >
                          <span className="flex items-center gap-1.5">
                            {isToggling
                              ? <Loader2 size={13} className="animate-spin" />
                              : <HandCoins size={13} />
                            }
                            {isSelling ? 'Myynnissä' : 'Laita myyntiin'}
                          </span>
                          {/* Toggle indicator */}
                          <span className={cn(
                            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200',
                            isSelling ? 'bg-green-500' : 'bg-[#1a1a1a]/15',
                          )}>
                            <span className={cn(
                              'inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200',
                              isSelling ? 'translate-x-[18px]' : 'translate-x-[3px]',
                            )} />
                          </span>
                        </button>

                        {/* Match celebration — shown when toggling ON and buyers exist */}
                        {matchCelebration?.addressId === addr.id && (
                          <div className="mt-2">
                            <MatchCelebration
                              variant="seller"
                              interestCount={matchCelebration.interestCount}
                              address={addr.building_address ?? addr.address_text}
                              onAction={() => {
                                router.push('/')
                                setMatchCelebration(null)
                              }}
                              onDismiss={() => setMatchCelebration(null)}
                              autoDismissMs={8000}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-[#999] font-body mb-3 italic">
              Ei lisättyjä osoitteita.
            </p>
          )}

          {/* Add address form */}
          {addresses.length < 3 && (
            <form onSubmit={handleAddAddress} className="flex gap-2">
              <input
                type="text"
                value={newAddress}
                onChange={e => { setNewAddress(e.target.value); setAddressError(null) }}
                placeholder="Esim. Mannerheimintie 1, Helsinki"
                className={cn(
                  'flex-1 h-10 px-3 rounded-lg border-2 border-[#1a1a1a]/15',
                  'text-sm font-body placeholder:text-[#999]',
                  'focus:outline-none focus:border-pink',
                  'transition-colors'
                )}
                disabled={addressSubmitting}
              />
              <button
                type="submit"
                disabled={addressSubmitting || !newAddress.trim()}
                className={cn(
                  'neo-press',
                  'h-10 px-4 rounded-lg border-2 border-[#1a1a1a]',
                  'text-sm font-medium shadow-hard-sm',
                  'transition-colors flex items-center gap-1.5',
                  addressSubmitting || !newAddress.trim()
                    ? 'bg-[#e5e5e5] text-[#999] cursor-not-allowed'
                    : 'bg-bg-primary text-[#1a1a1a] hover:bg-pink-baby'
                )}
              >
                {addressSubmitting
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Plus size={14} />
                }
                Lisää
              </button>
            </form>
          )}

          {addressError && (
            <div className="rounded-lg border-2 border-red-400 bg-red-50 px-3 py-2 text-xs text-red-700 font-body mt-2">
              {addressError}
            </div>
          )}
        </section>

        {/* Data export */}
        <section className="mb-8">
          <h2 className="text-sm font-display font-bold text-[#1a1a1a] mb-3 flex items-center gap-1.5">
            <Download size={15} className="text-[#999]" />
            Omat tiedot
          </h2>
          <p className="text-xs text-[#666] font-body mb-3">
            Lataa kaikki henkilötietosi JSON-muodossa (GDPR, artikla 20).
          </p>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className={cn(
              'neo-press',
              'h-10 px-5 rounded-lg border-2 border-[#1a1a1a]',
              'text-sm font-medium text-[#1a1a1a] shadow-hard-sm',
              'transition-colors',
              exporting ? 'bg-[#e5e5e5] cursor-not-allowed' : 'bg-bg-primary hover:bg-pink-baby'
            )}
          >
            {exporting ? 'Ladataan...' : 'Lataa tiedot'}
          </button>
        </section>

        {/* Privacy links */}
        <section className="mb-8">
          <h2 className="text-sm font-display font-bold text-[#1a1a1a] mb-3">
            Tietosuoja
          </h2>
          <div className="space-y-2">
            <Link
              href="/tietosuoja"
              className="text-sm text-[#666] font-body underline underline-offset-2 hover:text-[#1a1a1a] transition-colors block"
            >
              Tietosuojaseloste
            </Link>
            <Link
              href="/kayttoehdot"
              className="text-sm text-[#666] font-body underline underline-offset-2 hover:text-[#1a1a1a] transition-colors block"
            >
              Käyttöehdot
            </Link>
          </div>
        </section>

        {/* Danger zone */}
        <section>
          <h2 className="text-sm font-display font-bold text-red-600 mb-3 flex items-center gap-1.5">
            <Trash2 size={15} />
            Poista tili
          </h2>
          <p className="text-xs text-[#666] font-body mb-3 leading-relaxed">
            Tämä poistaa tilisi ja kaikki siihen liittyvät tiedot pysyvästi.
            Toimintoa ei voi peruuttaa.
          </p>

          {error && (
            <div className="rounded-lg border-2 border-red-400 bg-red-50 px-3 py-2 text-sm text-red-700 font-body mb-3">
              {error}
            </div>
          )}

          {!deleteConfirm ? (
            <button
              type="button"
              onClick={() => setDeleteConfirm(true)}
              className={cn(
                'neo-press',
                'h-10 px-5 rounded-lg border-2 border-red-400',
                'text-sm font-medium text-red-600 shadow-hard-sm',
                'bg-bg-primary hover:bg-red-50 transition-colors'
              )}
            >
              Poista tili...
            </button>
          ) : (
            <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4 space-y-3">
              <p className="text-sm font-body text-red-700 font-medium">
                Haluatko varmasti poistaa tilisi? Kaikki tietosi poistetaan pysyvästi.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className={cn(
                    'neo-press',
                    'h-10 px-5 rounded-lg border-2 border-red-600',
                    'text-sm font-bold text-white shadow-hard-sm',
                    'transition-colors',
                    deleting ? 'bg-red-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'
                  )}
                >
                  {deleting ? 'Poistetaan...' : 'Kyllä, poista tilini'}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(false)}
                  disabled={deleting}
                  className={cn(
                    'neo-press',
                    'h-10 px-5 rounded-lg border-2 border-[#1a1a1a]/30',
                    'text-sm font-medium text-[#1a1a1a] shadow-hard-sm',
                    'bg-bg-primary hover:bg-[#f0efed] transition-colors'
                  )}
                >
                  Peruuta
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
