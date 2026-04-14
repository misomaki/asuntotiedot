'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/app/lib/utils'

export default function TermsOfServicePage() {
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
          <h1 className="text-xl font-display font-bold">Käyttöehdot</h1>
        </div>

        <div className={cn(
          'rounded-xl border-2 border-[#1a1a1a]/15 bg-bg-primary p-6 md:p-8',
          'prose prose-sm max-w-none',
          'font-body text-[#1a1a1a]',
          '[&_h2]:font-display [&_h2]:font-bold [&_h2]:text-base [&_h2]:mt-8 [&_h2]:mb-3',
          '[&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-[#444] [&_p]:mb-3',
          '[&_ul]:text-sm [&_ul]:text-[#444] [&_ul]:mb-3 [&_ul]:pl-5',
          '[&_li]:mb-1',
        )}>
          <p className="text-xs text-[#999] font-mono mb-6">
            Päivitetty: 13.4.2026
          </p>

          <h2>1. Palvelun kuvaus</h2>
          <p>
            Neliöt (neliohinnat.fi) on interaktiivinen karttapalvelu, joka näyttää suomalaisten
            asuinrakennusten hinta-arvioita, tilastotietoja ja alueen ominaisuuksia.
            Hinta-arviot perustuvat avoimeen dataan ja algoritmiseen laskentaan.
          </p>

          <h2>2. Hinta-arviot</h2>
          <p>
            <strong>Hinta-arviot ovat suuntaa-antavia eivätkä vastaa virallista kiinteistöarviota.</strong>{' '}
            Arviot perustuvat Tilastokeskuksen julkiseen hintadataan, OpenStreetMapin rakennustietoihin
            ja SYKE:n Ryhti-rakennusrekisteriin. Algoritminen arvio ei huomioi yksittäisen asunnon kuntoa,
            remonttitasoa tai muita asuntokohtaisia tekijöitä.
          </p>
          <p>
            Emme vastaa hinta-arvioiden tarkkuudesta emmekä niiden perusteella tehdyistä päätöksistä.
            Kiinteistökaupassa suosittelemme aina ammattimaisen kiinteistöarvioijan käyttöä.
          </p>

          <h2>3. Hyväksyttävä käyttö</h2>
          <p>Sitoudut olemaan:</p>
          <ul>
            <li>Käyttämättä palvelua laittomiin tarkoituksiin</li>
            <li>Ylikuormittamatta palvelua automaattisilla kyselyillä</li>
            <li>Kopioimatta dataa kaupalliseen uudelleenjakeluun</li>
          </ul>

          <h2>4. Datalähteet ja tekijänoikeudet</h2>
          <p>Palvelu käyttää seuraavia avoimia datalähteitä:</p>
          <ul>
            <li>Tilastokeskus (StatFin, Paavo) — CC BY 4.0</li>
            <li>OpenStreetMap — ODbL</li>
            <li>SYKE Ryhti-rakennusrekisteri — CC BY 4.0</li>
            <li>Maanmittauslaitos — CC BY 4.0</li>
          </ul>

          <h2>5. Vastuunrajoitus</h2>
          <p>
            Palvelu tarjotaan &ldquo;sellaisena kuin se on&rdquo; ilman takuita.
            Emme vastaa palvelun keskeytyksistä, virheistä tai tietojen tarkkuudesta.
            Vastuumme rajoittuu sovellettavan lain sallimissa rajoissa.
          </p>

          <h2>6. Muutokset</h2>
          <p>
            Voimme päivittää näitä ehtoja. Olennaisista muutoksista ilmoitamme palvelun kautta.
            Jatkamalla palvelun käyttöä hyväksyt päivitetyt ehdot.
          </p>

          <h2>7. Sovellettava laki</h2>
          <p>
            Näihin ehtoihin sovelletaan Suomen lakia. Riidat ratkaistaan Helsingin käräjäoikeudessa.
          </p>

          <h2>8. Yhteystiedot</h2>
          <p>
            Kysymyksissä ota yhteyttä: <strong>tietosuoja@neliohinnat.fi</strong>
          </p>

          <p className="mt-8">
            <Link
              href="/tietosuoja"
              className="text-sm underline underline-offset-2 hover:text-[#1a1a1a] transition-colors"
            >
              Tietosuojaseloste
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
