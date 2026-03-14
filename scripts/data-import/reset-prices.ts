/**
 * Reset building estimation_year in batches to force recomputation.
 */
import { supabase } from './lib/supabaseAdmin'

async function main() {
  let total = 0
  const BATCH = 500

  while (true) {
    const { data: batch, error: fetchErr } = await supabase
      .from('buildings')
      .select('id')
      .not('estimation_year', 'is', null)
      .limit(BATCH)

    if (fetchErr) {
      console.error('Fetch error:', fetchErr.message)
      break
    }
    if (!batch || batch.length === 0) {
      console.log(`Done! Total reset: ${total}`)
      break
    }

    const ids = batch.map(b => b.id)
    const { error: upErr } = await supabase
      .from('buildings')
      .update({ estimation_year: null })
      .in('id', ids)

    if (upErr) {
      console.error('Update error:', upErr.message)
      break
    }
    total += ids.length
    process.stdout.write(`Reset ${total} buildings...\r`)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
