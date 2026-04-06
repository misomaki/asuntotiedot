import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tietoa palvelusta',
  description: 'Neliöt yhdistää ostajat ja myyjät suoraan — ilman välittäjää. Tutustu palveluun, hinta-arvioalgoritmiin ja markkinapaikkaan.',
  keywords: ['neliöt', 'hinta-arvio', 'asuntokauppa', 'ilman välittäjää', 'asuntohinnat', 'markkinapaikka'],
  openGraph: {
    title: 'Tietoa palvelusta – Neliöt',
    description: 'Tutustu palveluun, hinta-arvioalgoritmiin ja markkinapaikkaan.',
  },
  alternates: {
    canonical: '/faq',
  },
}

const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Miksi hinta-arvio voi poiketa todellisesta kauppahinnasta?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Algoritmimme tuntee rakennuksen — mutta ei yksittäistä asuntoa. Se tietää talon iän, sijainnin, koon ja alueen hintatason, mutta ei näe juuri remontoitua keittiötä, parveketta etelään tai märkää kellaria. Siksi lopullinen kauppahinta muodostuu aina ostajan ja myyjän välillä.',
      },
    },
    {
      '@type': 'Question',
      name: 'Miten Neliöt eroaa perinteisistä asuntoportaaleista?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Asuntoportaaleissa näet vain kohteet, jotka joku on päättänyt laittaa myyntiin — välittäjän asettamalla hinnalla. Neliöissä näet jokaisen rakennuksen riippumatta siitä, onko se myynnissä vai ei. Voit ilmaista kiinnostuksesi mihin tahansa rakennukseen kartalla.',
      },
    },
    {
      '@type': 'Question',
      name: 'Miten hinta-arviot lasketaan?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Jokaisen rakennuksen hinta-arvio perustuu kuuteen tekijään: perushinta (Tilastokeskuksen toteutuneet kauppahinnat), ikäkerroin, vesistökerroin, kerroskerroin, kokokerroin ja aluekerroin.',
      },
    },
    {
      '@type': 'Question',
      name: 'Miten osto- ja myyntisignaalit toimivat?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Ostajana klikkaat rakennusta kartalla ja merkitset kiinnostuksesi. Myyjänä lisäät asuntosi osoitteen asetuksissa ja merkitset sen myyntiin yhdellä napilla. Signaalit näkyvät kartalla anonyymisti.',
      },
    },
    {
      '@type': 'Question',
      name: 'Mistä data tulee?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Tilastokeskus (Paavo & StatFin) — postinumeroalueiden rajat, väestötiedot ja toteutuneet asuntokauppahinnat. OpenStreetMap — rakennusten pohjapiirrokset. SYKE Ryhti-rekisteri — rakennusvuosi, kerrosluku, asuntomäärä. Maanmittauslaitos — osoitetiedot.',
      },
    },
  ],
}

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />
      {children}
    </>
  )
}
