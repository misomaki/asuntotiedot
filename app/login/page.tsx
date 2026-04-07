'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/app/lib/supabase/client'
import Link from 'next/link'
import { LogoMark } from '@/app/components/brand/LogoMark'
import { cn } from '@/app/lib/utils'

type AuthMode = 'login' | 'signup'

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const authError = searchParams.get('error')

  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(
    authError === 'auth' ? 'Kirjautuminen epäonnistui. Yritä uudelleen.' : null
  )
  const [loading, setLoading] = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(false)

  const [supabase] = useState(() => createSupabaseBrowserClient())

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (mode === 'signup') {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })
        if (signUpError) throw signUpError

        // If user was auto-confirmed (no email confirmation required), log in directly
        if (signUpData.session) {
          router.push('/')
          router.refresh()
          return
        }

        // Email confirmation is required — show the "check your email" screen
        setConfirmationSent(true)
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) throw signInError
        router.push('/')
        router.refresh()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Tuntematon virhe'
      if (message.includes('Invalid login credentials')) {
        setError('Virheellinen sähköposti tai salasana.')
      } else if (message.includes('User already registered')) {
        setError('Tili on jo olemassa. Kirjaudu sisään.')
      } else if (message.includes('Password should be at least')) {
        setError('Salasanan tulee olla vähintään 8 merkkiä.')
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError(null)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (oauthError) {
      setError(oauthError.message)
    }
  }

  if (confirmationSent) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
        <div
          className={cn(
            'w-full max-w-sm bg-bg-primary border-2 border-[#1a1a1a] rounded-xl p-8',
            'shadow-hard'
          )}
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <LogoMark size={48} />
            <h1 className="font-brand text-2xl text-[#1a1a1a]">Tarkista sähköpostisi</h1>
            <p className="text-sm text-[#666] font-body">
              Lähetimme vahvistuslinkin osoitteeseen <strong className="text-[#1a1a1a]">{email}</strong>.
              Klikkaa linkkiä viimeistelläksesi rekisteröitymisen.
            </p>
            <button
              type="button"
              onClick={() => router.push('/')}
              className={cn(
                'neo-press mt-4',
                'h-10 px-6 rounded-lg border-2 border-[#1a1a1a] bg-bg-primary',
                'text-sm font-medium text-[#1a1a1a] shadow-hard-sm',
                'hover:bg-pink-baby transition-colors'
              )}
            >
              Takaisin kartalle
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <div
        className={cn(
          'w-full max-w-sm bg-bg-primary border-2 border-[#1a1a1a] rounded-xl p-8',
          'shadow-hard'
        )}
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <button type="button" onClick={() => router.push('/')} className="neo-lift">
            <LogoMark size={48} />
          </button>
          <h1 className="font-brand text-2xl text-[#1a1a1a]">
            {mode === 'login' ? 'Kirjaudu sisään' : 'Luo tili'}
          </h1>
          <p className="text-sm text-[#666] font-body">
            {mode === 'login'
              ? 'Kirjaudu Neliöt-tilillesi'
              : 'Luo tili päästäksesi kaikkiin ominaisuuksiin'}
          </p>
        </div>

        {/* Google login */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          className={cn(
            'neo-press w-full',
            'h-11 rounded-lg border-2 border-[#1a1a1a] bg-bg-primary',
            'text-sm font-medium text-[#1a1a1a] shadow-hard-sm',
            'hover:bg-[#f0efed] transition-colors',
            'flex items-center justify-center gap-3'
          )}
        >
          <GoogleIcon />
          Jatka Google-tilillä
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-[#e5e5e5]" />
          <span className="text-xs text-[#999] font-mono uppercase">tai</span>
          <div className="flex-1 h-px bg-[#e5e5e5]" />
        </div>

        {/* Email form */}
        <form onSubmit={handleEmailAuth} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="block text-xs font-mono font-bold text-[#1a1a1a] mb-1.5">
              Sähköposti
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nimi@esimerkki.fi"
              className={cn(
                'w-full h-11 px-3 rounded-lg border-2 border-[#1a1a1a] bg-bg-primary',
                'text-sm font-body text-[#1a1a1a] placeholder:text-[#999]',
                'shadow-hard-sm focus:outline-none focus:ring-2 focus:ring-pink-baby'
              )}
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-mono font-bold text-[#1a1a1a] mb-1.5">
              Salasana
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Vähintään 8 merkkiä"
              className={cn(
                'w-full h-11 px-3 rounded-lg border-2 border-[#1a1a1a] bg-bg-primary',
                'text-sm font-body text-[#1a1a1a] placeholder:text-[#999]',
                'shadow-hard-sm focus:outline-none focus:ring-2 focus:ring-pink-baby'
              )}
            />
          </div>

          {mode === 'login' && (
            <div className="text-right -mt-2">
              <button
                type="button"
                onClick={() => router.push('/auth/reset-password')}
                className="text-xs text-[#666] font-body underline underline-offset-2 hover:text-[#1a1a1a] transition-colors"
              >
                Unohditko salasanasi?
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-lg border-2 border-red-400 bg-red-50 px-3 py-2 text-sm text-red-700 font-body">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cn(
              'neo-press w-full',
              'h-11 rounded-lg border-2 border-[#1a1a1a]',
              'text-sm font-bold text-[#1a1a1a] shadow-hard-sm',
              'transition-colors',
              loading ? 'bg-[#e5e5e5] cursor-not-allowed' : 'bg-pink-baby hover:bg-pink-pale'
            )}
          >
            {loading
              ? 'Ladataan...'
              : mode === 'login'
                ? 'Kirjaudu'
                : 'Luo tili'}
          </button>
        </form>

        {/* Toggle mode */}
        <p className="mt-6 text-center text-sm text-[#666] font-body">
          {mode === 'login' ? (
            <>
              Ei vielä tiliä?{' '}
              <button
                type="button"
                onClick={() => { setMode('signup'); setError(null) }}
                className="font-bold text-[#1a1a1a] underline underline-offset-2 hover:text-pink decoration-pink-baby"
              >
                Luo tili
              </button>
            </>
          ) : (
            <>
              Onko sinulla jo tili?{' '}
              <button
                type="button"
                onClick={() => { setMode('login'); setError(null) }}
                className="font-bold text-[#1a1a1a] underline underline-offset-2 hover:text-pink decoration-pink-baby"
              >
                Kirjaudu
              </button>
            </>
          )}
        </p>

        {mode === 'signup' && (
          <p className="mt-4 text-center text-[11px] text-[#999] font-body leading-relaxed">
            Luomalla tilin hyväksyt{' '}
            <Link href="/kayttoehdot" className="underline underline-offset-2 hover:text-[#666]">käyttöehdot</Link>
            {' '}ja{' '}
            <Link href="/tietosuoja" className="underline underline-offset-2 hover:text-[#666]">tietosuojaselosteen</Link>.
          </p>
        )}
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}
