import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/app/lib/supabaseClient'

/**
 * GET /api/tiles/buildings/:z/:x/:y
 *
 * Serves Mapbox Vector Tiles (MVT) for building outlines.
 * Calls the PostGIS `get_buildings_mvt()` RPC which returns
 * base64-encoded MVT binary. We decode and return raw binary
 * with aggressive cache headers for Vercel CDN edge caching.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ z: string; x: string; y: string }> }
) {
  const { z, x, y } = await params
  const zi = parseInt(z, 10)
  const xi = parseInt(x, 10)
  const yi = parseInt(y, 10)

  // Validate tile coordinates
  if (isNaN(zi) || isNaN(xi) || isNaN(yi) || zi < 0 || zi > 22) {
    return new NextResponse(null, { status: 400 })
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase.rpc('get_buildings_mvt', {
      z: zi,
      x: xi,
      y: yi,
    })

    if (error) {
      console.error('MVT tile error:', error.message)
      return new NextResponse(null, { status: 500 })
    }

    // RPC returns base64-encoded text from encode(bytea, 'base64')
    const buffer =
      data && typeof data === 'string' && data.length > 0
        ? Buffer.from(data, 'base64')
        : Buffer.alloc(0)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.mapbox-vector-tile',
        // 24h browser + CDN cache, 7-day stale-while-revalidate
        'Cache-Control':
          'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        // Prevent gzip/brotli (MVT is already compact protobuf)
        'Content-Encoding': 'identity',
      },
    })
  } catch (err) {
    console.error('MVT tile unexpected error:', err)
    return new NextResponse(null, { status: 500 })
  }
}
