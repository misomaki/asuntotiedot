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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.neliohinnat.fi'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Neliöt \u2013 Löydä koti, jota et tiennyt etsiväsi",
    template: "%s | Neliöt",
  },
  description:
    "Neliöt näyttää jokaisen asuinrakennuksen hinta-arvion kartalla. 266 000 kohdetta, läpinäkyvät hinnat, avoin data. Helsinki, Tampere, Turku, Oulu ja muut.",
  keywords: [
    "asuntohinnat",
    "asuntohinnat kartalla",
    "Suomi",
    "neliöhinta",
    "neliöt",
    "hinta-arvio",
    "asunnon hinta-arvio",
    "neliöhinnat Helsinki",
  ],
  authors: [{ name: "Neliöt" }],
  openGraph: {
    title: "Neliöt \u2013 Asuntohinnat kartalla",
    description:
      "266 000 asuinrakennuksen hinta-arviot kartalla. Läpinäkyvä hinnanmuodostus avoimeen dataan perustuen.",
    type: "website",
    locale: "fi_FI",
    siteName: "Neliöt",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Neliöt \u2013 Asuntohinnat kartalla",
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
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'WebSite',
                  '@id': `${SITE_URL}/#website`,
                  name: 'Neliöt',
                  url: SITE_URL,
                  inLanguage: 'fi',
                  description: 'Jokaisen asuinrakennuksen hinta-arvio kartalla.',
                  potentialAction: {
                    '@type': 'SearchAction',
                    target: {
                      '@type': 'EntryPoint',
                      urlTemplate: `${SITE_URL}/?q={search_term_string}`,
                    },
                    'query-input': 'required name=search_term_string',
                  },
                },
                {
                  '@type': 'Organization',
                  '@id': `${SITE_URL}/#organization`,
                  name: 'Neliöt',
                  url: SITE_URL,
                  description: 'Suomalainen asuntohintapalvelu — 266 000 asuinrakennuksen hinta-arviot avoimella datalla.',
                  logo: {
                    '@type': 'ImageObject',
                    url: `${SITE_URL}/icon.svg`,
                  },
                  sameAs: [],
                },
              ],
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
