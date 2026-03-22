import type { Metadata } from "next";
import { Libre_Franklin, Public_Sans, IBM_Plex_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { Providers } from "./components/Providers";
import { Analytics } from "@vercel/analytics/next";

const libreFranklin = Libre_Franklin({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-brand",
  display: "swap",
  weight: ["800", "900"],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export { viewport } from './viewport'

export const metadata: Metadata = {
  title: "Neliöt \u2013 Suomen asuntohinnat, nähtynä",
  description:
    "Interaktiivinen karttasovellus Suomen asuntojen hinta-arvioiden, ikärakenteen ja tilastotietojen tarkasteluun. Rakennuskohtaiset hinta-arviot avoimesta datasta.",
  keywords: [
    "asuntohinnat",
    "Suomi",
    "kartta",
    "neliöhinta",
    "neliöt",
    "hinta-arvio",
    "tilastokeskus",
  ],
  authors: [{ name: "Neliöt" }],
  openGraph: {
    title: "Neliöt \u2013 Suomen asuntohinnat, nähtynä",
    description:
      "Rakennuskohtaiset hinta-arviot avoimesta datasta. Tarkastele Suomen asuntomarkkinaa interaktiivisella kartalla.",
    type: "website",
    locale: "fi_FI",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fi"
      className={`${libreFranklin.variable} ${publicSans.variable} ${ibmPlexMono.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
