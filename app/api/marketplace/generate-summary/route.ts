/**
 * POST /api/marketplace/generate-summary
 *
 * Generates an AI-prefilled summary for seller listings or buyer interest contacts.
 * Uses building data + area stats to create a compelling Finnish description.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/app/lib/supabaseClient'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

const SELLER_SYSTEM_PROMPT = `Olet suomalainen asuntomarkkinoinnin ammattilainen. Kirjoita lyhyt, houkutteleva myynti-ilmoitusteksti annettujen rakennustietojen perusteella.

Säännöt:
- Kirjoita suomeksi, napakasti (max 3 lausetta)
- Mainitse sijainti, rakennusvuosi, talotyyppi ja erityiset edut (ranta, palvelut, hyvät yhteydet)
- Älä keksi tietoja joita ei ole annettu
- Käytä positiivista mutta rehellistä sävyä
- Älä mainitse hintaa (se tulee erikseen)
- Palauta VAIN ilmoitusteksti, ei JSON:ia tai muuta muotoilua`

const BUYER_SYSTEM_PROMPT = `Olet suomalainen asunnonvälittäjä. Kirjoita lyhyt hakuviesti joka kuvaa ostajan kiinnostusta tiettyyn rakennukseen.

Säännöt:
- Kirjoita suomeksi, kohteliaasti ja ytimekkäästi (max 2 lausetta)
- Mainitse mitä ostaja etsii (huoneluku, koko, sijainti)
- Mainitse mikä rakennuksessa kiinnostaa (sijainti, ikä, palvelut)
- Palauta VAIN hakuviesti, ei JSON:ia tai muuta muotoilua`

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'AI not configured (missing ANTHROPIC_API_KEY)' },
      { status: 503 }
    )
  }

  const { building_id, type, preferences } = await request.json() as {
    building_id: string
    type: 'seller' | 'buyer'
    preferences?: {
      room_count?: string
      min_sqm?: number
      max_sqm?: number
    }
  }

  if (!building_id || !type) {
    return NextResponse.json({ error: 'Missing building_id or type' }, { status: 400 })
  }

  // Fetch building data
  const supabase = getSupabaseAdmin()
  const { data: building, error: buildingError } = await supabase
    .from('buildings')
    .select(`
      address, building_type, construction_year, floor_count,
      footprint_area_sqm, estimated_price_per_sqm, apartment_count,
      energy_class, min_distance_to_water_m, is_leased_plot,
      min_distance_to_school_m, min_distance_to_kindergarten_m,
      min_distance_to_grocery_m, min_distance_to_transit_m,
      min_distance_to_park_m, min_distance_to_health_m,
      ryhti_main_purpose,
      areas!inner(area_code, name, municipality)
    `)
    .eq('id', building_id)
    .single()

  if (buildingError || !building) {
    return NextResponse.json({ error: 'Building not found' }, { status: 404 })
  }

  const areas = building.areas as unknown as Record<string, string>

  // Build context string from building data
  const facts: string[] = []
  if (building.address) facts.push(`Osoite: ${building.address}`)
  facts.push(`Alue: ${areas?.name ?? ''}, ${areas?.municipality ?? ''}`)
  if (building.construction_year) facts.push(`Rakennusvuosi: ${building.construction_year}`)
  if (building.ryhti_main_purpose) facts.push(`Käyttötarkoitus: ${building.ryhti_main_purpose}`)
  if (building.building_type) facts.push(`Tyyppi: ${building.building_type}`)
  if (building.floor_count) facts.push(`Kerroksia: ${building.floor_count}`)
  if (building.apartment_count) facts.push(`Asuntoja: ${building.apartment_count}`)
  if (building.footprint_area_sqm) facts.push(`Pohja-ala: ${Math.round(Number(building.footprint_area_sqm))} m²`)
  if (building.energy_class) facts.push(`Energialuokka: ${building.energy_class}`)
  if (building.is_leased_plot != null) facts.push(`Tontti: ${building.is_leased_plot ? 'vuokratontti' : 'oma tontti'}`)
  if (building.estimated_price_per_sqm) facts.push(`Hinta-arvio: ${Math.round(Number(building.estimated_price_per_sqm))} €/m²`)

  // Amenity distances
  const amenities: string[] = []
  if (building.min_distance_to_water_m != null && Number(building.min_distance_to_water_m) < 500) {
    amenities.push(`ranta ${Math.round(Number(building.min_distance_to_water_m))}m`)
  }
  if (building.min_distance_to_transit_m != null && Number(building.min_distance_to_transit_m) < 500) {
    amenities.push(`joukkoliikenne ${Math.round(Number(building.min_distance_to_transit_m))}m`)
  }
  if (building.min_distance_to_school_m != null && Number(building.min_distance_to_school_m) < 500) {
    amenities.push(`koulu ${Math.round(Number(building.min_distance_to_school_m))}m`)
  }
  if (building.min_distance_to_grocery_m != null && Number(building.min_distance_to_grocery_m) < 300) {
    amenities.push(`kauppa ${Math.round(Number(building.min_distance_to_grocery_m))}m`)
  }
  if (building.min_distance_to_park_m != null && Number(building.min_distance_to_park_m) < 200) {
    amenities.push(`puisto ${Math.round(Number(building.min_distance_to_park_m))}m`)
  }
  if (amenities.length > 0) {
    facts.push(`Lähipalvelut: ${amenities.join(', ')}`)
  }

  let userMessage: string

  if (type === 'seller') {
    userMessage = `Kirjoita myynti-ilmoitusteksti seuraavien tietojen perusteella:\n\n${facts.join('\n')}`
  } else {
    const prefParts: string[] = []
    if (preferences?.room_count) prefParts.push(`Huoneluku: ${preferences.room_count}`)
    if (preferences?.min_sqm != null || preferences?.max_sqm != null) {
      const range = preferences.min_sqm != null && preferences.max_sqm != null
        ? `${preferences.min_sqm}–${preferences.max_sqm} m²`
        : preferences.min_sqm != null ? `> ${preferences.min_sqm} m²` : `< ${preferences.max_sqm} m²`
      prefParts.push(`Toivottu koko: ${range}`)
    }
    userMessage = `Kirjoita lyhyt hakuviesti. Ostaja on kiinnostunut tästä rakennuksesta:\n\n${facts.join('\n')}${prefParts.length > 0 ? `\n\nOstajan toiveet:\n${prefParts.join('\n')}` : ''}`
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
        max_tokens: 300,
        system: type === 'seller' ? SELLER_SYSTEM_PROMPT : BUYER_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Anthropic API error:', response.status, errText)
      return NextResponse.json({ error: 'AI generation failed' }, { status: 502 })
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>
    }

    const summary = data.content.find(c => c.type === 'text')?.text?.trim() ?? ''

    return NextResponse.json({ summary })
  } catch (err) {
    console.error('AI summary error:', err)
    return NextResponse.json({ error: 'AI generation failed' }, { status: 500 })
  }
}
