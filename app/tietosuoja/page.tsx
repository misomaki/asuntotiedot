'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/app/lib/utils'

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/"
            className="h-9 w-9 rounded-lg border-2 border-[#1a1a1a]/15 flex items-center justify-center hover:bg-muted/50 transition-colors"
            aria-label="Takaisin kartalle"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-xl font-display font-bold">Tietosuojaseloste</h1>
        </div>

        <div className={cn(
          'rounded-xl border-2 border-[#1a1a1a]/15 bg-bg-primary p-6 md:p-8',
          'prose prose-sm max-w-none',
          'font-body text-[#1a1a1a]',
          '[&_h2]:font-display [&_h2]:font-bold [&_h2]:text-base [&_h2]:mt-8 [&_h2]:mb-3',
          '[&_h3]:font-display [&_h3]:font-bold [&_h3]:text-sm [&_h3]:mt-6 [&_h3]:mb-2',
          '[&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-[#444] [&_p]:mb-3',
          '[&_ul]:text-sm [&_ul]:text-[#444] [&_ul]:mb-3 [&_ul]:pl-5',
          '[&_li]:mb-1',
          '[&_table]:text-xs [&_table]:w-full [&_table]:mb-4',
          '[&_th]:text-left [&_th]:font-mono [&_th]:font-bold [&_th]:pb-2 [&_th]:pr-4',
          '[&_td]:pb-2 [&_td]:pr-4 [&_td]:align-top',
        )}>
          <p className="text-xs text-[#999] font-mono mb-6">
            Päivitetty: 13.4.2026
          </p>

          <h2>1. Rekisterinpitäjä</h2>
          <p>
            Neliöt (neliohinnat.fi)<br />
            Sähköposti: tietosuoja@neliohinnat.fi
          </p>

          <h2>2. Mitä tietoja keräämme</h2>

          <h3>2.1 Analytiikka (vain suostumuksella)</h3>
          <p>
            Jos hyväksyt analytiikkaevästeet, keräämme PostHog-analytiikkapalvelun kautta:
          </p>
          <ul>
            <li>Sivunäytöt ja navigointipolut</li>
            <li>Karttainteraktiot (zoom-taso, klikatut alueet/rakennukset)</li>
            <li>Hakutermit</li>
            <li>Selaimen tyyppi ja näytön koko</li>
          </ul>
          <p>
            Analytiikkadata käsitellään EU:ssa (PostHog EU-hosting).
            Voit kieltäytyä analytiikasta evästebannerin kautta — palvelu toimii ilman niitä.
          </p>

          <h2>3. Käsittelyn oikeusperuste</h2>
          <table>
            <thead>
              <tr>
                <th>Tietoryhmä</th>
                <th>Peruste</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Analytiikka</td>
                <td>Suostumus (evästebanneri)</td>
              </tr>
            </tbody>
          </table>

          <h2>4. Kolmannet osapuolet ja tiedonsiirrot</h2>
          <table>
            <thead>
              <tr>
                <th>Palvelu</th>
                <th>Tarkoitus</th>
                <th>Sijainti</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Supabase</td>
                <td>Tietokanta</td>
                <td>EU</td>
              </tr>
              <tr>
                <td>PostHog</td>
                <td>Analytiikka (suostumuksella)</td>
                <td>EU</td>
              </tr>
              <tr>
                <td>Vercel</td>
                <td>Hosting</td>
                <td>EU/Yhdysvallat*</td>
              </tr>
              <tr>
                <td>OpenStreetMap Nominatim</td>
                <td>Osoitehaku</td>
                <td>Globaali</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-[#999]">
            * EU:n ulkopuolelle siirrettävien tietojen osalta noudatetaan EU:n vakiosopimuslausekkeita (SCC)
            tai vastaavia suojamekanismeja.
          </p>

          <h2>5. Evästeet</h2>
          <table>
            <thead>
              <tr>
                <th>Eväste</th>
                <th>Tarkoitus</th>
                <th>Tyyppi</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>PostHog-evästeet</td>
                <td>Analytiikka</td>
                <td>Suostumus</td>
              </tr>
            </tbody>
          </table>
          <p>
            Lisäksi tallennamme paikallisesti (localStorage): kartan näkymän sijainti (latitude, longitude, zoom-taso)
            ja evästeasetuksen valinnan.
          </p>

          <h2>6. Oikeutesi</h2>
          <p>GDPR:n mukaan sinulla on oikeus:</p>
          <ul>
            <li><strong>Vastustaa käsittelyä</strong> — voit kieltäytyä analytiikasta evästebannerin kautta</li>
            <li><strong>Tietojen poistaminen</strong> — analytiikkadata poistuu automaattisesti 90 päivän jälkeen</li>
            <li><strong>Tehdä valitus</strong> — tietosuojavaltuutetulle (tietosuoja.fi)</li>
          </ul>

          <h2>7. Tietojen säilytysajat</h2>
          <ul>
            <li>Analytiikkadata — 90 päivää (PostHog)</li>
            <li>Evästeasetus (localStorage) — kunnes tyhjennät selaimen</li>
          </ul>

          <h2>8. Tietoturva</h2>
          <p>
            Suojaamme tietojasi seuraavasti:
          </p>
          <ul>
            <li>Kaikki liikenne on salattua (HTTPS/TLS)</li>
            <li>Analytiikkadata käsitellään EU:ssa</li>
            <li>Palvelu ei kerää henkilötietoja ilman erillistä tiliä</li>
          </ul>

          <h2>9. Yhteydenotto</h2>
          <p>
            Tietosuojaa koskevissa kysymyksissä ota yhteyttä:<br />
            <strong>tietosuoja@neliohinnat.fi</strong>
          </p>
          <p>
            Vastaamme tietopyyntöihin 30 päivän kuluessa.
          </p>
        </div>
      </div>
    </div>
  )
}
