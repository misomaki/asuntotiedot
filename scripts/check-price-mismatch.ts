import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // Find waterfront buildings in Pirkkala (2010-2015)
  const { data } = await supabase
    .from('buildings')
    .select('id, construction_year, floor_count, min_distance_to_water_m, estimated_price_per_sqm, estimation_year, area_id, apartment_count, energy_class, footprint_area_sqm, building_type')
    .lte('min_distance_to_water_m', 5)
    .gte('construction_year', 2010)
    .lte('construction_year', 2015)
    .not('estimated_price_per_sqm', 'is', null)
    .limit(50)

  for (const b of data || []) {
    const { data: area } = await supabase
      .from('areas')
      .select('name, area_code, municipality')
      .eq('id', b.area_id)
      .single()

    if (area && (area.municipality === 'Pirkkala' || (area.area_code ?? '').startsWith('337'))) {
      console.log('=== Pirkkala waterfront building ===')
      console.log('DB estimated_price_per_sqm:', b.estimated_price_per_sqm)
      console.log('estimation_year:', b.estimation_year)
      console.log('construction_year:', b.construction_year)
      console.log('min_distance_to_water_m:', b.min_distance_to_water_m)
      console.log('floor_count:', b.floor_count)
      console.log('building_type:', b.building_type)
      console.log('apartment_count:', b.apartment_count)
      console.log('energy_class:', b.energy_class)
      console.log('footprint_area_sqm:', b.footprint_area_sqm)
      console.log('area:', area.name, area.area_code)

      // Now recalculate with SQL function to compare
      const { data: recalc, error } = await supabase.rpc('compute_building_price', {
        p_area_id: b.area_id,
        p_construction_year: b.construction_year,
        p_distance_to_water: b.min_distance_to_water_m,
        p_floor_count: b.floor_count,
        p_building_type: b.building_type,
        p_year: 2024,
      })
      console.log('SQL recalculated price:', recalc, error ? `ERROR: ${error.message}` : '')
      console.log('Difference:', recalc != null ? `${recalc - b.estimated_price_per_sqm} (${((recalc - b.estimated_price_per_sqm) / b.estimated_price_per_sqm * 100).toFixed(1)}%)` : 'N/A')
      console.log()
    }
  }
}

main()
