import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Käyttöehdot – Neliöt',
  description: 'Neliöt-palvelun käyttöehdot.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
