'use client'

import { useEffect, useState } from 'react'
import { Analytics } from '@vercel/analytics/next'
import { hasAnalyticsConsent } from './CookieConsentBanner'

export function ConditionalAnalytics() {
  const [consented, setConsented] = useState(false)

  useEffect(() => {
    setConsented(hasAnalyticsConsent())
  }, [])

  if (!consented) return null
  return <Analytics />
}
