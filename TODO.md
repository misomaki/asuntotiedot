# Neliöt — Backlog

> Prioritized product backlog. Update checkboxes as work completes.
> Items move down to **Done** with a date when finished.

## Now

- [ ] **Aja migraatio 032 + re-enrichment** — korjaa kerrostiedot (MML kerrosluku usein väärä, Ryhti ylikirjoittaa nyt):
  1. Aja `supabase/migrations/032_fix_ryhti_floor_matching.sql` SQL Editorissa
  2. `npx tsx scripts/data-import/06-enrich-from-ryhti.ts`
  3. `UPDATE buildings SET estimation_year = NULL;`
  4. `npx tsx scripts/data-import/05-compute-building-prices.ts`
- [ ] Mobiiliresponsiivisuuden viimeistely ja testaus (erityisesti sheet-interaktiot, legend-sijoittelu)
- [ ] Lisää Etuovi-dataa neighborhood factoreihin — harvan datan alueet (68 high, tarvitaan lisää)
- [ ] Cookie consent + GDPR-yhteensopivuus (CookieConsentBanner komponentti kesken)
- [ ] Käyttöehdot- ja tietosuojasivut (`/kayttoehdot`, `/tietosuoja` — tiedostot luotu, sisältö?)
- [ ] Asiakastukisähköpostin (tietosuoja@neliohinnat.fi) lisäys käyttöliittymään (footer, tietosuojasivu)

## Next

- [ ] SEO: OG-kuva (1200x630px) — suurin puuttuva tekijä sosiaalisen median jakamisessa
- [ ] SEO: ISR (`revalidate: 3600`) `force-dynamic`:n tilalle `/alue`-sivuille — parempi välimuistitus Googlebotille
- [ ] SEO: Lähetä sitemap Google Search Consoleen
- [x] MML Tilastopalvelu REST API -integraatio — OKT-toteutuneet kauppahinnat postinumeroittain (avoin, ilmainen, 1 457 aluetta)
- [ ] Ota yhteyttä MML:ään (verkkopalvelu@maanmittauslaitos.fi) uudesta Kiinteistökauppojen kyselypalvelusta (OGC API Features, tuotanto 06/2026) — hae beta-testaajaksi, selvitä käyttölupaehdot
- [ ] Asetukset-sivu (`/asetukset` — luotu, viimeistely) — vaatii auth-UI:n uudelleenkytkennän
- [ ] Markkinapaikka-UI:n uudelleenkytkentä (MarketplaceSignals BuildingPaneliin, UserMenu, AI-haku Header-integraatio)
- [ ] Auth flow: salasanan reset, varmistussähköposti — korjaa ennen marketplace-uudelleenkytkentää
- [ ] Premium-ominaisuuksien paywall (freemium-malli: vertailu, trendit, AI-haku)
- [ ] Markkinapaikan laajentaminen — ostaja-myyjä viestintä
- [ ] Energiatodistusdata (ARA-rekisteri, ei avoin — selvitä saatavuus)
- [ ] Julkinen API (avoin data kolmansille osapuolille)
- [ ] SEO: `generateMetadata()` + page component deduplikointi React `cache()`:lla
- [ ] Lisää kaupunkeja (faktorit kalibroitu Helsinki/Tampere/Turku — laajenna)
- [ ] MML-osoitedatan päivitys (03b-import-buildings-mml.ts kesken)
- [x] Rakennusten deduplikointi (migraatio 028 — jo ajettu, unique constraint paikallaan)
- [ ] Floor area -enrichment (migraatio 029 luotu)

## Later / Ideas

- [ ] Remonttitason arviointi (puuttuva tekijä — vaikuttaa erityisesti 60-80-luvun taloihin)
- [ ] Asuinaluetyyppi-tekijä algoritmiin
- [ ] Capacitor-mobiilisovelluksen julkaisu (App Store / Google Play)
- [ ] Agenttituki markkinapaikalle (kiinteistönvälittäjä-integraatio)
- [ ] Hintakehitysennusteet (ML-malli aikasarjadatalle)
- [ ] Kävelyscore-visualisointi kartalla (amenity-etäisyydet jo tietokannassa)
- [ ] Vertailutoiminnon parantaminen (useampi alue, vienti PDF:ksi)

## Done

- [x] Karttanäkymä Voronoi-tesselloinnilla + IDW-interpolointi (2026-01)
- [x] Supabase-integraatio + oikea StatFin/Paavo data (2026-01)
- [x] Rakennuskerros kartalla zoom ≥14 (2026-01)
- [x] Ryhti-rekisteririkastus (rakennusvuosi 85%, asuntomäärä 91%) (2026-02)
- [x] Rakennusluokittelu + kuntatasoinen hintafallback (2026-02)
- [x] Neobrutalistinen redesign + brändi "Neliöt" (2026-02)
- [x] Neighborhood factors Etuovi-datasta (468 aluetta) (2026-03)
- [x] Premium dampening vanhoille rakennuksille (2026-03)
- [x] Hinta-arvioiden validointi (87 Etuovi-kohdetta, Mean |Δ%| 18%) (2026-03)
- [x] Energy + size faktorit algoritmiin (2026-03)
- [x] Kuntatason choropleth matalilla zoom-tasoilla (2026-03)
- [x] Mobiiliresponsiivisuus (perus: header, sheets, legend, locate) (2026-03)
- [x] PostHog analytics (EU hosting, reverse proxy) (2026-03)
- [x] FAQ-sivu scroll-animaatioilla (2026-03)
- [x] Autentikaatio (Google OAuth + email) (2026-03)
- [x] Markkinapaikkasignaalit (osto-kiinnostus + myynti-ilmoitus) (2026-03)
- [x] AI-haku (luonnollinen kieli → rakennushaku, Claude Haiku 4.5) (2026-04)
- [x] AI-prefilled myynti-/ostotekstit (2026-04)
- [x] Osoitehaku (Nominatim geocoding) (2026-04)
- [x] MML-osoitedatan matchaus rakennuksiin (91% kattavuus) (2026-03)
- [x] Capacitor-konfigurointi iOS/Android (2026-03)
- [x] GTM UI-strippaus — marketplace, auth, AI-haku piilotettu, FAQ päivitetty (2026-04)
- [x] Kaupunkipaneeli sivupalkkiin — kaupunkihaku avaa CityPanel-overlayn kartalle (2026-04)
- [x] Hakuvinkkidropdown — opastaa käyttäjää hakemaan kaupunkeja, postinumeroita, osoitteita (2026-04)
- [x] FAQ: korjattu lähdeosio (OpenStreetMap → MML Maastotietokanta) (2026-04)
