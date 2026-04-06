import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Käyttöehdot',
  description: 'Neliöt-palvelun käyttöehdot. Lue palvelun käyttöä koskevat ehdot ja rajoitukset.',
  alternates: {
    canonical: '/kayttoehdot',
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
