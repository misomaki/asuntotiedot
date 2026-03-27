import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tietoa palvelusta – Neliöt',
  description: 'Neliöt on ilmainen karttapalvelu suomalaisten asuntojen hinta-arvioille. Tutustu palveluun, algoritmiin ja datalähtöisiin.',
  keywords: ['neliöt', 'hinta-arvio', 'FAQ', 'asuntohinnat', 'algoritmi', 'karttapalvelu'],
}

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return children
}
