'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { User, LogOut, ChevronDown, HelpCircle, Settings } from 'lucide-react'
import { useAuth } from '@/app/contexts/AuthContext'
import { useMediaQuery } from '@/app/hooks/useMediaQuery'
import { cn } from '@/app/lib/utils'

export function UserMenu() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  if (loading) return null

  // Menu links shared between logged-in and logged-out states
  const menuLinks = (
    <button
      type="button"
      onClick={() => { setIsOpen(false); router.push('/faq') }}
      className={cn(
        'w-full px-3 text-left',
        'flex items-center gap-2',
        isDesktop ? 'py-2 text-xs' : 'py-3 text-sm',
        'text-[#1a1a1a] font-body',
        'hover:bg-pink-baby transition-colors',
        'animate-slide-up'
      )}
      style={{ animationDelay: '0ms', animationFillMode: 'both' }}
    >
      <HelpCircle size={isDesktop ? 12 : 14} className="text-[#999]" />
      Tietoa palvelusta
    </button>
  )

  // Not logged in — show menu button with dropdown
  if (!user) {
    return (
      <div ref={menuRef} className="relative flex-shrink-0">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label="Valikko"
          aria-expanded={isOpen}
          className={cn(
            'neo-press',
            'h-10 md:h-9 px-3 md:px-3 rounded-lg border-2 border-[#1a1a1a] bg-bg-primary',
            'text-sm md:text-xs font-mono font-bold text-[#1a1a1a]',
            'shadow-hard-sm hover:bg-pink-baby transition-colors',
            'flex items-center gap-1.5',
            'cursor-pointer select-none'
          )}
        >
          <User size={isDesktop ? 13 : 16} />
          <span className="hidden md:inline">Kirjaudu</span>
          <ChevronDown
            size={isDesktop ? 11 : 14}
            className={cn('transition-transform', isOpen && 'rotate-180')}
          />
        </button>

        {isOpen && (
          <div
            className={cn(
              'absolute top-full right-0 mt-1.5 z-50',
              'rounded-lg border-2 border-[#1a1a1a] bg-bg-primary',
              'shadow-hard overflow-hidden',
              'min-w-[200px] md:min-w-[180px]'
            )}
          >
            {menuLinks}
            <div className="border-t border-[#e5e5e5]" />
            <button
              type="button"
              onClick={() => { setIsOpen(false); router.push('/login') }}
              className={cn(
                'w-full px-3 text-left',
                'flex items-center gap-2',
                isDesktop ? 'py-2 text-xs' : 'py-3 text-sm',
                'text-[#1a1a1a] font-body',
                'hover:bg-pink-baby transition-colors',
                'animate-slide-up'
              )}
              style={{ animationDelay: '40ms', animationFillMode: 'both' }}
            >
              <User size={isDesktop ? 12 : 14} className="text-[#999]" />
              Kirjaudu sisään
            </button>
          </div>
        )}
      </div>
    )
  }

  // Logged in — show avatar dropdown
  const displayName = user.user_metadata?.full_name
    || user.user_metadata?.name
    || user.email?.split('@')[0]
    || 'Käyttäjä'

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined
  const initials = getInitials(displayName)

  return (
    <div ref={menuRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Käyttäjävalikko"
        aria-expanded={isOpen}
        className={cn(
          'neo-press',
          'h-10 md:h-9 px-2 md:px-2 rounded-lg border-2 border-[#1a1a1a] bg-bg-primary',
          'shadow-hard-sm hover:bg-pink-baby transition-colors',
          'flex items-center gap-1.5',
          'cursor-pointer select-none'
        )}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="w-6 h-6 md:w-5 md:h-5 rounded-full border border-[#1a1a1a]"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-6 h-6 md:w-5 md:h-5 rounded-full border-2 border-[#1a1a1a] bg-pink-baby flex items-center justify-center">
            <span className="text-[10px] md:text-[9px] font-mono font-bold text-[#1a1a1a] leading-none">
              {initials}
            </span>
          </div>
        )}
        <ChevronDown
          size={isDesktop ? 11 : 14}
          className={cn('transition-transform text-[#1a1a1a]', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute top-full right-0 mt-1.5 z-50',
            'rounded-lg border-2 border-[#1a1a1a] bg-bg-primary',
            'shadow-hard overflow-hidden',
            'min-w-[200px] md:min-w-[180px]'
          )}
        >
          {/* User info */}
          <div className="px-3 py-2.5 border-b border-[#e5e5e5]">
            <p className="text-xs font-mono font-bold text-[#1a1a1a] truncate">{displayName}</p>
            {user.email && (
              <p className="text-[11px] text-[#999] font-body truncate">{user.email}</p>
            )}
          </div>

          {/* Navigation links */}
          {menuLinks}
          <button
            type="button"
            onClick={() => { setIsOpen(false); router.push('/asetukset') }}
            className={cn(
              'w-full px-3 text-left',
              'flex items-center gap-2',
              isDesktop ? 'py-2 text-xs' : 'py-3 text-sm',
              'text-[#1a1a1a] font-body',
              'hover:bg-pink-baby transition-colors',
              'animate-slide-up'
            )}
            style={{ animationDelay: '20ms', animationFillMode: 'both' }}
          >
            <Settings size={isDesktop ? 12 : 14} className="text-[#999]" />
            Asetukset
          </button>
          <div className="border-t border-[#e5e5e5]" />

          {/* Sign out */}
          <button
            type="button"
            onClick={async () => {
              setIsOpen(false)
              await signOut()
              router.refresh()
            }}
            className={cn(
              'w-full px-3 text-left',
              'flex items-center gap-2',
              isDesktop ? 'py-2 text-xs' : 'py-3 text-sm',
              'text-[#1a1a1a] font-body',
              'hover:bg-pink-baby transition-colors',
              'animate-slide-up'
            )}
            style={{ animationDelay: '40ms', animationFillMode: 'both' }}
          >
            <LogOut size={isDesktop ? 12 : 14} className="text-[#999]" />
            Kirjaudu ulos
          </button>
        </div>
      )}
    </div>
  )
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
