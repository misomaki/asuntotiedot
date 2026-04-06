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
            Päivitetty: 5.4.2026
          </p>

          <h2>1. Rekisterinpitäjä</h2>
          <p>
            Neliöt (neliohinnat.fi)<br />
            Sähköposti: tietosuoja@neliohinnat.fi
          </p>

          <h2>2. Mitä tietoja keräämme</h2>

          <h3>2.1 Tilin luominen</h3>
          <p>Kun luot tilin, keräämme:</p>
          <ul>
            <li><strong>Sähköpostiosoite</strong> — kirjautumista ja viestintää varten</li>
            <li><strong>Salasana</strong> — salattu (bcrypt), emme näe sitä selkokielisenä</li>
            <li><strong>Nimi ja profiilikuva</strong> — jos kirjaudut Google-tilillä, saamme nämä Googlelta</li>
          </ul>

          <h3>2.2 Markkinapaikkasignaalit</h3>
          <p>Jos jätät osto- tai myynti-ilmoituksen, tallennamme:</p>
          <ul>
            <li>Rakennuksen tunniste, huoneluku, pinta-alatoive, hintarajat</li>
            <li>Vapaamuotoinen viesti (max 280/500 merkkiä)</li>
            <li>Osto-kiinnostukset vanhenevat 90 päivässä, myynti-ilmoitukset 180 päivässä</li>
          </ul>

          <h3>2.3 Analytiikka (vain suostumuksella)</h3>
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

          <h3>2.4 AI-hakutoiminto</h3>
          <p>
            Luonnollisen kielen haku käyttää Anthropic Claude -tekoälypalvelua hakukyselyiden jäsentämiseen.
            Hakukyselysi lähetetään Anthropicin palvelimille (Yhdysvallat) käsittelyä varten.
            Emme lähetä henkilötietoja — vain hakutekstin ja rakennuksen julkisia tietoja.
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
                <td>Tilitiedot (sähköposti, nimi)</td>
                <td>Sopimus (palvelun käyttö)</td>
              </tr>
              <tr>
                <td>Markkinapaikkasignaalit</td>
                <td>Sopimus (palvelun käyttö)</td>
              </tr>
              <tr>
                <td>Analytiikka</td>
                <td>Suostumus (evästebanneri)</td>
              </tr>
              <tr>
                <td>AI-hakukyselyt</td>
                <td>Oikeutettu etu (palvelun toiminnallisuus)</td>
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
                <td>Tietokanta, autentikaatio</td>
                <td>EU</td>
              </tr>
              <tr>
                <td>PostHog</td>
                <td>Analytiikka (suostumuksella)</td>
                <td>EU</td>
              </tr>
              <tr>
                <td>Anthropic (Claude)</td>
                <td>AI-hakukyselyiden jäsentäminen</td>
                <td>Yhdysvallat*</td>
              </tr>
              <tr>
                <td>Google OAuth</td>
                <td>Kirjautuminen (valinnainen)</td>
                <td>Yhdysvallat*</td>
              </tr>
              <tr>
                <td>Vercel</td>
                <td>Hosting, suorituskykymittarit</td>
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
                <td>sb-*-auth-token</td>
                <td>Kirjautumisistunto (Supabase)</td>
                <td>Välttämätön</td>
              </tr>
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
            <li><strong>Tarkastaa tietosi</strong> — voit ladata kaikki tietosi JSON-muodossa <Link href="/asetukset" className="underline">asetuksissa</Link></li>
            <li><strong>Oikaista tietosi</strong> — ota yhteyttä sähköpostilla</li>
            <li><strong>Poistaa tilisi</strong> — voit poistaa tilisi ja kaikki tietosi <Link href="/asetukset" className="underline">asetuksissa</Link></li>
            <li><strong>Siirtää tietosi</strong> — tietojen lataus JSON-muodossa (asetukset)</li>
            <li><strong>Vastustaa käsittelyä</strong> — voit kieltäytyä analytiikasta evästeasetuksissa</li>
            <li><strong>Tehdä valitus</strong> — tietosuojavaltuutetulle (tietosuoja.fi)</li>
          </ul>

          <h2>7. Tietojen säilytysajat</h2>
          <ul>
            <li>Tilitiedot — kunnes poistat tilisi</li>
            <li>Osto-kiinnostukset — 90 päivää luomisesta</li>
            <li>Myynti-ilmoitukset — 180 päivää luomisesta</li>
            <li>Analytiikkadata — 90 päivää (PostHog)</li>
          </ul>

          <h2>8. Tietoturva</h2>
          <p>
            Suojaamme tietojasi seuraavasti:
          </p>
          <ul>
            <li>Kaikki liikenne on salattua (HTTPS/TLS)</li>
            <li>Salasanat salataan bcrypt-algoritmilla</li>
            <li>Tietokantatasolla rivitason tietoturva (Row-Level Security)</li>
            <li>API-tason autentikointi ja syötevalidointi</li>
            <li>Kolmannen osapuolen palvelut noudattavat omia tietoturvaohjelmiaan</li>
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
