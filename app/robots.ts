import { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://neliohinnat.fi'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/auth/', '/asetukset', '/omat-ilmoitukset', '/design-comparison', '/brand-preview', '/style-exploration'],
      },
      // Block AI training crawlers (mirror Cloudflare managed rules)
      { userAgent: 'GPTBot', disallow: ['/'] },
      { userAgent: 'ClaudeBot', disallow: ['/'] },
      { userAgent: 'CCBot', disallow: ['/'] },
      { userAgent: 'Amazonbot', disallow: ['/'] },
      { userAgent: 'Applebot-Extended', disallow: ['/'] },
      { userAgent: 'Bytespider', disallow: ['/'] },
      { userAgent: 'meta-externalagent', disallow: ['/'] },
      // NOTE: Google-Extended intentionally NOT blocked — needed for Google AI Overviews
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
