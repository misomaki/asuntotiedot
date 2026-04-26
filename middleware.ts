import { type NextRequest } from 'next/server'
import { updateSession } from '@/app/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Run on all routes except static files, images, and ISR/static pages
    // ISR pages (alue, kaupunki, faq, etc.) must NOT go through auth middleware
    // or Next.js treats them as dynamic and disables CDN caching
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|alue|kaupunki|kaupungit|faq|kayttoehdot|tietosuoja|sitemap|llms|ingest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|txt|xml)$).*)',
  ],
}
