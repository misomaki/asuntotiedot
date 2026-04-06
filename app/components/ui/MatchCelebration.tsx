'use client'

import { useEffect, useState } from 'react'
import { Sparkles, ArrowRight } from 'lucide-react'
import { cn } from '@/app/lib/utils'
import { SparkBurst } from '@/app/components/ui/SparkBurst'
import { AnimatedNumber } from '@/app/components/ui/AnimatedNumber'

interface MatchCelebrationProps {
  /** 'seller' shows interest count, 'buyer' shows seller confirmation */
  variant: 'seller' | 'buyer'
  /** Number of interested buyers (seller variant) */
  interestCount?: number
  /** Building address for context */
  address?: string | null
  /** Called when user taps the action link */
  onAction?: () => void
  /** Called when celebration auto-dismisses or user closes it */
  onDismiss?: () => void
  /** Auto-dismiss after N ms (0 = never) */
  autoDismissMs?: number
}

export function MatchCelebration({
  variant,
  interestCount = 0,
  address,
  onAction,
  onDismiss,
  autoDismissMs = 6000,
}: MatchCelebrationProps) {
  const [visible, setVisible] = useState(true)
  const [sparksActive, setSparksActive] = useState(true)

  // Auto-dismiss
  useEffect(() => {
    if (autoDismissMs > 0) {
      const timer = setTimeout(() => {
        setVisible(false)
        onDismiss?.()
      }, autoDismissMs)
      return () => clearTimeout(timer)
    }
  }, [autoDismissMs, onDismiss])

  // Sparks auto-deactivate
  useEffect(() => {
    const timer = setTimeout(() => setSparksActive(false), 900)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null

  return (
    <div
      className={cn(
        'relative rounded-xl border-2 p-4 overflow-hidden',
        'animate-celebration-in animate-glow-pulse',
        variant === 'seller'
          ? 'border-pink bg-gradient-to-br from-pink-pale via-yellow-pale to-pink-pale'
          : 'border-mint bg-gradient-to-br from-[#eefff8] via-yellow-pale to-[#eefff8]',
      )}
    >
      {/* Spark burst from center */}
      <SparkBurst active={sparksActive} />

      {/* Content */}
      <div className="relative z-[1]">
        {/* Heading row */}
        <div className="flex items-center gap-2">
          <Sparkles
            size={18}
            className={cn(
              'flex-shrink-0 animate-wiggle',
              variant === 'seller' ? 'text-pink-deep' : 'text-mint',
            )}
          />
          <h4 className="text-sm font-display font-black text-[#1a1a1a]">
            Yhteys syntyi!
          </h4>
        </div>

        {/* Body */}
        <p className="mt-1.5 text-xs text-[#1a1a1a]/70 leading-relaxed">
          {variant === 'seller' ? (
            <>
              <span className="font-bold text-[#1a1a1a]">
                <AnimatedNumber value={interestCount} fromZero duration={600} />
              </span>
              {' '}
              {interestCount === 1 ? 'ostaja on' : 'ostajaa on'} jo kiinnostunut
              {address ? (
                <> osoitteessa <span className="font-medium text-[#1a1a1a]">{address}</span></>
              ) : (
                <> tästä rakennuksesta</>
              )}.
            </>
          ) : (
            <>
              Tämä asunto on myynnissä! Omistaja harkitsee myyntiä
              {' '}&mdash; kiinnostuksesi on tallennettu ja olet jonossa ensimmäisten joukossa.
            </>
          )}
        </p>

        {/* Action link */}
        {onAction && (
          <button
            type="button"
            onClick={() => {
              onAction()
              setVisible(false)
              onDismiss?.()
            }}
            className={cn(
              'mt-2.5 inline-flex items-center gap-1 text-xs font-bold',
              'transition-colors',
              variant === 'seller'
                ? 'text-pink-deep hover:text-pink'
                : 'text-mint hover:text-mint-light',
            )}
          >
            {variant === 'seller' ? 'Näytä kartalla' : 'Näytä ilmoitus'}
            <ArrowRight size={12} />
          </button>
        )}
      </div>

      {/* Dismiss tap target */}
      <button
        type="button"
        onClick={() => {
          setVisible(false)
          onDismiss?.()
        }}
        className="absolute top-2 right-2 h-5 w-5 rounded-full flex items-center justify-center text-[#1a1a1a]/30 hover:text-[#1a1a1a]/60 transition-colors text-xs"
        aria-label="Sulje"
      >
        &times;
      </button>
    </div>
  )
}
