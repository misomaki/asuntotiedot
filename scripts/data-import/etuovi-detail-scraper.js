/**
 * Etuovi.fi Detail Page Scraper
 *
 * This script collects listing URLs from search results, then visits each
 * detail page to extract complete data including construction year.
 *
 * SLOWER but RELIABLE — construction year is always shown on detail pages.
 *
 * HOW TO USE:
 * 1. Go to etuovi.com, search for a city + property type
 * 2. Open Developer Tools Console (F12)
 * 3. Paste this script and press Enter
 * 4. Wait — it visits each listing page (1.5s delay between visits)
 * 5. Results are copied to clipboard + downloaded as CSV
 *
 * TIP: Start with smaller searches (single neighborhood or district)
 *      to avoid hitting rate limits. ~200 listings at a time is safe.
 */

(async function scrapeEtuoviDetails() {
  const DELAY_BETWEEN_PAGES = 1500; // ms between detail page fetches
  const DELAY_BETWEEN_NAV = 2500;   // ms between search result pages

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Step 1: Collect all listing URLs from search results
  console.log('=== Step 1: Collecting listing URLs ===');

  function getListingUrls() {
    const urls = new Set();
    const links = document.querySelectorAll('a[href*="/kohde/"]');
    for (const link of links) {
      const href = link.href;
      if (href && href.includes('/kohde/')) {
        // Normalize URL
        const url = new URL(href);
        urls.add(url.origin + url.pathname);
      }
    }
    return [...urls];
  }

  let allUrls = [];
  let pageCount = 0;

  // Collect from current page
  let pageUrls = getListingUrls();
  allUrls.push(...pageUrls);
  pageCount++;
  console.log(`Search page ${pageCount}: ${pageUrls.length} listings`);

  // Navigate to next pages
  for (let i = 0; i < 50; i++) {
    const nextBtn = document.querySelector('[aria-label="Seuraava sivu"]')
      || [...document.querySelectorAll('button, a')].find(el =>
        el.textContent?.trim() === '›' ||
        el.textContent?.trim() === 'Seuraava'
      );

    if (!nextBtn || nextBtn.disabled || nextBtn.getAttribute('aria-disabled') === 'true') {
      console.log('No more search pages');
      break;
    }

    nextBtn.click();
    await sleep(DELAY_BETWEEN_NAV);

    pageUrls = getListingUrls();
    if (pageUrls.length === 0) break;

    // Only add URLs we haven't seen
    const newUrls = pageUrls.filter(u => !allUrls.includes(u));
    if (newUrls.length === 0) break;

    allUrls.push(...newUrls);
    pageCount++;
    console.log(`Search page ${pageCount}: ${newUrls.length} new listings (total: ${allUrls.length})`);
  }

  console.log(`\nTotal listing URLs: ${allUrls.length}`);
  console.log('\n=== Step 2: Fetching detail pages ===');

  // Step 2: Fetch each detail page and extract data
  const results = [];
  let fetched = 0;
  let errors = 0;

  for (const url of allUrls) {
    try {
      fetched++;
      if (fetched % 10 === 0 || fetched === 1) {
        console.log(`Fetching ${fetched}/${allUrls.length}...`);
      }

      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn(`HTTP ${resp.status} for ${url}`);
        errors++;
        await sleep(DELAY_BETWEEN_PAGES * 2); // Back off on errors
        continue;
      }

      const html = await resp.text();

      // Parse the HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const text = doc.body?.textContent || '';

      // Extract address
      const h1 = doc.querySelector('h1');
      const address = h1?.textContent?.trim() || '';

      // Extract location from breadcrumb or meta
      let neighborhood = '';
      let city = '';

      // Try structured data
      const jsonLd = doc.querySelector('script[type="application/ld+json"]');
      if (jsonLd) {
        try {
          const data = JSON.parse(jsonLd.textContent);
          if (data.address) {
            city = data.address.addressLocality || '';
            neighborhood = data.address.addressRegion || data.address.streetAddress || '';
          }
        } catch (e) { /* ignore */ }
      }

      // Fallback: look for location in the page
      if (!neighborhood || !city) {
        // Etuovi typically shows "Neighborhood, City" in location elements
        const locationEls = doc.querySelectorAll('[class*="location"], [class*="Location"], [class*="area"], [class*="Area"]');
        for (const el of locationEls) {
          const locText = el.textContent?.trim();
          if (locText?.includes(',')) {
            const parts = locText.split(',').map(s => s.trim());
            if (parts.length >= 2) {
              neighborhood = neighborhood || parts[0];
              city = city || parts[parts.length - 1];
            }
          }
        }
      }

      // Also try breadcrumbs
      if (!neighborhood || !city) {
        const breadcrumbs = doc.querySelectorAll('[class*="breadcrumb"] a, nav a');
        const crumbTexts = [...breadcrumbs].map(a => a.textContent?.trim()).filter(Boolean);
        // Typically: Etusivu > Myytävät asunnot > Helsinki > Kallio
        for (let i = crumbTexts.length - 1; i >= 0; i--) {
          const t = crumbTexts[i];
          if (!t) continue;
          const knownCities = ['Helsinki', 'Espoo', 'Vantaa', 'Tampere', 'Turku', 'Oulu', 'Jyväskylä', 'Kuopio', 'Lahti'];
          if (knownCities.some(c => t.includes(c))) {
            city = city || knownCities.find(c => t.includes(c));
          } else if (i > 0 && !neighborhood && !['Etusivu', 'Myytävät'].some(skip => t.includes(skip))) {
            neighborhood = t;
          }
        }
      }

      // Extract price
      let price = 0;
      const pricePatterns = [
        /(?:Hinta|Myyntihinta|Velaton hinta)[:\s]*([\d\s]+)\s*€/i,
        /(\d[\d\s]{2,})\s*€/,
      ];
      for (const pattern of pricePatterns) {
        const match = text.match(pattern);
        if (match) {
          price = parseInt(match[1].replace(/\s/g, ''));
          if (price > 10000) break; // Likely a real sale price
        }
      }

      // Extract size
      let size = 0;
      const sizePatterns = [
        /(?:Asuinpinta-ala|Pinta-ala|Huoneistoala)[:\s]*([\d,]+)\s*m²/i,
        /([\d,]+)\s*m²/,
      ];
      for (const pattern of sizePatterns) {
        const match = text.match(pattern);
        if (match) {
          size = parseFloat(match[1].replace(',', '.'));
          if (size > 10 && size < 1000) break;
        }
      }

      // Extract construction year (the key data point!)
      let year = 0;
      const yearPatterns = [
        /(?:Rakennusvuosi|Valmistumisvuosi|Rakennettu)[:\s]*(\d{4})/i,
        /(?:rv\.?|rak\.?\s*v\.?)[:\s]*(\d{4})/i,
      ];
      for (const pattern of yearPatterns) {
        const match = text.match(pattern);
        if (match) {
          const y = parseInt(match[1]);
          if (y >= 1800 && y <= 2030) {
            year = y;
            break;
          }
        }
      }

      // Extract property type
      let type = 'K';
      const lowerText = text.toLowerCase();
      if (lowerText.includes('omakotitalo') || lowerText.includes('erillistalo')) {
        type = 'O';
      } else if (lowerText.includes('rivitalo') || lowerText.includes('paritalo') || lowerText.includes('ketjutalo')) {
        type = 'R';
      }

      const pricePerSqm = size > 0 && price > 0 ? Math.round(price / size) : 0;

      if (pricePerSqm >= 500 && neighborhood && city) {
        results.push({
          neighborhood,
          city,
          type,
          year,
          pricePerSqm,
          price,
          size,
          address
        });
      }

      await sleep(DELAY_BETWEEN_PAGES);
    } catch (e) {
      console.warn(`Error fetching ${url}:`, e.message);
      errors++;
      await sleep(DELAY_BETWEEN_PAGES);
    }
  }

  // Step 3: Output results
  console.log(`\n=== RESULTS ===`);
  console.log(`Fetched: ${fetched}, Errors: ${errors}, Valid: ${results.length}`);

  const lines = results.map(r =>
    `${r.neighborhood}|${r.city}|${r.type}|${r.year}|${r.pricePerSqm}|${r.price}|${r.size}|${r.address}`
  );
  const csv = ['neighborhood|city|type|year|pricePerSqm|price|size|address', ...lines].join('\n');

  // Copy to clipboard (lines only, for appending)
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    console.log('✅ Copied to clipboard (without header)');
  } catch (e) {
    console.warn('Clipboard failed — use the downloaded file');
  }

  // Download
  const blob = new Blob([csv], { type: 'text/csv' });
  const dlUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = dlUrl;
  const cityName = results[0]?.city || 'unknown';
  const typeName = results[0]?.type === 'K' ? 'KT' : results[0]?.type === 'R' ? 'RT' : 'OKT';
  a.download = `etuovi-${cityName}-${typeName}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(dlUrl);

  // Summary
  const byNbhd = {};
  const withYear = results.filter(r => r.year > 1800).length;
  for (const r of results) {
    byNbhd[r.neighborhood] = (byNbhd[r.neighborhood] || 0) + 1;
  }

  console.log(`\nWith construction year: ${withYear}/${results.length} (${Math.round(withYear/results.length*100)}%)`);
  console.log(`Unique neighborhoods: ${Object.keys(byNbhd).length}`);

  // Show neighborhoods sorted by count
  const sortedNbhds = Object.entries(byNbhd).sort((a, b) => b[1] - a[1]);
  console.log('\nListings per neighborhood:');
  for (const [name, count] of sortedNbhds.slice(0, 30)) {
    console.log(`  ${name}: ${count}`);
  }
  if (sortedNbhds.length > 30) {
    console.log(`  ... and ${sortedNbhds.length - 30} more neighborhoods`);
  }

  return results;
})();
