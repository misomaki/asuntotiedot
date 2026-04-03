import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Omat ilmoitukset – Neliöt',
  description: 'Hallitse omia kiinnostus- ja myynti-ilmoituksiasi.',
}

export default function MySignalsLayout({ children }: { children: React.ReactNode }) {
  return children
}
