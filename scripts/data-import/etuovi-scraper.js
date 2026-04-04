/**
 * Etuovi.fi Browser Console Scraper
 *
 * HOW TO USE:
 * 1. Go to etuovi.com and search for listings in a city
 *    Example URLs:
 *    - Helsinki KT: https://www.etuovi.com/myytavat-asunnot?haku=M1959089465
 *    - Set filters: city, property type (kerrostalo/rivitalo/omakotitalo)
 *    - Set sort: newest first or by area
 *
 * 2. Open browser Developer Tools (F12 or Cmd+Option+I)
 *
 * 3. Paste this entire script into the Console tab and press Enter
 *
 * 4. The script will:
 *    - Scrape all listings on the current page
 *    - Auto-navigate to next pages until all are collected
 *    - Copy results to clipboard in pipe-delimited format
 *    - Also download as a CSV file
 *
 * 5. Append the output to scripts/data-import/etuovi-listings.csv
 *
 * IMPORTANT: Run separate searches for each city + property type combo:
 *   - Helsinki + Kerrostalo
 *   - Helsinki + Rivitalo
 *   - Helsinki + Omakotitalo
 *   - Tampere + Kerrostalo
 *   - ... etc for all 9 cities
 *
 * TARGET: ~20-30 listings per neighborhood for high-confidence factors
 */

(async function scrapeEtuovi() {
  const DELAY_MS = 2000; // Delay between page loads to be polite
  const MAX_PAGES = 50;  // Safety limit

  const results = [];
  let pageNum = 0;

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function extractListingsFromPage() {
    const listings = [];

    // Etuovi listing cards - try multiple selectors for robustness
    const cards = document.querySelectorAll('[class*="ListPage__cardContainer"], [data-testid="result-card"], .result-card, [class*="ResultList"] a[href*="/kohde/"]');

    if (cards.length === 0) {
      // Fallback: try to find listing links
      const links = document.querySelectorAll('a[href*="/kohde/"]');
      console.log(`Found ${links.length} listing links (fallback selector)`);
    }

    console.log(`Found ${cards.length} listing cards on page`);

    for (const card of cards) {
      try {
        const text = card.textContent || '';
        const href = card.querySelector('a[href*="/kohde/"]')?.href || card.href || '';

        // Extract address - usually the main heading/title
        const addressEl = card.querySelector('h4, h3, [class*="title"], [class*="address"], [class*="Address"]');
        const address = addressEl?.textContent?.trim() || '';

        // Extract location (neighborhood, city)
        const locationEl = card.querySelector('[class*="location"], [class*="Location"], [class*="area"]');
        const locationText = locationEl?.textContent?.trim() || '';

        // Parse neighborhood and city from location like "Kallio, Helsinki"
        let neighborhood = '';
        let city = '';
        const locationParts = locationText.split(',').map(s => s.trim());
        if (locationParts.length >= 2) {
          neighborhood = locationParts[0];
          city = locationParts[locationParts.length - 1];
        } else if (locationParts.length === 1) {
          neighborhood = locationParts[0];
        }

        // Extract price
        const priceMatch = text.match(/(\d[\d\s]+)\s*€/);
        const price = priceMatch ? parseInt(priceMatch[1].replace(/\s/g, '')) : 0;

        // Extract size (m²)
        const sizeMatch = text.match(/([\d,]+)\s*m²/);
        const size = sizeMatch ? parseFloat(sizeMatch[1].replace(',', '.')) : 0;

        // Extract construction year
        const yearMatch = text.match(/(?:rv\.|rakennettu|rak\.?\s*v\.?|valmistumisvuosi)\s*(\d{4})/i)
          || text.match(/(\d{4})\s*(?:\/\s*\d{4})?/g);
        let year = 0;
        if (yearMatch) {
          // Find a plausible construction year (1800-2030)
          const candidates = text.match(/\d{4}/g) || [];
          for (const c of candidates) {
            const y = parseInt(c);
            if (y >= 1800 && y <= 2030) {
              year = y;
              break;
            }
          }
        }

        // Extract property type
        let type = 'K'; // default kerrostalo
        const lowerText = text.toLowerCase();
        if (lowerText.includes('omakotitalo') || lowerText.includes('erillistalo')) {
          type = 'O';
        } else if (lowerText.includes('rivitalo') || lowerText.includes('paritalo') || lowerText.includes('ketjutalo')) {
          type = 'R';
        } else if (lowerText.includes('kerrostalo') || lowerText.includes('luhtitalo')) {
          type = 'K';
        }

        // Calculate price per sqm
        const pricePerSqm = size > 0 && price > 0 ? Math.round(price / size) : 0;

        if (price > 0 && size > 0 && neighborhood) {
          listings.push({
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
      } catch (e) {
        console.warn('Failed to parse card:', e);
      }
    }

    return listings;
  }

  // Extract from current page
  console.log('=== Etuovi Scraper Starting ===');
  console.log('Extracting from current page...');

  const currentListings = extractListingsFromPage();
  results.push(...currentListings);
  console.log(`Page 1: ${currentListings.length} listings`);

  // Try to navigate to next pages
  for (let page = 2; page <= MAX_PAGES; page++) {
    // Find "next page" button
    const nextBtn = document.querySelector('[aria-label="Seuraava sivu"], [class*="next"], button[class*="Next"], a[class*="next"]')
      || [...document.querySelectorAll('button, a')].find(el =>
        el.textContent?.trim() === '›' ||
        el.textContent?.trim() === 'Seuraava' ||
        el.getAttribute('aria-label')?.includes('next')
      );

    if (!nextBtn || nextBtn.disabled) {
      console.log(`No more pages (stopped at page ${page - 1})`);
      break;
    }

    nextBtn.click();
    await sleep(DELAY_MS);

    const pageListings = extractListingsFromPage();
    if (pageListings.length === 0) {
      console.log(`Empty page ${page}, stopping`);
      break;
    }

    results.push(...pageListings);
    console.log(`Page ${page}: ${pageListings.length} listings (total: ${results.length})`);
  }

  // Format as pipe-delimited CSV (matching existing format)
  const header = 'neighborhood|city|type|year|pricePerSqm|price|size|address';
  const lines = results.map(r =>
    `${r.neighborhood}|${r.city}|${r.type}|${r.year}|${r.pricePerSqm}|${r.price}|${r.size}|${r.address}`
  );
  const csv = [header, ...lines].join('\n');

  // Copy to clipboard
  try {
    await navigator.clipboard.writeText(lines.join('\n')); // No header for appending
    console.log('\n✅ Copied to clipboard (without header, ready to append)');
  } catch (e) {
    console.warn('Clipboard copy failed, use download instead');
  }

  // Download as file
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const cityName = results[0]?.city || 'unknown';
  const typeName = results[0]?.type || 'X';
  a.download = `etuovi-${cityName}-${typeName}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  // Summary
  console.log('\n=== RESULTS ===');
  console.log(`Total listings: ${results.length}`);

  const byCity = {};
  const byType = {};
  const withYear = results.filter(r => r.year > 1800).length;
  for (const r of results) {
    byCity[r.city] = (byCity[r.city] || 0) + 1;
    byType[r.type] = (byType[r.type] || 0) + 1;
  }
  console.log('By city:', byCity);
  console.log('By type:', byType);
  console.log(`With construction year: ${withYear}/${results.length} (${Math.round(withYear/results.length*100)}%)`);
  console.log(`\nYear=0 listings: ${results.length - withYear}`);

  if (results.length - withYear > results.length * 0.1) {
    console.warn('\n⚠️  WARNING: Many listings missing construction year!');
    console.warn('The search result cards may not show the year.');
    console.warn('Consider using the detail-page scraper instead (slower but more reliable).');
  }

  return results;
})();
