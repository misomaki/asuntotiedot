'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/app/lib/supabase/client'
import { LogoMark } from '@/app/components/brand/LogoMark'
import { cn } from '@/app/lib/utils'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [supabase] = useState(() => createSupabaseBrowserClient())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      })
      if (resetError) throw resetError
      setSent(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Tuntematon virhe'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
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
              Jos osoitteella <strong className="text-[#1a1a1a]">{email}</strong> on tili,
              lähetimme sinulle linkin salasanan vaihtamiseen.
            </p>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className={cn(
                'neo-press mt-4',
                'h-10 px-6 rounded-lg border-2 border-[#1a1a1a] bg-bg-primary',
                'text-sm font-medium text-[#1a1a1a] shadow-hard-sm',
                'hover:bg-pink-baby transition-colors'
              )}
            >
              Takaisin kirjautumiseen
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
          <button type="button" onClick={() => router.push('/')} className="neo-lift">
            <LogoMark size={48} />
          </button>
          <h1 className="font-brand text-2xl text-[#1a1a1a]">Unohtuiko salasana?</h1>
          <p className="text-sm text-[#666] font-body text-center">
            Syötä sähköpostiosoitteesi, niin lähetämme sinulle linkin salasanan vaihtamiseen.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            {loading ? 'Lähetetään...' : 'Lähetä palautuslinkki'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#666] font-body">
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="font-bold text-[#1a1a1a] underline underline-offset-2 hover:text-pink decoration-pink-baby"
          >
            Takaisin kirjautumiseen
          </button>
        </p>
      </div>
    </div>
  )
}
