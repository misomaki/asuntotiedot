/**
 * GET /api/areas/[id]
 *
 * Returns full statistics for a single postal-code area identified by its
 * area code (e.g. "00100").
 *
 * Query parameters:
 *   - year  (number, default 2024)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getDataProvider } from '@/app/lib/dataProvider'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const { searchParams } = request.nextUrl

    const yearParam = searchParams.get('year')
    const year = yearParam ? parseInt(yearParam, 10) : 2024

    if (Number.isNaN(year)) {
      return NextResponse.json(
        { error: 'Invalid year parameter' },
        { status: 400 },
      )
    }

    const provider = getDataProvider()
    const area = await provider.getAreaDetails(id, year)

    if (!area) {
      return NextResponse.json(
        { error: `Area not found: ${id}` },
        { status: 404 },
      )
    }

    return NextResponse.json(area)
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Internal server error'
    console.error(`GET /api/areas/[id] failed:`, message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
