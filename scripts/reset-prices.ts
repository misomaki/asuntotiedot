import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function resetPrices() {
  let total = 0
  while (true) {
    const { data: rows, error: selErr } = await supabase
      .from('buildings')
      .select('id')
      .not('estimation_year', 'is', null)
      .limit(1000)

    if (selErr) {
      console.error('Select error:', selErr.message)
      await new Promise(r => setTimeout(r, 3000))
      continue
    }
    if (!rows || rows.length === 0) {
      console.log('Done! Total reset:', total)
      break
    }

    const ids = rows.map(r => r.id)
    const { error: updErr } = await supabase
      .from('buildings')
      .update({ estimation_year: null, estimated_price_per_sqm: null })
      .in('id', ids)

    if (updErr) {
      console.error('Update error:', updErr.message)
      await new Promise(r => setTimeout(r, 3000))
      continue
    }
    total += ids.length
    if (total % 10000 === 0) console.log('Reset', total, 'buildings...')
  }
}

resetPrices()
