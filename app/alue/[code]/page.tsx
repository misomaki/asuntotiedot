import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getDataProvider } from '@/app/lib/dataProvider'
import {
  formatPricePerSqm,
  formatNumber,
  formatPercent,
  getPropertyTypeLabel,
} from '@/app/lib/formatters'
import type { AreaWithStats } from '@/app/types'
import { MapPin, ArrowRight, Users, GraduationCap, Briefcase, Home, TrendingUp } from 'lucide-react'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ code: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params
  const provider = getDataProvider()
  const area = await provider.getAreaDetails(code, 2024)

  if (!area) {
    return { title: 'Aluetta ei löytynyt – Neliöt' }
  }

  const primaryPrice = area.prices.find(p => p.property_type === 'kerrostalo')
    ?? area.prices.find(p => p.property_type === 'rivitalo')
    ?? area.prices[0]
  const priceStr = primaryPrice
    ? formatPricePerSqm(primaryPrice.price_per_sqm_median ?? primaryPrice.price_per_sqm_avg ?? 0)
    : null

  const title = `${area.name} (${area.area_code}) – Asuntohinnat ${priceStr ? priceStr + ' €/m²' : ''} | Neliöt`
  const description = `${area.name}, ${area.municipality}: asuntojen hinta-arviot, hintakehitys vuodesta 2018 lähtien, väestötiedot, tulotaso, koulutus ja palvelut. ${priceStr ? `Keskihinta ${priceStr} €/m².` : ''} Postinumero ${area.area_code}.`

  return {
    title,
    description,
    keywords: [
      `${area.area_code} asuntohinnat`,
      `${area.name} asuntohinnat`,
      `${area.municipality} asuntohinnat`,
      `${area.name} neliöhinta`,
      'asuntojen hinnat',
      'hinta-arvio',
    ],
    openGraph: {
      title,
      description,
      type: 'website',
      url: `https://neliot.vercel.app/alue/${area.area_code}`,
    },
    alternates: {
      canonical: `https://neliot.vercel.app/alue/${area.area_code}`,
    },
  }
}

// ---------------------------------------------------------------------------
// Page component (Server Component)
// ---------------------------------------------------------------------------

export default async function AreaPage({ params }: PageProps) {
  const { code } = await params
  const provider = getDataProvider()
  const area = await provider.getAreaDetails(code, 2024)

  if (!area) notFound()

  const primaryPrice = area.prices.find(p => p.property_type === 'kerrostalo')
    ?? area.prices.find(p => p.property_type === 'rivitalo')
    ?? area.prices[0]
  const primaryPriceValue = primaryPrice
    ? Math.round(primaryPrice.price_per_sqm_median ?? primaryPrice.price_per_sqm_avg ?? 0)
    : null

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      {/* Header */}
      <header className="border-b-2 border-[#1a1a1a] bg-[#FFFBF5]">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-display font-bold text-lg text-[#1a1a1a] hover:text-pink transition-colors">
            Neliöt
          </Link>
          <Link
            href={`/?area=${area.area_code}`}
            className="flex items-center gap-2 bg-pink text-white font-display font-bold text-sm px-4 py-2 rounded-full border-2 border-[#1a1a1a] shadow-hard-sm hover:translate-y-[1px] hover:shadow-none transition-all"
          >
            <MapPin size={16} />
            Avaa kartalla
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Hero */}
        <div>
          <p className="text-sm text-muted-foreground font-mono">{area.area_code}</p>
          <h1 className="text-3xl font-display font-black text-[#1a1a1a] mt-1">{area.name}</h1>
          <p className="text-lg text-muted-foreground mt-1">{area.municipality}</p>

          {primaryPriceValue != null && primaryPriceValue > 0 && (
            <div className="mt-4 inline-flex items-baseline gap-2 bg-pink-pale border-2 border-[#1a1a1a] rounded-xl px-5 py-3 shadow-hard-sm">
              <span className="text-3xl font-display font-black tabular-nums text-[#1a1a1a]">
                {formatNumber(primaryPriceValue)}
              </span>
              <span className="text-sm text-muted-foreground">€/m²</span>
            </div>
          )}
        </div>

        {/* Price by property type */}
        {area.prices.length > 0 && (
          <Section icon={<TrendingUp size={18} />} title="Hinnat talotyypeittäin">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(['kerrostalo', 'rivitalo', 'omakotitalo'] as const).map(type => {
                const est = area.prices.find(p => p.property_type === type)
                const price = est?.price_per_sqm_median ?? est?.price_per_sqm_avg ?? null
                return (
                  <div key={type} className="rounded-xl border-2 border-[#1a1a1a]/10 bg-white px-4 py-3">
                    <div className="text-xs text-muted-foreground">{getPropertyTypeLabel(type)}</div>
                    <div className="text-xl font-display font-bold tabular-nums mt-0.5">
                      {price ? `${formatNumber(Math.round(price))} €/m²` : '–'}
                    </div>
                    {est && est.transaction_count > 0 && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {formatNumber(est.transaction_count)} kauppaa
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {/* Demographics */}
        {area.demographics && (
          <Section icon={<Users size={18} />} title="Väestö">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Asukasluku" value={formatNumber(area.demographics.population)} />
              <StatCard label="Keski-ikä" value={`${area.demographics.median_age.toFixed(0)} v`} />
              <StatCard label="Alle 18 v" value={formatPercent(area.demographics.pct_under_18)} />
              <StatCard label="Yli 65 v" value={formatPercent(area.demographics.pct_over_65)} />
            </div>
          </Section>
        )}

        {/* Socioeconomics */}
        {area.socioeconomics && <SocioeconomicsBlock data={area.socioeconomics} />}

        {/* Housing */}
        {area.housing && <HousingBlock data={area.housing} />}

        {/* Employment */}
        {area.socioeconomics && area.employment && (
          <EmploymentBlock socio={area.socioeconomics} employment={area.employment} />
        )}

        {/* CTA */}
        <div className="text-center py-8">
          <Link
            href={`/?area=${area.area_code}`}
            className="inline-flex items-center gap-2 bg-[#1a1a1a] text-white font-display font-bold text-base px-6 py-3 rounded-full border-2 border-[#1a1a1a] hover:bg-pink hover:text-white transition-colors"
          >
            Tutki aluetta kartalla
            <ArrowRight size={18} />
          </Link>
          <p className="text-xs text-muted-foreground mt-3">
            Karttanäkymässä näet yksittäisten rakennusten hinta-arviot ja lähipalvelut
          </p>
        </div>

        {/* Structured Data (JSON-LD) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Place',
              name: `${area.name} (${area.area_code})`,
              address: {
                '@type': 'PostalAddress',
                postalCode: area.area_code,
                addressLocality: area.name,
                addressRegion: area.municipality,
                addressCountry: 'FI',
              },
              description: `Asuntohinnat alueella ${area.name}, ${area.municipality}. ${primaryPriceValue ? `Keskihinta ${formatNumber(primaryPriceValue)} €/m².` : ''}`,
            }),
          }}
        />
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-[#1a1a1a]/10 bg-[#FFFBF5] py-6 mt-8">
        <div className="max-w-4xl mx-auto px-4 text-xs text-muted-foreground">
          <p>Lähde: Tilastokeskus (CC BY 4.0) | Rakennukset: OpenStreetMap | Osoitteet: MML</p>
          <p className="mt-1">Hinta-arviot ovat suuntaa-antavia eivätkä korvaa virallista arviota.</p>
        </div>
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reusable components
// ---------------------------------------------------------------------------

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-sm font-display font-bold text-[#1a1a1a] uppercase tracking-wider">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border-2 border-[#1a1a1a]/10 bg-white px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-display font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  )
}

function PercentBarStatic({ segments }: { segments: Array<{ label: string; value: number; color: string }> }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1
  return (
    <div className="space-y-2">
      <div className="flex h-4 w-full overflow-hidden rounded-full">
        {segments.filter(s => s.value > 0).map(s => (
          <div
            key={s.label}
            className="h-full"
            style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {segments.filter(s => s.value > 0).map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-xs text-muted-foreground">
              {s.label} <span className="font-mono tabular-nums font-medium text-[#1a1a1a]">{formatPercent((s.value / total) * 100)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SocioeconomicsBlock({ data }: { data: NonNullable<AreaWithStats['socioeconomics']> }) {
  const hasIncome = data.income_units_total != null && data.income_units_total > 0
  const hasEducation = data.education_pop_18plus != null && data.education_pop_18plus > 0
  if (!hasIncome && !hasEducation) return null

  const universityPct = hasEducation && data.education_pop_18plus
    ? Math.round(((data.education_upper_tertiary ?? 0) + (data.education_university ?? 0)) / data.education_pop_18plus * 100)
    : null

  return (
    <>
      {hasIncome && (
        <Section icon={<TrendingUp size={18} />} title="Tulotaso">
          <PercentBarStatic segments={[
            { label: 'Korkea', value: data.income_high ?? 0, color: '#8cc8b8' },
            { label: 'Keski', value: data.income_medium ?? 0, color: '#e8d098' },
            { label: 'Matala', value: data.income_low ?? 0, color: '#d4a0b8' },
          ]} />
        </Section>
      )}
      {hasEducation && (
        <Section icon={<GraduationCap size={18} />} title="Koulutustaso">
          <PercentBarStatic segments={[
            { label: 'Korkeakoulu', value: (data.education_upper_tertiary ?? 0) + (data.education_university ?? 0) + (data.education_lower_tertiary ?? 0), color: '#8cc8b8' },
            { label: 'Ammatillinen', value: data.education_vocational ?? 0, color: '#e8d098' },
            { label: 'Toinen aste', value: data.education_secondary ?? 0, color: '#d4a0b8' },
            { label: 'Perusaste', value: data.education_basic ?? 0, color: '#c8c0b4' },
          ]} />
          {universityPct != null && (
            <p className="text-sm text-muted-foreground mt-2">
              Korkeakoulutettuja: <span className="font-mono font-bold text-[#1a1a1a]">{universityPct}%</span>
            </p>
          )}
        </Section>
      )}
    </>
  )
}

function HousingBlock({ data }: { data: NonNullable<AreaWithStats['housing']> }) {
  const hasTenure = data.dwellings_total != null && data.dwellings_total > 0
  if (!hasTenure) return null

  return (
    <Section icon={<Home size={18} />} title="Asuminen">
      <PercentBarStatic segments={[
        { label: 'Omistus', value: data.owner_occupied ?? 0, color: '#8cc8b8' },
        { label: 'Vuokra', value: data.rented ?? 0, color: '#d4a0b8' },
        { label: 'Muu', value: data.other_tenure ?? 0, color: '#c8c0b4' },
      ]} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
        {data.avg_apartment_size_sqm != null && data.avg_apartment_size_sqm > 0 && (
          <StatCard label="Keskim. asunto" value={`${Math.round(data.avg_apartment_size_sqm)} m²`} />
        )}
        {data.families_with_children != null && data.dwellings_total != null && data.dwellings_total > 0 && (
          <StatCard label="Lapsiperheitä" value={`${Math.round((data.families_with_children / data.dwellings_total) * 100)}%`} />
        )}
        {data.total_dwellings != null && (
          <StatCard label="Asuntoja" value={formatNumber(data.total_dwellings)} />
        )}
      </div>
    </Section>
  )
}

function EmploymentBlock({ socio, employment }: {
  socio: NonNullable<AreaWithStats['socioeconomics']>
  employment: NonNullable<AreaWithStats['employment']>
}) {
  if (socio.employed == null || socio.unemployed == null) return null
  const rate = ((socio.unemployed) / ((socio.employed) + (socio.unemployed)) * 100)

  const sectors = [
    { label: 'ICT', value: employment.sector_info_comm ?? 0 },
    { label: 'Terveys & sosiaali', value: employment.sector_health_social ?? 0 },
    { label: 'Kauppa', value: employment.sector_wholesale_retail ?? 0 },
    { label: 'Koulutus', value: employment.sector_education ?? 0 },
    { label: 'Julkishallinto', value: employment.sector_public_admin ?? 0 },
    { label: 'Teollisuus', value: employment.sector_manufacturing ?? 0 },
    { label: 'Rakentaminen', value: employment.sector_construction ?? 0 },
    { label: 'Asiantuntijapalvelut', value: employment.sector_professional ?? 0 },
  ].filter(s => s.value > 0).sort((a, b) => b.value - a.value).slice(0, 5)

  return (
    <Section icon={<Briefcase size={18} />} title="Työllistyminen">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Työllisiä" value={formatNumber(socio.employed)} />
        <StatCard label="Työttömyys" value={`${rate.toFixed(1)}%`} />
      </div>
      {sectors.length > 0 && (
        <div className="mt-3">
          <div className="text-xs text-muted-foreground mb-2">Suurimmat toimialat</div>
          <div className="flex flex-wrap gap-2">
            {sectors.map(s => (
              <span key={s.label} className="inline-flex items-center rounded-full bg-white border border-[#1a1a1a]/10 px-3 py-1 text-xs font-medium text-[#1a1a1a]">
                {s.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </Section>
  )
}
