/**
 * POST /api/feedback/price
 *
 * Persists a price-accuracy rating to the price_feedback table.
 * No authentication required — anonymous feedback is fine.
 * PostHog event is still fired client-side; this just adds DB persistence.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/app/lib/supabaseClient'

const VALID_RATINGS = ['accurate', 'too_high', 'too_low'] as const
type Rating = typeof VALID_RATINGS[number]

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      building_id?: string
      address?: string | null
      area_code?: string | null
      estimated_price_per_sqm?: number | null
      rating?: string
      comment?: string
    }

    const { building_id, address, area_code, estimated_price_per_sqm, rating, comment } = body

    if (!rating || !(VALID_RATINGS as readonly string[]).includes(rating)) {
      return NextResponse.json({ error: 'Invalid rating' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { error } = await supabase.from('price_feedback').insert({
      building_id: building_id ?? null,
      address: address ?? null,
      area_code: area_code ?? null,
      estimated_price_per_sqm: estimated_price_per_sqm ?? null,
      rating: rating as Rating,
      comment: comment?.trim().slice(0, 500) || null,
    })

    if (error) {
      console.error('price_feedback insert error:', error.message)
      return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 })
    }

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
}
