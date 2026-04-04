import { Metadata } from 'next'
import Link from 'next/link'
import { MapPin } from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Alueet – Neliöt',
  description: 'Selaa Suomen postinumeroalueita ja vertaile asuntojen hintoja kartalla.',
  keywords: ['asuntohinnat', 'postinumero', 'neliöhinta', 'Helsinki', 'Tampere', 'Turku', 'Oulu'],
}

export default function AreasIndexPage() {
  return (
    <div className="min-h-screen bg-[#FFFBF5] flex flex-col items-center justify-center px-4">
      <h1 className="text-3xl font-display font-black text-[#1a1a1a] text-center">
        Alueet
      </h1>
      <p className="text-muted-foreground mt-3 text-base text-center max-w-md">
        Selaa asuntojen hintoja kartalla — valitse alue klikkaamalla tai käytä hakua.
      </p>
      <Link
        href="/"
        className="mt-6 neo-press inline-flex items-center gap-2 bg-[#1a1a1a] text-white font-display font-bold text-sm px-6 py-3 rounded-full border-2 border-[#1a1a1a] shadow-hard-sm hover:bg-pink transition-colors"
      >
        <MapPin size={16} />
        Avaa kartta
      </Link>
    </div>
  )
}
