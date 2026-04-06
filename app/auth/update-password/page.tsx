'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/app/lib/supabase/client'
import { LogoMark } from '@/app/components/brand/LogoMark'
import { cn } from '@/app/lib/utils'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)

  const [supabase] = useState(() => createSupabaseBrowserClient())

  // Supabase automatically picks up the recovery token from the URL hash
  // and establishes a session via onAuthStateChange
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      }
    })

    // Also check if there's already a session (e.g. page refresh)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Salasanat eivät täsmää.')
      return
    }

    if (password.length < 8) {
      setError('Salasanan tulee olla vähintään 8 merkkiä.')
      return
    }

    setLoading(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })
      if (updateError) throw updateError
      setSuccess(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Tuntematon virhe'
      if (message.includes('should be different')) {
        setError('Uuden salasanan on oltava eri kuin nykyinen.')
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }

  if (success) {
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
            <h1 className="font-brand text-2xl text-[#1a1a1a]">Salasana vaihdettu</h1>
            <p className="text-sm text-[#666] font-body">
              Salasanasi on vaihdettu onnistuneesti. Voit nyt kirjautua sisään uudella salasanallasi.
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

  if (!sessionReady) {
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
            <h1 className="font-brand text-2xl text-[#1a1a1a]">Ladataan...</h1>
            <p className="text-sm text-[#666] font-body">
              Vahvistetaan palautuslinkkiä. Jos sivu ei lataudu, linkki on ehkä vanhentunut.
            </p>
            <button
              type="button"
              onClick={() => router.push('/auth/reset-password')}
              className={cn(
                'neo-press mt-4',
                'h-10 px-6 rounded-lg border-2 border-[#1a1a1a] bg-bg-primary',
                'text-sm font-medium text-[#1a1a1a] shadow-hard-sm',
                'hover:bg-pink-baby transition-colors'
              )}
            >
              Pyydä uusi linkki
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
        <div className="flex flex-col items-center gap-3 mb-8">
          <LogoMark size={48} />
          <h1 className="font-brand text-2xl text-[#1a1a1a]">Vaihda salasana</h1>
          <p className="text-sm text-[#666] font-body text-center">
            Syötä uusi salasanasi. Vähintään 8 merkkiä.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="password" className="block text-xs font-mono font-bold text-[#1a1a1a] mb-1.5">
              Uusi salasana
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
          <div>
            <label htmlFor="confirm-password" className="block text-xs font-mono font-bold text-[#1a1a1a] mb-1.5">
              Vahvista salasana
            </label>
            <input
              id="confirm-password"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Syötä salasana uudelleen"
              className={cn(
                'w-full h-11 px-3 rounded-lg border-2 border-[#1a1a1a] bg-bg-primary',
                'text-sm font-body text-[#1a1a1a] placeholder:text-[#999]',
                'shadow-hard-sm focus:outline-none focus:ring-2 focus:ring-pink-baby'
              )}
            />
          </div>

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
            {loading ? 'Vaihdetaan...' : 'Vaihda salasana'}
          </button>
        </form>
      </div>
    </div>
  )
}
