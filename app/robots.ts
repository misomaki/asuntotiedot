import { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.neliohinnat.fi'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/auth/', '/asetukset', '/omat-ilmoitukset', '/design-comparison', '/brand-preview', '/style-exploration'],
      },
      // Allow AI search crawlers (GPTBot, ClaudeBot) for citation in AI answers.
      // Block only pure training/scraping bots that don't drive traffic.
      { userAgent: 'Bytespider', disallow: ['/'] },
      { userAgent: 'meta-externalagent', disallow: ['/'] },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
