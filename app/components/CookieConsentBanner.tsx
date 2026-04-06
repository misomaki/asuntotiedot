'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { cn } from '@/app/lib/utils'

const CONSENT_KEY = 'neliot-cookie-consent'

export type ConsentValue = 'accepted' | 'declined' | null

export function getStoredConsent(): ConsentValue {
  if (typeof window === 'undefined') return null
  const value = localStorage.getItem(CONSENT_KEY)
  if (value === 'accepted' || value === 'declined') return value
  return null
}

export function hasAnalyticsConsent(): boolean {
  return getStoredConsent() === 'accepted'
}

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Show banner only if user hasn't made a choice yet
    if (getStoredConsent() === null) {
      setVisible(true)
    }
  }, [])

  function handleAccept() {
    localStorage.setItem(CONSENT_KEY, 'accepted')
    setVisible(false)
    // Reload to initialize analytics
    window.location.reload()
  }

  function handleDecline() {
    localStorage.setItem(CONSENT_KEY, 'declined')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] p-4 md:p-6 pointer-events-none">
      <div
        className={cn(
          'pointer-events-auto mx-auto max-w-lg',
          'rounded-xl border-2 border-[#1a1a1a] bg-bg-primary p-5',
          'shadow-hard',
          'animate-slide-up'
        )}
      >
        <p className="text-sm font-body text-[#1a1a1a] mb-1.5">
          <strong className="font-display font-bold">Evästeet</strong>
        </p>
        <p className="text-xs font-body text-[#666] mb-4 leading-relaxed">
          Käytämme analytiikkaevästeitä palvelun kehittämiseen.
          Voit hyväksyä tai kieltäytyä niistä. Palvelu toimii ilman analytiikkaakin.{' '}
          <Link
            href="/tietosuoja"
            className="underline underline-offset-2 hover:text-[#1a1a1a] transition-colors"
          >
            Tietosuojaseloste
          </Link>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleAccept}
            className={cn(
              'neo-press flex-1',
              'h-10 rounded-lg border-2 border-[#1a1a1a]',
              'text-sm font-bold text-[#1a1a1a] shadow-hard-sm',
              'bg-pink-baby hover:bg-pink-pale transition-colors'
            )}
          >
            Hyväksy
          </button>
          <button
            type="button"
            onClick={handleDecline}
            className={cn(
              'neo-press flex-1',
              'h-10 rounded-lg border-2 border-[#1a1a1a]',
              'text-sm font-medium text-[#1a1a1a] shadow-hard-sm',
              'bg-bg-primary hover:bg-[#f0efed] transition-colors'
            )}
          >
            Vain välttämättömät
          </button>
        </div>
      </div>
    </div>
  )
}
