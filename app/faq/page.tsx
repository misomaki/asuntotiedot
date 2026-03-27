import { Metadata } from 'next'
import Link from 'next/link'
import { MapPin, ChevronDown, Building2, TrendingUp, Layers, Database, Search, BarChart3 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Tietoa palvelusta – Neliöt',
  description: 'Neliöt on ilmainen karttapalvelu suomalaisten asuntojen hinta-arvioille. Tutustu palveluun, algoritmiin ja datalähtöisiin.',
  keywords: ['neliöt', 'hinta-arvio', 'FAQ', 'asuntohinnat', 'algoritmi', 'karttapalvelu'],
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const FEATURES = [
  {
    icon: Building2,
    title: '700 000+ rakennusta',
    description: 'Jokaisen asuinrakennuksen hinta-arvio seitsemässä suurimmassa kaupungissa.',
  },
  {
    icon: TrendingUp,
    title: 'Hintakehitys 2018–2024',
    description: 'Seuraa neliöhintojen muutosta vuosittain postinumeroalueittain.',
  },
  {
    icon: Layers,
    title: '6 hintatekijää',
    description: 'Ikä, sijainti, vesistö, kerrokset, koko ja aluekerroin – kaikki läpinäkyvästi eriteltyinä.',
  },
  {
    icon: Search,
    title: 'Hae osoitteella',
    description: 'Etsi mikä tahansa osoite, postinumero tai alue ja näe hinta-arvio välittömästi.',
  },
  {
    icon: BarChart3,
    title: 'Vertaile alueita',
    description: 'Valitse kaksi postinumeroaluetta ja vertaile hintoja, väestöä ja rakennuskantaa.',
  },
  {
    icon: Database,
    title: 'Avoin data',
    description: 'Tilastokeskus, OpenStreetMap ja SYKE Ryhti – kaikki lähteet avoimesti saatavilla.',
  },
]

const CITIES = [
  { name: 'Helsinki', sub: '+ Espoo, Vantaa, Kauniainen' },
  { name: 'Tampere', sub: '+ Pirkkala, Nokia, Ylöjärvi' },
  { name: 'Turku', sub: '+ Kaarina, Raisio, Naantali' },
  { name: 'Oulu', sub: null },
  { name: 'Jyväskylä', sub: null },
  { name: 'Kuopio', sub: null },
  { name: 'Lahti', sub: null },
]

interface FAQItem {
  question: string
  answer: string | string[]
}

const FAQ_SECTIONS: { title: string; items: FAQItem[] }[] = [
  {
    title: 'Hinta-arviot',
    items: [
      {
        question: 'Miten hinta-arviot lasketaan?',
        answer: [
          'Jokaisen rakennuksen hinta-arvio perustuu kuuteen tekijään:',
          '1. Perushinta — Tilastokeskuksen toteutuneet kauppahinnat (€/m²) postinumero- ja talotyyppitasolla.',
          '2. Ikäkerroin — Rakennusvuosi vaikuttaa hintaan U-käyrämäisesti: uudisrakentaminen ja yli 100-vuotiaat historialliset talot ovat arvostetumpia, kun taas 1960–80-luvun elementtirakentaminen on edullisinta.',
          '3. Vesistökerroin — Etäisyys lähimpään järveen (>1 ha) tai mereen nostaa hintaa jopa 35 %.',
          '4. Kerroskerroin — Esimerkiksi yksikerroksisissa rivitaloissa ja korkeissa kerrostaloissa on pieni preemio.',
          '5. Kokokerroin — Pienemmät kerrostalot (alle 10 asuntoa) ovat tyypillisesti arvokkaampia per neliö.',
          '6. Aluekerroin — Alueen toteutunut hintataso suhteessa perushintoihin.',
        ],
      },
      {
        question: 'Kuinka tarkkoja hinta-arviot ovat?',
        answer: [
          'Hinta-arviot on validoitu vertaamalla niitä toteutuneisiin markkinahintoihin. Keskimääräinen poikkeama on noin 19 %.',
          'Arvio ei huomioi remonttitasoa, energiatodistusta (data ei vielä saatavilla) eikä yksittäisen asunnon ominaisuuksia — kyseessä on rakennustason arvio.',
        ],
      },
      {
        question: 'Miksi hinta-arvio puuttuu joiltain rakennuksilta?',
        answer: 'Hinta-arvio lasketaan vain asuinrakennuksille. Koulut, kaupat, teollisuusrakennukset yms. on luokiteltu ei-asuinrakennuksiksi eikä niille näytetä hinta-arviota. Joissakin tapauksissa rakennukselta puuttuu tarvittava lähtödata (esim. postinumeroalueen hintatieto).',
      },
      {
        question: 'Mikä on "aluekerroin"?',
        answer: 'Aluekerroin kuvaa, kuinka paljon tietyn postinumeroalueen todelliset markkinahinnat poikkeavat Tilastokeskuksen perushinnasta. Esimerkiksi kerroin 1.30 tarkoittaa, että alueen hinnat ovat 30 % perushinnan yläpuolella.',
      },
    ],
  },
  {
    title: 'Data ja lähteet',
    items: [
      {
        question: 'Mistä data tulee?',
        answer: [
          'Tilastokeskus (Paavo & StatFin) — Postinumeroalueiden rajat, väestötiedot ja asuntojen kauppahinnat. CC BY 4.0.',
          'OpenStreetMap — Rakennusten geometriat (pohjapiirros kartalla).',
          'SYKE Ryhti-rekisteri — Rakennusvuosi, kerrosluku, asuntomäärä ja käyttötarkoitus. CC BY 4.0.',
          'Maanmittauslaitos (MML) — Osoitetiedot rakennuksille.',
          'Toteutuneet markkinahinnat — Aluekertoimien laskentaan ja validointiin.',
        ],
      },
      {
        question: 'Kuinka usein data päivittyy?',
        answer: 'Tilastokeskuksen hintatiedot päivittyvät neljännesvuosittain. Rakennusdata (OSM, Ryhti) päivitetään tarvittaessa. Aluekertoimet lasketaan uudelleen kun uutta markkinadataa on saatavilla.',
      },
      {
        question: 'Onko palvelu ilmainen?',
        answer: 'Kyllä, Neliöt on täysin ilmainen.',
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      {/* Header */}
      <header className="border-b-2 border-[#1a1a1a] bg-[#FFFBF5]">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-display font-bold text-lg text-[#1a1a1a] hover:text-pink transition-colors">
            Neliöt
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex items-center gap-2 bg-[#1a1a1a] text-white font-display font-bold text-sm px-4 py-2 rounded-full border-2 border-[#1a1a1a] hover:bg-pink transition-colors"
            >
              <MapPin size={16} />
              <span className="hidden sm:inline">Karttanäkymä</span>
              <span className="sm:hidden">Kartta</span>
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero section ── */}
        <section className="relative overflow-hidden border-b-2 border-[#1a1a1a]/10">
          {/* Subtle gradient bg */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#FFFBF5] via-[#fff0f8] to-[#fff8e0] opacity-60" />
          <div className="relative max-w-4xl mx-auto px-4 py-12 md:py-20 text-center">
            <p className="text-xs md:text-sm font-mono font-bold text-pink uppercase tracking-wider">
              Ilmainen karttapalvelu
            </p>
            <h1 className="mt-3 text-3xl md:text-5xl font-display font-black text-[#1a1a1a] leading-tight">
              Jokaisen suomalaisen<br className="hidden md:block" /> rakennuksen hinta-arvio
            </h1>
            <p className="mt-4 md:mt-6 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Neliöt yhdistää Tilastokeskuksen kauppahinnat, rakennusrekisterit ja avoimet datalähteet
              yhdeksi interaktiiviseksi kartaksi. Katso minkä tahansa asuinrakennuksen arvioitu
              neliöhinta — ja ymmärrä mistä se koostuu.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/"
                className="neo-press inline-flex items-center gap-2 bg-[#1a1a1a] text-white font-display font-bold text-sm px-6 py-3 rounded-full border-2 border-[#1a1a1a] shadow-hard-sm hover:bg-pink transition-colors"
              >
                <MapPin size={16} />
                Avaa kartta
              </Link>
              <a
                href="#miten-toimii"
                className="inline-flex items-center gap-1.5 text-sm font-display font-bold text-[#1a1a1a] px-5 py-3 rounded-full border-2 border-[#1a1a1a] bg-white hover:bg-pink-baby transition-colors"
              >
                Miten se toimii?
                <ChevronDown size={14} />
              </a>
            </div>
          </div>
        </section>

        {/* ── Stats bar ── */}
        <section className="border-b-2 border-[#1a1a1a]/10 bg-white">
          <div className="max-w-4xl mx-auto px-4 py-6 md:py-8 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 text-center">
            {[
              { value: '700 000+', label: 'Rakennusta' },
              { value: '7', label: 'Kaupunkia' },
              { value: '6', label: 'Hintatekijää' },
              { value: '2018–2024', label: 'Vuosidata' },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-xl md:text-2xl font-display font-black text-[#1a1a1a]">{stat.value}</div>
                <div className="text-xs md:text-sm text-muted-foreground font-body mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features grid ── */}
        <section id="miten-toimii" className="max-w-4xl mx-auto px-4 py-12 md:py-16 scroll-mt-20">
          <h2 className="text-xl md:text-2xl font-display font-black text-[#1a1a1a] text-center">
            Mitä Neliöt tekee?
          </h2>
          <p className="mt-2 text-sm md:text-base text-muted-foreground text-center max-w-xl mx-auto">
            Avoimen datan pohjalta rakennettu työkalu asuntojen hintatason ymmärtämiseen.
          </p>
          <div className="mt-8 md:mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((feature) => {
              const Icon = feature.icon
              return (
                <div
                  key={feature.title}
                  className="rounded-xl border-2 border-[#1a1a1a]/10 bg-white p-5 hover:border-pink hover:shadow-hard-sm transition-all group"
                >
                  <div className="h-9 w-9 rounded-lg bg-pink-baby flex items-center justify-center group-hover:bg-pink/20 transition-colors">
                    <Icon size={18} className="text-[#1a1a1a]" />
                  </div>
                  <h3 className="mt-3 text-sm font-display font-bold text-[#1a1a1a]">{feature.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── Cities ── */}
        <section className="border-y-2 border-[#1a1a1a]/10 bg-white">
          <div className="max-w-4xl mx-auto px-4 py-10 md:py-14">
            <h2 className="text-xl md:text-2xl font-display font-black text-[#1a1a1a] text-center">
              Mukana olevat kaupungit
            </h2>
            <div className="mt-6 md:mt-8 flex flex-wrap justify-center gap-2 md:gap-3">
              {CITIES.map((city) => (
                <span
                  key={city.name}
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#1a1a1a]/10 bg-[#FFFBF5] px-4 py-2 text-sm font-display font-bold text-[#1a1a1a]"
                >
                  <MapPin size={13} className="text-pink" />
                  {city.name}
                  {city.sub && (
                    <span className="text-xs font-body font-normal text-muted-foreground hidden md:inline">
                      {city.sub}
                    </span>
                  )}
                </span>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground text-center">
              Laajennamme kattavuutta jatkuvasti.
            </p>
          </div>
        </section>

        {/* ── FAQ accordion ── */}
        <section className="max-w-3xl mx-auto px-4 py-12 md:py-16">
          <h2 className="text-xl md:text-2xl font-display font-black text-[#1a1a1a] text-center">
            Usein kysytyt kysymykset
          </h2>
          <p className="mt-2 text-sm text-muted-foreground text-center">
            Miten hinta-arviot lasketaan ja mistä data tulee.
          </p>

          <div className="mt-8 md:mt-10 space-y-8 md:space-y-10">
            {FAQ_SECTIONS.map((section) => (
              <div key={section.title}>
                <h3 className="text-base md:text-lg font-display font-bold text-[#1a1a1a] mb-3 flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-pink" />
                  {section.title}
                </h3>
                <div className="space-y-2.5">
                  {section.items.map((item) => (
                    <FAQAccordion key={item.question} item={item} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="max-w-3xl mx-auto px-4 pb-12 md:pb-16">
          <div className="rounded-xl border-2 border-[#1a1a1a] bg-pink-baby p-6 md:p-10 text-center shadow-hard-sm">
            <h2 className="text-lg md:text-xl font-display font-bold text-[#1a1a1a]">
              Kokeile itse
            </h2>
            <p className="text-sm md:text-base text-muted-foreground mt-2 max-w-md mx-auto">
              Hae osoitteella, klikkaa rakennusta ja näe mistä hinta-arvio koostuu.
            </p>
            <div className="mt-5">
              <Link
                href="/"
                className="neo-press inline-flex items-center gap-2 bg-[#1a1a1a] text-white font-display font-bold text-sm px-6 py-3 rounded-full border-2 border-[#1a1a1a] shadow-hard-sm hover:bg-pink transition-colors"
              >
                <MapPin size={16} />
                Avaa kartta
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-[#1a1a1a]/10 bg-[#FFFBF5] py-6">
        <div className="max-w-4xl mx-auto px-4 text-xs text-muted-foreground">
          <p>Lähde: Tilastokeskus (CC BY 4.0) | Rakennukset: OpenStreetMap | SYKE Ryhti (CC BY 4.0)</p>
        </div>
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function FAQAccordion({ item }: { item: FAQItem }) {
  const answerLines = Array.isArray(item.answer) ? item.answer : [item.answer]

  return (
    <details className="group rounded-xl border-2 border-[#1a1a1a]/10 bg-white overflow-hidden transition-all hover:border-[#1a1a1a]/20">
      <summary className="flex items-center justify-between cursor-pointer px-4 py-3 md:px-5 md:py-4 text-sm md:text-base font-display font-bold text-[#1a1a1a] select-none list-none [&::-webkit-details-marker]:hidden">
        <span className="pr-4">{item.question}</span>
        <ChevronDown
          size={18}
          className="flex-shrink-0 text-[#999] transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <div className="px-4 pb-4 md:px-5 md:pb-5 text-sm text-muted-foreground space-y-2 leading-relaxed">
        {answerLines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </details>
  )
}
