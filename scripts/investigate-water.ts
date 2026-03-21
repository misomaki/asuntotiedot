import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function investigate() {
  // 1. Find Pirkkala postal codes
  const { data: pirkAreas } = await supabase
    .from('areas')
    .select('id, name, area_code, municipality')
    .eq('municipality', 'Pirkkala')

  if (!pirkAreas || pirkAreas.length === 0) {
    // Try by postal code prefix
    const { data: areas2 } = await supabase
      .from('areas')
      .select('id, name, area_code, municipality')
      .like('area_code', '337%')
    console.log('Areas with 337xx:', areas2)
  } else {
    console.log('Pirkkala areas:', pirkAreas.map(a => `${a.area_code} ${a.name}`))
  }

  // 2. Find waterfront buildings in Pirkkala area (2010-2015)
  const areaIds = (pirkAreas || []).map(a => a.id)

  const { data: buildings } = await supabase
    .from('buildings')
    .select('id, construction_year, floor_count, min_distance_to_water_m, estimated_price_per_sqm, area_id, apartment_count, footprint_area_sqm, building_type')
    .in('area_id', areaIds)
    .lte('min_distance_to_water_m', 10)
    .gte('construction_year', 2010)
    .lte('construction_year', 2015)
    .limit(20)

  console.log('\nWaterfront buildings in Pirkkala (2010-2015, ≤10m water):')
  for (const b of (buildings || [])) {
    const area = pirkAreas?.find(a => a.id === b.area_id)
    console.log(`  ${area?.name} (${area?.area_code}): year=${b.construction_year}, water=${b.min_distance_to_water_m}m, price=${b.estimated_price_per_sqm}€/m², floors=${b.floor_count}, apts=${b.apartment_count}, type=${b.building_type}`)
  }

  // 3. Get base price for the area
  if (pirkAreas && pirkAreas.length > 0) {
    for (const area of pirkAreas) {
      const { data: prices } = await supabase
        .from('price_estimates')
        .select('year, property_type, price_per_sqm_avg, transaction_count')
        .eq('area_id', area.id)
        .in('year', [2024, 2025])
        .order('year', { ascending: false })

      if (prices && prices.length > 0) {
        console.log(`\nPrices for ${area.name} (${area.area_code}):`)
        for (const p of prices) {
          console.log(`  ${p.year} ${p.property_type}: ${p.price_per_sqm_avg}€/m² (n=${p.transaction_count})`)
        }
      }
    }
  }

  // 4. Check neighborhood factors for Pirkkala
  if (pirkAreas && pirkAreas.length > 0) {
    const { data: nbhd } = await supabase
      .from('neighborhood_factors')
      .select('area_id, property_type, factor, sample_count, confidence')
      .in('area_id', areaIds)

    if (nbhd && nbhd.length > 0) {
      console.log('\nNeighborhood factors:')
      for (const n of nbhd) {
        const area = pirkAreas?.find(a => a.id === n.area_id)
        console.log(`  ${area?.name}: ${n.property_type} factor=${n.factor} (n=${n.sample_count}, ${n.confidence})`)
      }
    } else {
      console.log('\nNo neighborhood factors for Pirkkala areas')
    }
  }

  // 5. Check municipality-level fallback
  const { data: munPrices } = await supabase
    .from('price_estimates')
    .select('year, property_type, price_per_sqm_avg')
    .eq('area_id', areaIds[0])
    .eq('year', 2025)
  console.log('\nMunicipality prices check:', munPrices)

  // 6. What does compute_building_price return for this building?
  if (buildings && buildings.length > 0) {
    const b = buildings[0]
    const { data: computed } = await supabase.rpc('compute_building_price', {
      p_building_id: b.id
    })
    console.log('\nSQL compute_building_price result:', computed)
  }

  // 7. Show the actual factors for a 2012 building at 1m water in Pirkkala
  console.log('\n=== FACTOR BREAKDOWN ===')
  console.log('Water factor (1m): 1.15 (max)')
  console.log('Age factor (2012, ref 2026): age=14 → 1.10')
  console.log('No premium dampening (age_factor 1.10 > 0.85)')
  console.log('Question: Is the BASE PRICE too low for Pirkkala?')
}

investigate()
