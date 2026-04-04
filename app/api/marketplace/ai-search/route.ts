/**
 * POST /api/marketplace/ai-search
 *
 * Parses a natural language property search query into structured filters
 * using Claude Haiku. Returns filters + human-readable chips.
 */

import { NextRequest, NextResponse } from 'next/server'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

const SYSTEM_PROMPT = `Olet suomalainen asuntohaku-avustaja. Tehtäväsi on jäsentää luonnollisen kielen asuntohakukyselyt JSON-suodattimiksi.

Käytettävissä olevat suodattimet:
- municipality: kaupunki (esim. "Helsinki", "Tampere", "Turku", "Oulu", "Jyväskylä", "Kuopio", "Lahti")
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

Aluetuntemuksesi:
- "Kallio" = 00530, "Töölö" = 00100/00250, "Kamppi" = 00100, "Sörnäinen" = 00500
- "Kruununhaka" = 00170, "Punavuori" = 00120/00150, "Ullanlinna" = 00130/00140
- "Vallila" = 00510, "Hermanni" = 00580, "Pasila" = 00520
- "Myllypuro" = 00920, "Kontula" = 00940, "Vuosaari" = 00980/00990
- "Hervanta" (Tampere) = 33720, "Kaleva" (Tampere) = 33540
- Jos et tiedä postinumeroa, käytä municipality-kenttää

Sanastovinkit:
- "yksiö" = room_count "1", "kaksio" = "2", "kolmio" = "3", "neliö" (huoneet) = "4"
- "kerrostalo"/"kerros" = property_type "kerrostalo"
- "rivari"/"rivitalo" = "rivitalo", "omakotitalo"/"OKT" = "omakotitalo"
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
        system: SYSTEM_PROMPT,
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
