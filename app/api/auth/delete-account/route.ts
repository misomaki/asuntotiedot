/**
 * DELETE /api/auth/delete-account — Permanently delete user account and all data.
 *
 * Requires authenticated user. Uses service role to delete from auth.users,
 * which cascades to user_profiles, building_interests, and building_sell_intents.
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function DELETE() {
  // 1. Get the authenticated user via session cookies
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set(name, value, options)
            } catch {
              // Server component — ignore
            }
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Use admin client to delete the user from auth.users
  // CASCADE on foreign keys will delete user_profiles, building_interests, building_sell_intents
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id)

  if (error) {
    console.error('Account deletion error:', error)
    return NextResponse.json({ error: 'Tilin poistaminen epäonnistui' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
