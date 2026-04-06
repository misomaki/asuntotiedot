import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tietosuojaseloste',
  description: 'Neliöt-palvelun tietosuojaseloste. Tietoa henkilötietojen käsittelystä, evästeistä ja käyttäjän oikeuksista.',
  alternates: {
    canonical: '/tietosuoja',
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
