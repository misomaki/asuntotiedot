/**
 * POST /api/marketplace/ai-search
 *
 * Parses a natural language property search query into structured filters
 * using Claude Haiku. Returns filters + human-readable chips.
 *
 * Fetches all area names from the database so the AI can map any
 * Finnish neighborhood name to its postal code(s).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/app/lib/supabaseClient'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

// Cache area list in memory (module scope) — refreshed on cold start
let cachedAreaList: string | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Fetch all area names + codes from the database, grouped by name.
 * Returns a compact string like: "Kallio:00530, Töölö:00100/00250, ..."
 */
async function getAreaList(): Promise<string> {
  const now = Date.now()
  if (cachedAreaList && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedAreaList
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('areas')
    .select('area_code, name, municipality')
    .order('area_code')

  if (error || !data) {
    console.error('Failed to fetch areas for AI search:', error?.message)
    return cachedAreaList ?? ''
  }

  // Group area codes by name+municipality for compact representation
  // e.g. "Kallio (Helsinki):00530, Töölö (Helsinki):00100/00250"
  const byName = new Map<string, string[]>()
  for (const row of data) {
    const name = row.name as string
    const municipality = row.municipality as string
    const code = row.area_code as string
    const key = `${name} (${municipality})`
    const codes = byName.get(key) ?? []
    codes.push(code)
    byName.set(key, codes)
  }

  const parts: string[] = []
  for (const [name, codes] of byName) {
    parts.push(`${name}:${codes.join('/')}`)
  }

  cachedAreaList = parts.join(', ')
  cacheTimestamp = now
  return cachedAreaList
}

function buildSystemPrompt(areaList: string): string {
  return `Olet suomalainen asuntohaku-avustaja. Tehtäväsi on jäsentää luonnollisen kielen asuntohakukyselyt JSON-suodattimiksi.

Käytettävissä olevat suodattimet:
- municipality: kaupunki (esim. "Helsinki", "Tampere", "Turku", "Oulu", "Jyväskylä", "Kuopio", "Lahti", "Espoo", "Vantaa")
- area_codes: postinumeroalueet (array, esim. ["00100", "00500"])
- property_type: "kerrostalo" | "rivitalo" | "omakotitalo"
- room_count: "1" | "2" | "3" | "4" | "5+"
- min_sqm, max_sqm: pinta-ala neliömetreinä
- min_price_per_sqm, max_price_per_sqm: hinta €/m²
- min_construction_year, max_construction_year: rakennusvuosi
- max_distance_to_transit_m: etäisyys joukkoliikenteeseen (metriä)
- max_distance_to_school_m: etäisyys kouluun
- max_distance_to_kindergarten_m: etäisyys päiväkotiin
- max_distance_to_grocery_m: etäisyys kauppaan
- max_distance_to_park_m: etäisyys puistoon
- max_distance_to_water_m: etäisyys vesistöön/rantaan
- min_floor_count, max_floor_count: kerrosmäärä
- sort_by: "price_asc" | "price_desc" | "year_desc" | "year_asc"

Kaikki tunnetut alueet (nimi (kunta):postinumero):
${areaList}

TÄRKEÄÄ aluehaussa:
- Kun käyttäjä mainitsee alueen/kaupunginosan nimen, etsi AINA vastaava postinumero yllä olevasta listasta ja käytä area_codes-suodatinta
- Jos alueella on useita postinumeroita (esim. Töölö:00100/00250), lisää kaikki area_codes-listaan
- Jos nimeä ei löydy listasta, käytä municipality-suodatinta
- Käyttäjä voi kirjoittaa alueen nimen eri taivutusmuodoissa (esim. "Kalliossa" = "Kallio", "Pereellä" = "Pere", "Hervannassa" = "Hervanta")
- Huomioi myös osittaiset osumat: "Töölö" matchaa sekä "Etu-Töölö" että "Taka-Töölö"

Sanastovinkit:
- "yksiö"/"yksiöt" = room_count "1", "kaksio"/"kaksiot" = "2", "kolmio"/"kolmiot" = "3", "neliö"/"neliöt" (huoneet) = "4"
- "kerrostalo"/"kerrostalot"/"kerros" = property_type "kerrostalo"
- "rivitalo"/"rivitalot"/"rivari"/"rivarit" = property_type "rivitalo" (EI omakotitalo!)
- "omakotitalo"/"omakotitalot"/"OKT" = property_type "omakotitalo"
- TÄRKEÄÄ: "rivitalo" ja "omakotitalo" ovat ERI talotyyppejä. Älä sekoita niitä. Käytä TÄSMÄLLEEN käyttäjän pyytämää talotyyppiä.
- "uusi"/"uudiskohde" = min_construction_year 2015
- "vanha" = max_construction_year 1980
- "lähellä metroa/ratikkaa/bussia" = max_distance_to_transit_m 500
- "lähellä koulua" = max_distance_to_school_m 500
- "meren/järven lähellä"/"rannalla" = max_distance_to_water_m 200
- "edullinen"/"halpa" = sort_by "price_asc"
- "budjetti 300k" → max_price_per_sqm ≈ 300000 / estimated_sqm (käytä ~4500 as proxy)
- "budjetti Xk" tai "max Xk" → muunna €/m² käyttäen: yksiö ~30m², kaksio ~50m², kolmio ~70m², neliö ~90m²

Vastaa VAIN JSON-muodossa:
{
  "filters": { ...vain ei-tyhjät kentät... },
  "chips": ["Suomenkielinen lyhyt kuvaus per suodatin"]
}

chips-kenttä sisältää ihmisluettavat kuvaukset jokaisesta aktiivisesta suodattimesta, esim:
["Kolmio", "Kallio", "< 5 000 €/m²", "Lähellä metroa"]`
}

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set in environment variables')
    return NextResponse.json(
      { error: 'AI-haku ei ole käytettävissä (ANTHROPIC_API_KEY puuttuu)' },
      { status: 503 }
    )
  }

  const { query } = await request.json() as { query: string }

  if (!query || query.trim().length < 3) {
    return NextResponse.json(
      { error: 'Query too short' },
      { status: 400 }
    )
  }

  try {
    // Fetch area names from DB (cached in memory for 1 hour)
    const areaList = await getAreaList()
    const systemPrompt = buildSystemPrompt(areaList)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: query }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Anthropic API error:', response.status, errText)
      return NextResponse.json(
        { error: `Anthropic API error ${response.status}: ${errText.slice(0, 200)}` },
        { status: 502 }
      )
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>
    }

    const text = data.content.find(c => c.type === 'text')?.text ?? ''

    // Extract JSON from response (handle possible markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'Failed to parse AI response' },
        { status: 500 }
      )
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      filters: Record<string, unknown>
      chips: string[]
    }

    return NextResponse.json({
      filters: parsed.filters,
      chips: parsed.chips ?? [],
    })
  } catch (err) {
    console.error('AI search error:', err)
    return NextResponse.json(
      { error: 'AI search failed' },
      { status: 500 }
    )
  }
}
