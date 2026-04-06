import type { Metadata } from "next";
import { Libre_Franklin, Public_Sans, IBM_Plex_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { Providers } from "./components/Providers";
import { ConditionalAnalytics } from "./components/ConditionalAnalytics";

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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://neliohinnat.fi'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Neliöt \u2013 Löydä koti, jota et tiennyt etsiväsi",
    template: "%s | Neliöt",
  },
  description:
    "Neliöt näyttää jokaisen asuinrakennuksen hinta-arvion ja yhdistää ostajat suoraan myyjiin — ilman välittäjää. 266 000 kohdetta, läpinäkyvät hinnat, avoin data.",
  keywords: [
    "asuntohinnat",
    "Suomi",
    "kartta",
    "neliöhinta",
    "neliöt",
    "hinta-arvio",
    "asuntokauppa",
    "ilman välittäjää",
  ],
  authors: [{ name: "Neliöt" }],
  openGraph: {
    title: "Neliöt \u2013 Löydä koti, jota et tiennyt etsiväsi",
    description:
      "266 000 asuinrakennuksen hinta-arviot, läpinäkyvä hinnan muodostus ja suora yhteys ostajan ja myyjän välillä — ilman välikäsiä.",
    type: "website",
    locale: "fi_FI",
    siteName: "Neliöt",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Neliöt \u2013 Löydä koti, jota et tiennyt etsiväsi",
    description: "266 000 asuinrakennuksen hinta-arviot kartalla. Läpinäkyvät hinnat, avoin data.",
  },
  alternates: {
    canonical: '/',
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'Neliöt',
              url: SITE_URL,
              description: 'Jokaisen asuinrakennuksen hinta-arvio kartalla — ilman välittäjää.',
              potentialAction: {
                '@type': 'SearchAction',
                target: {
                  '@type': 'EntryPoint',
                  urlTemplate: `${SITE_URL}/?q={search_term_string}`,
                },
                'query-input': 'required name=search_term_string',
              },
            }),
          }}
        />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
        <ConditionalAnalytics />
      </body>
    </html>
  );
}
