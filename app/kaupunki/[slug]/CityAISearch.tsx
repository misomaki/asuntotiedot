'use client'

import { useState, useCallback } from 'react'
import { Sparkles, Search, Loader2, MapPin, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { formatNumber } from '@/app/lib/formatters'

interface SearchResult {
  id: string
  address: string | null
  area_name: string | null
  area_code: string | null
  estimated_price_per_sqm: number | null
  construction_year: number | null
  floor_count: number | null
  property_type: string | null
}

interface Props {
  cityName: string
  areaCodes: string[]
}

const PLACEHOLDER_QUERIES: Record<string, string[]> = {
  Helsinki: [
    'Moderni kerrostalo meren lähellä alle 5000 €/m²',
    'Rivitalo hyvien liikenneyhteyksien varrella',
    'Uudiskohde Kalliossa tai Sörnäisissä',
  ],
  Tampere: [
    'Kerrostalo Tampereen keskustassa alle 4000 €/m²',
    'Omakotitalo Hervannassa tai Lentävänniemessä',
    'Uusi rivitalo lähellä koulua',
  ],
  default: [
    'Kerrostalo keskustassa alle 3500 €/m²',
    'Omakotitalo veden lähellä',
    'Uudiskohde hyvällä sijainnilla',
  ],
}

export function CityAISearch({ cityName, areaCodes }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const placeholders = PLACEHOLDER_QUERIES[cityName] ?? PLACEHOLDER_QUERIES.default

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return

    setLoading(true)
    setError(null)
    setSearched(true)

    try {
      // Step 1: Parse natural language → filters
      const parseRes = await fetch('/api/marketplace/ai-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `${searchQuery} ${cityName}` }),
      })

      if (!parseRes.ok) throw new Error('Haku epäonnistui')

      const { filters } = await parseRes.json()

      // Ensure search is scoped to this city
      if (!filters.area_codes || filters.area_codes.length === 0) {
        filters.area_codes = areaCodes
      }

      // Step 2: Search buildings
      const searchRes = await fetch('/api/marketplace/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters, limit: 20 }),
      })

      if (!searchRes.ok) throw new Error('Haku epäonnistui')

      const data = await searchRes.json()
      setResults(data.buildings ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setError('Haku epäonnistui. Yritä uudelleen.')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [cityName, areaCodes])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSearch(query)
  }

  return (
    <div>
      {/* Search input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Sparkles size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#ff90e8]" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`esim. "${placeholders[0]}"`}
            className="w-full pl-10 pr-4 py-3 border-2 border-[#1a1a1a] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#ff90e8]/50 font-body"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="neo-press px-5 py-3 bg-[#1a1a1a] text-white font-display font-bold text-sm rounded-xl border-2 border-[#1a1a1a] hover:bg-pink transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          Hae
        </button>
      </form>

      {/* Suggestion chips */}
      {!searched && (
        <div className="flex flex-wrap gap-2 mt-3">
          {placeholders.map(p => (
            <button
              key={p}
              onClick={() => { setQuery(p); handleSearch(p) }}
              className="text-xs px-3 py-1.5 border border-[#1a1a1a]/20 rounded-full hover:bg-white hover:border-[#1a1a1a]/40 transition-colors text-muted-foreground"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {error && (
        <p className="text-sm text-red-600 mt-3">{error}</p>
      )}

      {searched && !loading && results.length === 0 && !error && (
        <p className="text-sm text-muted-foreground mt-4">Ei tuloksia. Kokeile laajempia hakuehtoja.</p>
      )}

      {results.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground mb-2">
            {total != null && total > 20
              ? `Näytetään 20 / ${formatNumber(total)} tulosta`
              : `${results.length} tulosta`}
          </p>
          <div className="bg-white border-2 border-[#1a1a1a] rounded-xl overflow-hidden shadow-hard-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-[#1a1a1a]/10 bg-[#FFFBF5]">
                    <th className="text-left px-4 py-2.5 font-display font-bold text-xs text-muted-foreground uppercase tracking-wider">Osoite</th>
                    <th className="text-right px-4 py-2.5 font-display font-bold text-xs text-muted-foreground uppercase tracking-wider">\u20ac/m\u00b2</th>
                    <th className="text-right px-4 py-2.5 font-display font-bold text-xs text-muted-foreground uppercase tracking-wider max-md:hidden">Vuosi</th>
                    <th className="text-right px-4 py-2.5 font-display font-bold text-xs text-muted-foreground uppercase tracking-wider max-md:hidden">Kerroksia</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((b, i) => (
                    <tr key={b.id} className={`border-b border-[#1a1a1a]/5 ${i % 2 ? 'bg-[#FFFBF5]/50' : ''} hover:bg-[#fff5eb] transition-colors`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <MapPin size={12} className="text-muted-foreground shrink-0" />
                          <span className="text-[#1a1a1a] font-medium truncate max-w-[200px] md:max-w-none">
                            {b.address ?? b.area_name ?? 'Tuntematon'}
                          </span>
                        </div>
                        {b.area_name && b.address && (
                          <span className="text-xs text-muted-foreground ml-5">{b.area_name}</span>
                        )}
                      </td>
                      <td className="text-right px-4 py-2.5 font-mono font-medium">
                        {b.estimated_price_per_sqm ? formatNumber(Math.round(b.estimated_price_per_sqm)) : '\u2013'}
                      </td>
                      <td className="text-right px-4 py-2.5 font-mono max-md:hidden">
                        {b.construction_year ?? '\u2013'}
                      </td>
                      <td className="text-right px-4 py-2.5 font-mono max-md:hidden">
                        {b.floor_count ?? '\u2013'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="text-center mt-4">
            <Link
              href={`/?city=${cityName.toLowerCase()}`}
              className="text-sm text-[#1a1a1a] font-display font-bold hover:underline inline-flex items-center gap-1"
            >
              Näytä kaikki kartalla <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
