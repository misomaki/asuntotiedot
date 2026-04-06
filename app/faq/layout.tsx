import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tietoa palvelusta – Neliöt',
  description: 'Neliöt yhdistää ostajat ja myyjät suoraan — ilman välittäjää. Tutustu palveluun, hinta-arvioalgoritmiin ja markkinapaikkaan.',
  keywords: ['neliöt', 'hinta-arvio', 'asuntokauppa', 'ilman välittäjää', 'asuntohinnat', 'markkinapaikka'],
}

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return children
}
