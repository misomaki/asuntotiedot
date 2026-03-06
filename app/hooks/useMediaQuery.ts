'use client'

import { useState, useEffect } from 'react'

/**
 * SSR-safe media query hook.
 * Returns whether the given CSS media query matches.
 * Returns false during SSR and on the first render, then updates on mount and resize.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query)

    // Set initial value once we are on the client
    setMatches(mediaQueryList.matches)

    function handleChange(event: MediaQueryListEvent) {
      setMatches(event.matches)
    }

    mediaQueryList.addEventListener('change', handleChange)

    return () => {
      mediaQueryList.removeEventListener('change', handleChange)
    }
  }, [query])

  return matches
}
