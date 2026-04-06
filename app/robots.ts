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
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
