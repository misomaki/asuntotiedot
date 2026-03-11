import type { Metadata } from "next";
import { Inter, Inconsolata, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./components/Providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const inconsolata = Inconsolata({
  subsets: ["latin"],
  variable: "--font-brand",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Talotutka \u2013 Suomen asuntohinnat, n\u00e4htyn\u00e4",
  description:
    "Interaktiivinen karttasovellus Suomen asuntojen hinta-arvioiden, ik\u00e4rakenteen ja tilastotietojen tarkasteluun. Rakennuskohtaiset hinta-arviot avoimesta datasta.",
  keywords: [
    "asuntohinnat",
    "Suomi",
    "kartta",
    "neliöhinta",
    "talotutka",
    "hinta-arvio",
    "tilastokeskus",
  ],
  authors: [{ name: "Talotutka" }],
  openGraph: {
    title: "Talotutka \u2013 Suomen asuntohinnat, n\u00e4htyn\u00e4",
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
      className={`dark ${inter.variable} ${inconsolata.variable} ${jetbrainsMono.variable} `}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
