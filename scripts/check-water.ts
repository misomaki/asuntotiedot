import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function check() {
  const { count: total } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })

  const { count: withWater } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('min_distance_to_water_m', 'is', null)

  const { count: withoutWater } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .is('min_distance_to_water_m', null)

  const { count: withCentroid } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('centroid', 'is', null)

  const { count: waterBodies } = await supabase
    .from('water_bodies')
    .select('id', { count: 'exact', head: true })

  console.log(`Total buildings: ${total}`)
  console.log(`With water distance: ${withWater}`)
  console.log(`WITHOUT water distance: ${withoutWater}`)
  console.log(`With centroid: ${withCentroid}`)
  console.log(`Water bodies: ${waterBodies}`)
}

check()
