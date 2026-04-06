import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tietosuojaseloste – Neliöt',
  description: 'Neliöt-palvelun tietosuojaseloste. Tietoa henkilötietojen käsittelystä, evästeistä ja käyttäjän oikeuksista.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
