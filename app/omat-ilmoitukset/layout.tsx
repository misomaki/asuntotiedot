import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Omat ilmoitukset',
  description: 'Hallitse omia kiinnostus- ja myynti-ilmoituksiasi.',
  robots: { index: false, follow: false },
}

export default function MySignalsLayout({ children }: { children: React.ReactNode }) {
  return children
}
