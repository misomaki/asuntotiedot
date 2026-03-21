import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function check() {
  // Find buildings near Selininranta, Pirkkala
  // Selininranta is near Pyhäjärvi lake, coordinates roughly 61.46°N, 23.65°E
  // Search by area
  const { data: areas } = await supabase
    .from('areas')
    .select('id, name, area_code')
    .eq('municipality', 'Pirkkala')

  console.log('Pirkkala areas:', areas?.map(a => `${a.area_code} ${a.name}`))

  // Get ALL buildings in Killo (33950) area near water
  const killoArea = areas?.find(a => a.area_code === '33950')

  if (killoArea) {
    const { data: buildings } = await supabase
      .from('buildings')
      .select('id, construction_year, min_distance_to_water_m, estimated_price_per_sqm, floor_count, building_type, area_id')
      .eq('area_id', killoArea.id)
      .lte('min_distance_to_water_m', 50)
      .gte('construction_year', 2010)
      .lte('construction_year', 2015)
      .limit(10)

    console.log(`\nKillo waterfront buildings (2010-2015, ≤50m):`)
    for (const b of (buildings || [])) {
      console.log(`  id=${b.id.substring(0,8)}... year=${b.construction_year} water=${b.min_distance_to_water_m}m price=${b.estimated_price_per_sqm} floors=${b.floor_count} type=${b.building_type}`)
    }
  }

  // Also check: are there buildings in Pirkkala WITHOUT water distance?
  if (killoArea) {
    const { data: noWater } = await supabase
      .from('buildings')
      .select('id')
      .eq('area_id', killoArea.id)
      .is('min_distance_to_water_m', null)
      .limit(5)

    console.log(`\nKillo buildings WITHOUT water distance: ${noWater?.length || 0}`)
  }

  // Check globally: any buildings still missing water distance?
  // Use sampling approach since count times out
  let cursor = '00000000-0000-0000-0000-000000000000'
  let missingCount = 0
  let scanned = 0

  for (let page = 0; page < 10; page++) {
    const { data: rows } = await supabase
      .from('buildings')
      .select('id, min_distance_to_water_m')
      .gt('id', cursor)
      .order('id', { ascending: true })
      .limit(1000)

    if (!rows || rows.length === 0) break
    scanned += rows.length
    for (const r of rows) {
      if (r.min_distance_to_water_m === null) missingCount++
    }
    cursor = rows[rows.length - 1].id
  }

  console.log(`\nSample check (first ${scanned} buildings): ${missingCount} missing water distance`)

  // Also check the frontend data provider path
  // When user clicks a building, getBuildingDetails fetches min_distance_to_water_m
  // Let's check what the API would return for a Killo building
  if (killoArea) {
    const { data: sample } = await supabase
      .from('buildings')
      .select('id, min_distance_to_water_m, estimated_price_per_sqm, construction_year')
      .eq('area_id', killoArea.id)
      .lte('min_distance_to_water_m', 5)
      .limit(3)

    console.log('\nSample Killo buildings at ≤5m from water:')
    for (const b of (sample || [])) {
      console.log(`  ${b.id.substring(0,8)}... water=${b.min_distance_to_water_m}m price=${b.estimated_price_per_sqm} year=${b.construction_year}`)
    }
  }
}

check()
