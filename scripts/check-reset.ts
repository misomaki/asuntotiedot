import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function check() {
  const { count: withYear } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .not('estimation_year', 'is', null)

  const { count: withoutYear } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .is('estimation_year', null)

  console.log('With estimation_year:', withYear)
  console.log('Without estimation_year:', withoutYear)
}

check()
