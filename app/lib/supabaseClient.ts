import { createClient } from '@supabase/supabase-js'

/**
 * Server-side Supabase client using the service role key.
 * Use this in API routes and import scripts — bypasses RLS.
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
  if (!serviceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}

/**
 * Public Supabase client using the anon key.
 * Safe for client-side use.
 */
export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
  if (!anonKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable')
  return createClient(url, anonKey)
}
