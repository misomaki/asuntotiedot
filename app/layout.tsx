import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./components/Providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Asuntokartta \u2013 Suomen asuntohinnat kartalla",
  description:
    "Interaktiivinen karttasovellus Suomen asuntojen hinta-arvioiden, ik\u00e4rakenteen ja tilastotietojen tarkasteluun. Tarkastele asuntojen neliöhintoja postinumeroalueittain.",
  keywords: [
    "asuntohinnat",
    "Suomi",
    "kartta",
    "neliöhinta",
    "asuntokartta",
    "hintakartta",
  ],
  authors: [{ name: "Asuntokartta" }],
  openGraph: {
    title: "Asuntokartta \u2013 Suomen asuntohinnat kartalla",
    description:
      "Tarkastele Suomen asuntojen hinta-arvioita interaktiivisella kartalla.",
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
      className={`dark ${inter.variable} ${plusJakartaSans.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
