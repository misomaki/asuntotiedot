# CLAUDE.md – Asuntokartta-sovellus

## Projektin kuvaus

Interaktiivinen web-karttasovellus, jossa käyttäjät voivat tarkastella suomalaisten alueiden asuntojen hinta-arvioita, ikärakennetta ja muita rakennettuun ympäristöön liittyviä tilastotietoja karttanäkymässä. Sovellus laskee oman algoritminsa ja avoimesti saatavilla olevan tilastotiedon perusteella hinta-arvion jokaiselle asuinrakennukselle.

## Teknologiapino

| Kerros | Teknologia |
|---|---|
| Frontend framework | Next.js 14 (App Router) |
| UI-kirjasto | React 18 |
| Karttakirjasto | MapLibre GL JS + react-map-gl/maplibre (free, no token) |
| Tyylit | Tailwind CSS + shadcn/ui |
| Backend/API | Next.js Route Handlers |
| Tietokanta | PostgreSQL via Supabase |
| ORM | Supabase JS client + PostGIS |
| Autentikaatio | Supabase Auth (tarvittaessa) |
| Deployment | Vercel |

## Prioriteetit

1. **UI/UX design** – Sovelluksen on oltava visuaalisesti vaikuttava, intuitiivinen ja karttainteraktiot sujuvia
2. **Nopea kehitys / MVP** – Toimiva perustoiminnallisuus ennen optimointia
3. **Koodin laatu ja testaus** – Komponentit selkeitä, logiikka eroteltuna
4. **Suorituskyky** – Optimointi vasta kun MVP toimii
5. Hinta-arvio on mahdollisimman realistinen, ja on validoitu oikeaa dataa vasten.

## Design-periaatteet

- **Sävy:** Neobrutalistinen — leikkisä, rohkea, datapainotteinen
- **Väripaletti:** Valkoinen tausta, pastelli-aksentit (pink #ff90e8, yellow #ffc900, mint #23c8a0). Hintaskaala: ivory→amber→pink (lämmin spektri, ei vihreitä — basemap omistaa viileät sävyt)
- **Typografia:** Libre Franklin (display 900), DM Sans (body), IBM Plex Mono (data)
- **Komponentit:** 2px mustat reunat, hard shadow (4px 4px 0px #1a1a1a), border-radius 12px
- **Mikro-liikkeet:** neo-press (nappi painuu), neo-lift (kortti nousee), stagger pop-in, price counter roll-up
- **Kartta edellä:** Kartta vie 70–80% näkymästä, UI-elementit kelluvat päälle
- **Kelluvien elementtien sijoittelu:** Kartan päällä kelluvat UI-elementit (legend, zoom hint, loading indicator, header) eivät saa mennä päällekkäin — tarkista aina ettei uusi/siirretty elementti osu toisen päälle, erityisesti mobiilissa
- **Mobiili-saavutettavuus:** Kaikki interaktiiviset elementit ≥44px kosketusalue mobiilissa, teksti vähintään `text-sm` (14px). Mobiilissa `h-10` (40px) painikkeille ja syötteille, desktop voi olla kompaktimpi (`h-9`)
- **Mobiili huomioitu:** Responsive, mutta desktop-first koska data-rikkaat näkymät

## Kansiorakenne

```
/app
  /page.tsx                           # Päänäkymä (kartta + attribution)
  /api
    /areas/route.ts                   # Alueet GeoJSON
    /areas/[id]/route.ts              # Yksittäisen alueen tilastot
    /buildings/route.ts               # Rakennukset bbox:n sisällä (zoom ≥14)
    /buildings/[id]/route.ts          # Yksittäisen rakennuksen tiedot
  /components
    /map/
      MapContainer.tsx                # Pääkarttakomponentti (Voronoi + rakennukset)
    /sidebar/
      Sidebar.tsx                     # Sivupaneelin container
      StatsPanel.tsx                  # Alueen tilastot
      BuildingPanel.tsx               # Rakennuksen hinta-arvio + tekijäerittely
      ComparisonPanel.tsx             # Alueiden vertailu
      TrendChart.tsx                  # Hintakehitysgraafit
    /ui/                              # shadcn/ui komponentit
  /lib
    /dataProvider.ts                  # DataProvider factory (Supabase / Mock)
    /supabaseDataProvider.ts          # Oikea Supabase-implementaatio
    /supabaseClient.ts                # Supabase server client
    /voronoiGenerator.ts              # Voronoi-generointi (irrotettu)
    /priceEstimation.ts               # Rakennuskohtainen hinta-algoritmi (6 faktoria)
    /cities.ts                        # Kaupunkikonfiguraatiot (single source of truth)
    /formatters.ts                    # Numero- ja hintaformatointi
    /colorScales.ts                   # Hintaväripaletit (Voronoi + rakennukset)
    /mockData.ts                      # Mock-data fallback
  /types
    /index.ts                         # TypeScript-tyypit
  /hooks
    /useMapData.ts                    # Aluedatan hakeminen kartalle
    /useBuildingData.ts               # Rakennusdatan hakeminen (viewport-aware)
  /contexts
    /MapContext.tsx                    # Kartan tila (valittu alue, rakennus, filtterit)

/scripts
  /data-import/
    01-import-paavo-areas.ts          # Postinumeroalueet + väestötiedot
    02-import-statfin-prices.ts       # Asuntohinnat PxWeb API:sta
    03-import-buildings.ts            # Rakennukset OpenStreetMapista
    04-import-water-bodies.ts         # Vesistöt (etäisyyslaskenta)
    05-compute-building-prices.ts     # Rakennuskohtaiset hinta-arviot
    06-enrich-from-ryhti.ts           # Rikastus Ryhti-rakennusrekisteristä (SYKE)
    07-classify-buildings.ts          # Rakennusluokittelu (residential/non-residential)
    09-compute-neighborhood-factors.ts # Aluekertoimien laskenta Etuovi-datasta
    /config.ts                        # Kaupungit, postinumeroprefixet
    /lib/supabaseAdmin.ts             # Admin-client importeille
    /lib/pxwebClient.ts               # PxWeb API helper

/supabase
  /migrations/001_initial_schema.sql  # PostGIS-skeema + RPC-funktiot
  /migrations/002_building_functions.sql # Spatial join, vesistöetäisyys, hintafunktiot
  /migrations/003_ryhti_enrichment.sql   # Ryhti staging-taulu + matchaus-funktiot
  /migrations/006_municipality_price_fallback.sql # Kuntatasoinen hintafallback
  /migrations/007_building_classification.sql     # Rakennusluokittelu + MVT-päivitys
  /migrations/008_validated_price_factors.sql     # Validoidut hintafaktorit (2026-03 Etuovi) — korvattu 015:llä
  /migrations/009_neighborhood_factors.sql        # Aluekertoimet (neighborhood_factors) + _etuovi_staging
  /migrations/015_energy_size_factors.sql         # Energy+size faktorit, päivitetty compute_building_price() + match_ryhti_energy_apartment_batch
  /migrations/016_recalibrated_age_factors.sql    # Uudelleenkalibroidut ikäkertoimet (uudisrakentaminen boosted)
  /migrations/017_recalibrated_water_factors.sql  # Uudelleenkalibroidut vesistökertoimet (7-tasoinen, max 1.35)
  /migrations/018_fix_nonresidential_denylist.sql  # Laajennettu ei-asuinrakennusten denylist (supermarket, library, stadium, jne.)

/scripts
  /validation/
    validate-prices.ts                # Hinta-arvioiden validointiskripti
    etuovi-raw-data.md                # Etuovi-vertailudata (92 kohdetta)
    price-validation-2026-03.md       # Validointiraportti
```

## Tietokantarakenne (Supabase / PostGIS)

```sql
-- Alueet (postinumerot, kaupunginosat)
CREATE TABLE areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_code TEXT UNIQUE NOT NULL,       -- postinumero tai tunniste
  name TEXT NOT NULL,
  municipality TEXT,
  geometry GEOMETRY(MultiPolygon, 4326), -- PostGIS polygoni
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hinta-arviot per alue per ajanjakso
CREATE TABLE price_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID REFERENCES areas(id),
  year INT NOT NULL,
  quarter INT,                           -- 1–4 tai NULL
  price_per_sqm_avg NUMERIC,            -- €/m² keskiarvo
  price_per_sqm_median NUMERIC,
  transaction_count INT,
  property_type TEXT,                   -- 'kerrostalo' | 'rivitalo' | 'omakotitalo'
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rakennuskanta ja ikärakenne
CREATE TABLE building_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID REFERENCES areas(id),
  year INT NOT NULL,
  buildings_total INT,
  avg_building_year INT,
  pct_pre_1960 NUMERIC,
  pct_1960_1980 NUMERIC,
  pct_1980_2000 NUMERIC,
  pct_post_2000 NUMERIC,
  avg_floor_count NUMERIC
);

-- Väestörakenne
CREATE TABLE demographic_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID REFERENCES areas(id),
  year INT NOT NULL,
  population INT,
  median_age NUMERIC,
  pct_under_18 NUMERIC,
  pct_18_64 NUMERIC,
  pct_over_65 NUMERIC,
  avg_household_size NUMERIC
);
```

## API-endpointit

| Endpoint | Metodi | Kuvaus |
|---|---|---|
| `/api/areas` | GET | Kaikki alueet geometrioineen (GeoJSON), query: `year`, `propertyType` |
| `/api/areas/[id]` | GET | Yksittäisen alueen kaikki tilastot, query: `year` |
| `/api/buildings` | GET | Rakennukset bounding boxin sisällä, query: `west,south,east,north,year` |
| `/api/buildings/[id]` | GET | Yksittäisen rakennuksen tiedot + hinta-arvioerittely |

## Ympäristömuuttujat

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
# Kartta: MapLibre + CartoCDN Positron – ei vaadi API-tokenia
```

## Datalähteet ja API:t – tekniset muistiinpanot

### Tilastokeskus Paavo WFS
- URL: `https://geo.stat.fi/geoserver/postialue/ows`
- typeName: `postialue:pno_tilasto`
- **Kenttänimet:** `postinumeroalue` (EI `posti_alue`), `nimi`, `kunta` (koodi, esim. "091" = Helsinki)
- Kuntanimeä EI ole datassa – tarvitaan oma lookup-taulu kuntakoodeille
- **Väestöikäryhmät:** Ei valmiita `he_0_14` tai `he_65_` kenttiä. Lasketaan yksittäisistä ikäryhmistä: `he_0_2`, `he_3_6`, `he_7_12`, `he_13_15`, `he_16_17`, `he_18_19`, ..., `he_85_`
- Geometria voi olla `Polygon` tai `MultiPolygon` – normalisoitava MultiPolygoniksi

### Tilastokeskus StatFin PxWeb
- URL: `https://pxdata.stat.fi/PXWeb/api/v1/fi/StatFin/ashi/statfin_ashi_pxt_13mu.px`
- POST-pyyntö, JSON query body, vastaus json-stat2
- **Talotyyppi-koodit:** `1` = yksiöt, `2` = kaksiot, `3` = kolmiot+, `5` = rivitalot (EI `0` tai `4`)
- Kerrostalohinta = painotettu keskiarvo tyypeistä 1,2,3 kauppamäärillä
- Solurajaus: max 100 000 solua per pyyntö. Jaa vuosien mukaan jos ylittyy.
- Rate limit: 30 pyyntöä / 10 sekuntia
- **Metriikka-koodit:** `keskihinta_aritm_nw` (hinta), `lkm_julk20` (kauppamäärä)

### Supabase-huomiot
- `.rpc()` palauttaa `{ data, error }` – EI tue `.catch()` kuten tavalliset Promiset
- `price_estimates`-taulussa on vain `price_per_sqm_avg` (StatFinistä). `price_per_sqm_median` on NULL. Frontendissä fallback: `median ?? avg`
- Composite unique key `price_estimates`: `(area_id, year, quarter, property_type)` – quarter on NULL vuositason datassa

### DataProvider-pattern
- `getDataProvider()` factory: jos `NEXT_PUBLIC_SUPABASE_URL` on asetettu → `SupabaseDataProvider`, muuten → `MockDataProvider`
- Molemmat implementoivat saman `DataProvider`-interfacen

### Hinta-arvioalgoritmi (rakennuskohtainen)
```
estimated_price = base_price × age_factor × energy_factor × water_factor × floor_factor × size_factor × neighborhood_factor
(* water ja neighborhood faktorit vaimennetaan vanhoille rakennuksille, ks. dampenPremium)
```
Katso tarkka kuvaus: **Hinta-arvioiden tarkkuuden ylläpito** -osiossa alempana.

## Claude-ohjeet tässä projektissa

### Mitä Claude SAA tehdä itsenäisesti

- Luoda ja muokata komponentteja `/app/components/` alla
- Kirjoittaa Supabase-kyselyjä ja API-routeja
- Ehdottaa UX-parannuksia ja toteuttaa ne
- Lisätä Tailwind-tyylejä ja animaatioita
- Refaktoroida koodia selkeämmäksi

### Mitä Claude EI tee ilman lupaa

- Muuttaa tietokantaskeemaa (migraatiot)
- Lisätä uusia npm-paketteja
- Muuttaa Next.js-konfiguraatiota
- Poistaa olemassa olevia tiedostoja

### Koodityyli

- TypeScript kaikkialla, `any`-tyyppi kielletty
- Funktionaaliset komponentit + hooks, ei class-komponentteja
- Server Components oletuksena, `'use client'` vain tarvittaessa
- Virhekäsittely kaikissa API-kutsuissa
- Kommentit suomeksi tai englanniksi – tärkeintä on selkeys

### UI/UX painotettuna
- Selkeä design-filosofia, väripaletti hintahaarukalle, animaatio-ohjeet ja esteettömyysvaatimukset

### Karttakomponentit

- Kartta renderöidään aina client-puolella (`'use client'`)
- Geometriat haetaan GeoJSON-muodossa ja optimoidaan zoom-tasoittain
- Käytä `useMemo` raskaiden laskentojen optimointiin
- Älä renderöi karttaa SSR:llä

### Kartta-arkkitehtuuri ja visualisointi

- **Basemap:** CartoCDN Positron (free, no token) – `positron-gl-style` with quiet neutral overrides
- **Voronoi-tessellation:** Hintavisualisointi käyttää d3-delaunay Voronoi-soluja IDW-interpoloinnilla, EI postinumeroalueita
- **Voronoi = terrain-taso:** Voronoi renderöidään ALLA basemap-elementtien (`beforeId="water"`). Vesistöt, rakennukset, tiet ja labelit piirtyvät Voronoin PÄÄLLE
- **Tiheys:** Voronoi-solujen tulee olla erittäin tiheitä (~15 000 Helsinki, ~2 700 muut) jotta värigradietti näyttää sileältä
- **EI solurajoja:** Voronoi-solujen välillä EI saa olla outline/border-viivoja. Käytä `fill-antialias: false` Voronoi-layerissä
- **Kerrosjärjestys basemapissa:** background → landcover → landuse → park → boundary → **VORONOI FILL** → water → building → roads → labels → **BUILDING FILL** (zoom ≥14)
- **IDW-interpolointi:** Smooth price gradients anchor-pisteiden välillä (power=2)
- **Rakennuskerros:** Yksittäiset rakennukset näkyvät zoom ≥14. Väri hinta-arvion mukaan: ivory→amber→rose→pink (sama lämmin sävyalue kuin Voronoi, mutta syvempi/terävämpi). Klikkaus avaa BuildingPanel-sivupaneelin.
- **Interaktio:** Vain rakennukset ovat interaktiivisia (hover + click). Voronoi EI ole interaktiivinen — ei hover-highlightia, ei klikkiä.

### Basemap-tyylien ylikirjoitus (`handleMapLoad`)

Basemap-infrastruktuurin värit ylikirjoitetaan `handleMapLoad`-callbackissa (`onLoad`). Tämä on kriittinen kokonaisuus — **kaikki** basemapin tielayerit pitää käsitellä, muuten ne näkyvät Positronin oletusväreinä.

**Nykyinen väripaletti (Cool Infrastructure):**
- **Tausta:** Cool paper `#f5f4f2`
- **Tiet:** Cool grey `#b8b6b4`, leveys tietyypin mukaan (0.5–2.5px), ei casings-viivoja
- **Rautatiet:** `#c0bfbd` / `#d0cfcd`, näkyvät zoom 8+
- **Basemap-rakennukset:** Cool grey `#e2e1df`, `fill-antialias: false` (ei outlinea)
- **Vesi:** Deeper blue `#9bbcd4`, vesiväylät `#88b0cc`, labelit `#88a0b4`
- **Labelit:** Cool charcoal `#706c66`
- **Lentokentät:** `aeroway-runway` ja `aeroway-taxiway` tievärillä
- **PERIAATE:** Basemap = viileä spektri (harmaat, siniset, vihreät). Hintavärit = lämmin spektri (ivory→amber→pink). Eivät koskaan sekoitu.

**CartoCDN Positron -layerien nimeämislogiikka (tiet):**
- Muoto: `{konteksti}_{tietyyppi}_{tyyppi}_{ramppi}`
- Konteksti: `road_`, `tunnel_`, `bridge_`
- Tietyyppi: `service`, `path`, `minor`, `sec`, `pri`, `trunk`, `mot`
- Tyyppi: `_fill` (täyttö), `_case` (reunaviiva/casing)
- Ramppi: `_noramp`, `_ramp` (vain pri, trunk, mot)
- **TÄRKEÄÄ:** Tyylitä AINA kaikki kolme kontekstia (road + tunnel + bridge) jokaiselle tietyypille! Jos unohdat tunnel/bridge-variantin, se näkyy mustana viivana zoomattaessa.
- **Rautatiet:** `rail`, `rail_dash`, `tunnel_rail`, `tunnel_rail_dash`
- **Fill-layerit (rakennukset):** `building` (läpinäkyvä pohja) ja `building-top` (näkyvä katto). Molemmat tarvitsevat `fill-antialias: false` tai outline-väri == fill-väri.

### Karttakerrosten väriharmonia (kriittinen)

- **Kolme kerrosta:** Basemap (viileä, recessiivinen) → Voronoi (lämmin terrain wash) → Buildings (lämmin, terävämpi)
- **Voronoi:** Ivory→amber→rose→pink (`PRICE_COLORS` in `colorScales.ts`), opacity 0.7
- **Rakennukset:** Deeper warm fill + color-matched darker outline (`BUILDING_OUTLINE_COLORS`), width 1.2–2.0px, blur 0.4
- **Basemap:** Viileä harmaa/sininen/vihreä — ei kilpaile lämpimien hintavärien kanssa
- Rakennusten outline on saman sävyn tummempi versio (ei musta), esim. amber fill `#debb90` → outline `#887458`
- **KRIITTINEN:** Hintaväreissä EI saa olla vihreitä tai sinisiä sävyjä — ne kuuluvat basemapiin (puistot, vesi, tiet). Hintavärit pysyvät lämpimässä spektrissä (keltainen/oranssi/pinkki).
- Non-residential: quiet grey `#c8c4c0`, no-price: warm neutral `#d8d4d0`
- `get_buildings_in_bbox` RPC suodattaa pois rakennukset joilla ei ole hintaa (`estimated_price_per_sqm IS NOT NULL`) — testaus tällä API:lla ei näytä hinnattomia rakennuksia
- `get_buildings_mvt` (MVT-tiilet) palauttaa KAIKKI rakennukset, myös hinnattomat — kartalla näkyy enemmän rakennuksia kuin GeoJSON-API palauttaa

### `reuseMaps` ja `handleMapLoad` — kehitysympäristön sudenkuoppa

- `reuseMaps`-prop react-map-gl:ssä pitää MapLibre-karttainstanssin moduulitason muuttujassa
- `onLoad`-callback ajetaan **vain kerran** per karttainstanssi, EI joka renderöinnillä
- **Ongelma kehityksessä:** Kun muutat `handleMapLoad`-koodia, Fast Refresh päivittää komponentin mutta cached map instance ei aja uutta `onLoad`-callbackia → basemap-tyylit eivät päivity
- **Ratkaisu:** Kun muutat `handleMapLoad`-koodia, selain täytyy avata **uudessa tabissa/ikkunassa** (pelkkä reload EI riitä koska moduulitason cache säilyy)
- Tuotannossa ei ongelmaa — kartta latautuu aina tuoreena

## MVP:n laajuus (ensimmäinen julkaisu)

- [x] Karttanäkymä Voronoi-tesselloinnilla (terrain-tyylinen)
- [x] Choropleth-visualisointi hinta/m² (IDW-interpoloitu, sileä gradientti)
- [x] Alueen klikkaus → tilastopaneeli (hinnat, rakennuskanta, väestö)
- [x] Aikajanafiltteri (vuosi)
- [x] Asuntotyyppi-filtteri (kerrostalo/rivitalo/omakotitalo)
- [x] Vertailu kahden alueen välillä
- [x] Trendigraafit per alue
- [x] Kävelyscore
- [x] Hakutoiminto (postinumero/aluenimi)
- [x] Oikea data: Tilastokeskus Paavo + StatFin (Supabase + PostGIS)
- [x] Rakennuskerros kartalla (zoom ≥14, klikkaa → hinta-arvio)
- [ ] Mobiiliresponsiivisuus

## Data-import

Import-scriptit ajetaan järjestyksessä. Scriptit 03-04 käyttävät Overpass API:a (ei tarvita GDAL/ogr2ogr eikä lokaaleja tiedostoja).
Migraatio 002 täytyy ajaa Supabase SQL Editorissa ennen scriptejä 03-05.

```bash
# Vaihe 1: Alueet ja hinnat
npx tsx scripts/data-import/01-import-paavo-areas.ts     # ✅ 406 aluetta + 402 väestöä
npx tsx scripts/data-import/02-import-statfin-prices.ts  # ✅ 7373 hintarecordia, 2009-2024

# Vaihe 2: Aja migraatio SQL Editorissa
# supabase/migrations/002_building_functions.sql         # ✅ RPC-funktiot

# Vaihe 3: Rakennukset, vesistöt, hinta-arviot
npx tsx scripts/data-import/03-import-buildings.ts       # ✅ 318 650 rakennusta (Overpass API)
npx tsx scripts/data-import/04-import-water-bodies.ts    # ✅ 4 716 vesistöä (858 järveä+merta jäljellä suodatuksen jälkeen)
npx tsx scripts/data-import/05-compute-building-prices.ts # ✅ ~80 000 rakennusta sai hinta-arvion

# Vaihe 4: Aja migraatio 003 SQL Editorissa
# supabase/migrations/003_ryhti_enrichment.sql         # ✅ Staging-taulu + matchaus

# Vaihe 5: Ryhti-rikastus + hintojen uudelleenlaskenta
npx tsx scripts/data-import/06-enrich-from-ryhti.ts    # ✅ 369 176 Ryhti-rakennusta, 257 021 vuotta matchattu
npx tsx scripts/data-import/05-compute-building-prices.ts # ✅ 141 348 rakennusta sai hinta-arvion

# Vaihe 6: Aja migraatiot 006-007 SQL Editorissa
# supabase/migrations/006_municipality_price_fallback.sql  # ✅ Kuntatasoinen hintafallback
# supabase/migrations/007_building_classification.sql      # ✅ Rakennusluokittelu (residential/non-residential)

# Vaihe 7: Rakennusluokittelu + hintojen uudelleenlaskenta
npx tsx scripts/data-import/07-classify-buildings.ts       # Ryhti purpose + is_residential luokittelu
npx tsx scripts/data-import/05-compute-building-prices.ts  # Hinta-arviot (ei-asuin skipätään)

# Vaihe 8: Aja migraatio 015 SQL Editorissa
# supabase/migrations/015_energy_size_factors.sql          # ✅ Energy+size faktorit, päivitetty compute_building_price()

# Vaihe 9: Ryhti re-enrichment (energy_class + apartment_count) + uudelleenlaskenta
npx tsx scripts/data-import/06-enrich-from-ryhti.ts        # ✅ 454 431 Ryhti-rakennusta, apartment_count 91%
# Resetoi hinnat SQL Editorissa: UPDATE buildings SET estimation_year = NULL, estimated_price_per_sqm = NULL;
npx tsx scripts/data-import/05-compute-building-prices.ts  # ✅ 677 000 rakennusta sai hinta-arvion (6 faktoria)
```

### Datan nykytilanne
- **Alueet:** 406 postinumeroaluetta, 402 väestötietoa
- **Hinnat:** 7 373 hintarecordia (StatFin, 2009-2024)
- **Rakennukset:** ~700 000 (OSM Overpass API)
- **Vesistöt:** 858 (848 järveä >1ha + 10 merta), suodatettu 4 716:sta (lammet, joet, altaat poistettu)
- **Rakennusvuosi:** ~598 000 / ~700 000 (85%) — OSM ~12% + Ryhti ~73%. Loput ~15% eivät matchaa Ryhti-rekisteriin 50m säteellä.
- **Kerrostieto:** ~93% kattavuus
- **Asuntomäärä (apartment_count):** ~636 000 / ~700 000 (91%) — Ryhti-rekisteristä
- **Energialuokka (energy_class):** 0% — Ryhti open data ei sisällä energiatodistuksia. Data on erillisessä energiatodistusrekisterissä (ARA), ei avoimesti saatavilla.
- **Hinta-arvio:** 677 000 / 677 058 (100%) — kuntatasoinen fallback + neighborhood factors + energy/size factors (migraatiot 006, 009, 015)
- **Rakennusluokittelu:** `is_residential` (3-tasoinen: OSM building_type denylist → Ryhti main_purpose → pinta-alaheuristiikka). Denylist-prioriteetti korjattu 2026-03 (migraatio 018).

### Overpass API -huomiot
- Endpoint: `https://overpass-api.de/api/interpreter`, POST, URL-encoded `data`-parametri
- Bbox-formaatti: `(south, west, north, east)` — eri järjestys kuin GeoJSON!
- Rate limit: max 2 rinnakkaista kyselyä, 429/503 → odota ja yritä uudelleen
- Geometria palautuu `[{lat, lon}, ...]` — muunna GeoJSON:iin `[lng, lat]` + sulje rengas

### SYKE Ryhti OGC API Features
- URL: `https://paikkatiedot.ymparisto.fi/geoserver/ryhti_building/ogc/features/v1/collections/open_building/items`
- Avoin data (CC BY 4.0), ei API-avainta
- **Paginaatio:** `startIndex` (EI `offset`!) + `limit`, max ~5000/sivu
- **Koordinaatit:** GeoJSON-vastaus WGS84:ssä (vaikka `point_location_srid: 3067`)
- **Geometria:** Point (ei polygoni) — matchataan OSM-rakennusten centroideihin
- **Deduplikointi:** Sama rakennus voi esiintyä monta kertaa (`permanent_building_identifier`) — pidä vain tuorein (`modified_timestamp_utc`)
- **Hyödylliset kentät:** `completion_date` (valmistumisvuosi), `number_of_storeys`, `main_purpose`, `apartment_count`

### PostGIS-huomiot (opittu)
- `assign_buildings_to_areas()` RPC aikakatkaistaan 318K rakennuksella → aja SQL suoraan SQL Editorissa
- Partial unique index (`WHERE osm_id IS NOT NULL`) EI toimi Supabasen `.upsert({onConflict: 'osm_id'})` kanssa → käytä `.insert()` + muistinsisäinen deduplikointi
- Hinta-arviolaskennassa käytä `estimation_year IS NULL` (EI `estimated_price_per_sqm IS NULL`), koska `compute_building_price()` palauttaa NULL kun ei löydy perushintaa → infinite loop

### Supabase-huomiot (lisää)
- `.rpc()` JSONB-parametrille anna JavaScript-objekti/array, EI `JSON.stringify()` → muuten "cannot extract elements from a scalar"
- Migraatiot täytyy ajaa uudelleen SQL Editorissa jos funktioita muutetaan lokaalisti — tietokannassa on edelleen vanha versio kunnes CREATE OR REPLACE ajetaan
- **KRIITTINEN: Numeeristen kenttien null-tarkistus** — ÄLÄ käytä `value ? Number(value) : null` numeerisille kentille jotka voivat olla 0 (esim. `min_distance_to_water_m`). JS:n falsy-tarkistus tulkitsee `0`:n nulliksi. Käytä aina `value != null ? Number(value) : null`.
- **Supabase CLI:** `npx supabase db query --linked -f <file.sql>` — ajaa SQL:n suoraan remote-tietokantaan. Linkitys: `npx supabase link --project-ref <ref>`. Vaihtoehto: `npx tsx scripts/run-sql.ts <file.sql>` (pg-yhteys, 600s timeout)
- **MVT-tiilikätkö:** Vercel CDN cachettaa rakennustiilet 24h. Hintojen uudelleenlaskennan jälkeen kasvata `TILE_VERSION`-vakiota `MapContainer.tsx`:ssä (moduulitason vakio)
- **getAreaDetails parallelization:** 6 riippumatonta kyselyä (prices, building_stats, demographics, socioeconomics, housing, employment) ajetaan `Promise.all`:lla — EI peräkkäin

### MML (Maanmittauslaitos) INSPIRE Addresses
- URL: `https://beta-paikkatieto.maanmittauslaitos.fi/inspire-addresses/features/v1/collections/addresses/items`
- Avoin data, ei API-avainta
- **Paginaatio:** `next`-linkki (cursor-based), EI `startIndex`. MML double-encodaa bbox `next`-linkissä → `decodeURIComponent()` ennen käyttöä
- **Kentät:** `component_ThoroughfareName` (katu), `locator_designator_addressNumber` (numero), `component_PostalDescriptor` (postinumero)
- Kattavuus: 476K osoitetta → 637K/700K rakennusta matchattu (91%), 50m proximity threshold

### OSM-palveluetäisyydet (amenity distances)
- Overpass API → staging-taulu (`_amenity_staging`) → PostGIS `CROSS JOIN LATERAL` + `ST_DWithin` pre-filter
- 6 tyyppiä: school, kindergarten, grocery, transit, park, health
- `compute_amenity_distance_batch(p_amenity_type, p_column_name, p_limit)` — dynaaminen SQL (`format()` + `EXECUTE`)
- Kattavuus: 554K–699K rakennusta per tyyppi (71–99.7%)

### Paavo-laajennus (sosioekonominen data)
- 3 uutta taulua: `area_socioeconomics` (tulot, koulutus, työllisyys), `area_housing` (hallintamuoto, perhetyyppi), `area_employment` (toimialat NACE)
- Kenttäprefixet Paavo WFS:ssä: `tr_` = tulot, `ko_` = koulutus, `te_` = asuminen, `tp_` = toimialat, `pt_` = perusjako, `ra_` = rakennukset
- 491 aluetta × 3 taulua importoitu

### SEO-sivut
- `/alue/[code]` — ISR 24h, server-rendered area page with dynamic metadata + JSON-LD
- `/alue` — area index grouped by city
- `/sitemap.xml` — dynamic sitemap with all area URLs
- `generateMetadata()` + page component both call `getAreaDetails()` — TODO: deduplicate with React `cache()`

### Kaaviovärit (chart colors)
- `CHART_COLORS` in `colorScales.ts`: dusty pastels for data bars (sage #8cc8b8, sand #e8d098, rose #d4a0b8, violet #b898c0, stone #c8c0b4)
- Brand accent colors (#ff90e8, #ffc900, #23c8a0) reserved for buttons/CTAs — NOT for chart bars (too bright against warm paper bg)
- TrendChart.tsx uses brand accents (kerrostalo=pink, rivitalo=mint, omakotitalo=yellow) — exception, works for line chart

## Hinta-arvioiden tarkkuuden ylläpito

Hinta-arviot validoitiin 2026-03 vertaamalla 87 Etuovi.fi-ilmoituksen pyyntihintoja algoritmimme tuottamiin arvioihin. Tarkkuuden ylläpitäminen edellyttää säännöllistä uudelleenvalidointia ja faktorien päivitystä.

### Nykyinen tarkkuus (baseline 2026-03-21, recalibrated age factors + 6 factors)
- **Mean Δ%:** -5% (aliarviointi), **Median Δ%:** -10%
- **KT:** -6% (n=30), **RT:** -11% (n=28), **OKT:** +1% (n=29)
- **Helsinki:** -7% (n=57), **Tampere:** 0% (n=27), **Turku:** -30% (n=3, vähän dataa)
- **Mean |Δ%|:** 19%, **Std Dev:** 23%
- **Huom:** energy_factor = 1.0 kaikille (ei dataa), size_factor aktiivinen KT:lle (apartment_count 91%)
- **Huom 2:** Etuovi = pyyntihinnat, toteutuneet ~5-10% alemmat → todellinen tarkkuus ~0% vs toteutuneet
- Validointiraportti: `scripts/validation/price-validation-2026-03.md`
- Raakadata: `scripts/validation/etuovi-raw-data.md`
- Etuovi-ilmoitukset (1 134 kpl, 9 kaupunkia): `scripts/data-import/etuovi-listings.csv`
- Neighborhood factors: 221 kpl (58 high, 58 medium, 105 low), avg 1.13

### Kolme paikkaa joissa faktorit elävät (pidä synkassa!)

| Sijainti | Käyttö | Muokkaa kun |
|----------|--------|-------------|
| `app/lib/priceEstimation.ts` | Frontend (BuildingPanel, supabaseDataProvider) | Faktoriarvo muuttuu |
| `supabase/migrations/016_recalibrated_age_factors.sql` | Tietokanta (`compute_building_price()` RPC) — uudelleenkalibroidut ikäkertoimet, korvaa 015:n age factorit | Age factor muuttuu |
| `supabase/migrations/017_recalibrated_water_factors.sql` | Tietokanta (`compute_building_price()` RPC) — 7-tasoinen vesistökerroin (max 1.35), korvaa 016:n water factorit | Water factor muuttuu |
| `supabase/migrations/015_energy_size_factors.sql` | Tietokanta — energy/size faktorit + sarakkeet + match_ryhti_energy_apartment_batch RPC (korvattu 016:lla age factorien osalta) | Energy/size muuttuu |
| `supabase/migrations/008_validated_price_factors.sql` | Tietokanta (vanha `compute_building_price()`) — age/water/floor faktorit | Korvattu 015:llä |
| `supabase/migrations/009_neighborhood_factors.sql` | Tietokanta — neighborhood factor lookup + `_etuovi_staging` + `neighborhood_factors` taulut | Neighborhood factor -logiikka muuttuu |
| `supabase/migrations/011_premium_dampening.sql` | Tietokanta — premium dampening + municipality median fallback | Dampening-logiikka muuttuu |
| `supabase/migrations/012_fix_neighborhood_factor_cascade.sql` | Tietokanta — poistettu municipality median nbhd-faktorista | Neighborhood factor -kaskadi muuttuu |
| `supabase/migrations/013_water_distance_lake_sea_only.sql` | Tietokanta — vesistöetäisyys vain järvet+meri, EPSG:3067 | Vesistösuodatus tai etäisyyslaskenta muuttuu |
| `scripts/validation/validate-prices.ts` | Validointiskripti | Faktoriarvo muuttuu |
| `scripts/data-import/09-compute-neighborhood-factors.ts` | Laskee neighborhood factorit Etuovi-datasta | Factor-laskentalogiikka muuttuu |

**KRIITTINEN:** TypeScript-faktorit (`priceEstimation.ts`) ja SQL-faktorit (migraatiot) PITÄÄ päivittää yhdessä. Jos muutat esim. age factoria TypeScriptissä mutta unohdat SQL-migraation, tietokannassa lasketut arvot ja frontendin laskemat arvot eroavat.

### Ei-asuinrakennusten denylist (pidä synkassa!)

**Single source of truth:** `app/lib/buildingClassification.ts` → `NON_RESIDENTIAL_BUILDING_TYPES`

| Sijainti | Käyttö | Synkronointi |
|----------|--------|--------------|
| `app/lib/buildingClassification.ts` | **TypeScript SSOT** — importataan kaikkialle TS-koodissa | Muokkaa TÄTÄ ensin |
| `supabase/migrations/018_fix_nonresidential_denylist.sql` | SQL `compute_is_residential_batch()` denylist | **Manuaalinen synkronointi** — SQL ei voi importata TS:stä |
| `app/lib/formatters.ts` → `BUILDING_TYPE_LABELS` | Suomenkieliset nimet tooltippeihin | Lisää label uudelle tyypille |
| `scripts/data-import/03-import-buildings.ts` | Import-aikainen suodatus (importtaa SSOT:sta) | Automaattinen |

**KRIITTINEN:** Kun lisäät uuden ei-asuinrakennustyypin:
1. Lisää `buildingClassification.ts` → `NON_RESIDENTIAL_BUILDING_TYPES`
2. Lisää `formatters.ts` → `BUILDING_TYPE_LABELS` (suomenkielinen nimi)
3. Päivitä migraatio 018:n SQL-denylist manuaalisesti (copy-paste)
4. Aja migraatio + reclassify-skripti

**Luokitteluprioriteetit (migraatio 018, korjattu 2026-03):**
1. **OSM building_type denylist** — korkein prioriteetti. Eksplisiittinen tagi on luotettava.
2. **Ryhti main_purpose** — '01%' = asuinrakennus. Proximity-matchaus (50m) voi osua väärin tiheässä ympäristössä.
3. **Pinta-alaheuristiikka** — < 30 m² = apurakennus (ei-asuinkäyttö).
4. **Default: asuinrakennus** — konservatiivinen, ei jätä oikeita taloja pois.

### Neighborhood factor -järjestelmä

- **`_etuovi_staging`**: Etuovi.fi-ilmoitusten raakadata (postal_code, property_type, asking_price_per_sqm, area_id)
- **`neighborhood_factors`**: Lasketut aluekohtaiset kertoimet (area_id, property_type, factor, sample_count, confidence)
- **Lookup-kaskadi** (supabaseDataProvider + SQL + validation, kaikki synkassa):
  1. Tarkka area_id + property_type → factor (sample_count ≥ 3)
  2. Fallback: area_id + 'all' → factor (sample_count ≥ 3)
  3. Final fallback: 1.0
  - **EI municipality-median-fallbackia** nbhd-faktoreille — harvan datan kanssa se vääristää (esim. Tampere KT median 1.12 vain 3 alueesta). Municipality median käytetään VAIN base price -fallbackissa.
- **Luottamustasot:** high (≥5 listingsiä), medium (3-4), low (1-2), default (ei dataa)
- **Clamping:** factor rajataan välille [0.70, 1.50]
- **Päivitys:** Kerää uudet Etuovi-ilmoitukset → `_etuovi_staging` → aja `09-compute-neighborhood-factors.ts`

### OKT_FALLBACK — single source of truth
- Omakotitalon fallback-kertoimet on määritelty `priceEstimation.ts` → `OKT_FALLBACK`-vakiossa
- `supabaseDataProvider.ts` importtaa ja käyttää näitä — ÄLÄ hardkoodaa arvoja sinne
- SQL-migraatiossa sama arvo on toistettava manuaalisesti (ei voi importata TS:stä)

### Milloin uudelleenvalidoida

1. **Vuosittain** — markkinahinnat muuttuvat, age bracket -rajat siirtyvät
2. **Kun StatFin-data päivittyy** — uusi vuosidata voi muuttaa base price -tasoja
3. **Kun lisätään uusia kaupunkeja** — faktorit on kalibroitu Helsinki/Tampere/Turku-datalla
4. **Kun algoritmi muuttuu** — uudet tekijät (esim. energiatodistus, asuinaluetyyppi)

### Validointiprosessi (step-by-step)

```bash
# 1. Kerää vertailudata Etuovista (≥500 kohdetta, kaikki talotyypit, eri kaupungit)
#    Tallenna ilmoitukset: _etuovi_staging -tauluun (Supabase)
#    Tallenna raakadata: scripts/validation/etuovi-raw-data.md

# 2. Laske neighborhood factorit uudelleen
source ~/.nvm/nvm.sh && nvm use 20
npx tsx scripts/data-import/09-compute-neighborhood-factors.ts

# 3. Aja validointiskripti
npx tsx scripts/validation/validate-prices.ts

# 4. Analysoi tulokset (raportti tulostuu terminaaliin + päivittää .md-tiedoston)
#    Tarkasta: Mean Δ%, jakauma talotyypeittäin ja kaupungeittain

# 5. Jos faktorit muuttuvat:
#    a) Päivitä app/lib/priceEstimation.ts (TypeScript-faktorit)
#    b) Luo uusi SQL-migraatio joka päivittää compute_building_price()
#    c) Päivitä scripts/validation/validate-prices.ts (samat faktorit)
#    d) Päivitä tämä CLAUDE.md (algoritmi-kuvaus + baseline-luvut)

# 6. Aja migraatio ja laske hinnat uudelleen:
#    a) Aja uusi SQL-migraatio Supabase SQL Editorissa
#    b) Resetoi: UPDATE buildings SET estimation_year = NULL;
#    c) npx tsx scripts/data-import/05-compute-building-prices.ts
```

### Tunnetut rajoitukset ja kehityskohteet

- **Neighborhood factor -dataa kerättävä lisää:** Tarvitaan ≥5 listingsiä per alue+talotyyppi luotettavaan faktoriin → kerää lisää Etuovi-dataa harvaan peitettyihin alueisiin
- **Vesikerroin validoimaton:** Etuovi-ilmoituksista ei saada vesistöetäisyyttä → water_factor = 1.0 validoinnissa ja factor-laskennassa
- **Pyyntihinnat vs toteutuneet:** Etuovi = asking prices, toteutuneet hinnat ovat ~5-10% alhaisempia → neighborhood factor kompensoi osittain
- **Energiatodistus puuttuu (0% kattavuus):** energy_factor on algoritmissa mutta kaikki arvot 1.0. Ryhti open data ei sisällä energialuokkaa — data on ARA:n energiatodistusrekisterissä (ei avoin). Vaikuttaisi erityisesti 1960-80-luvun rakennusten hintaan.
- **Remonttitaso puuttuu:** Remontoitu 70-luvun talo voi olla kalliimpi kuin remontoimaton 2000-luvun talo
- **Neighborhood factor aikariippuva:** Markkina-alueelliset hintasuhteet muuttuvat — faktorit pitää laskea uudelleen vuosittain

### Hinta-arvioalgoritmin tarkka kuvaus

```
estimated_price = base_price × age_factor × energy_factor × water_factor × floor_factor × size_factor × neighborhood_factor
```

**Base price** = StatFin €/m² (postinumero + vuosi + talotyyppi)
- Omakotitalo fallback: ei omaa StatFin-dataa → rivitalo × OKT_FALLBACK.fromRivitalo (1.10) → kerrostalo × OKT_FALLBACK.fromKerrostalo (0.90)

**Age factor** (U-käyrä, recalibrated 2026-03-21):
```
≤0v: 1.45   (uudistuotanto)      ≤50v: 0.84 (70-luvun elementit)
≤5v: 1.33   (hyvin uusi)         ≤60v: 0.80 (laakso — halvin)
≤10v: 1.22  (tuore)              ≤70v: 0.80 (sodanjälkeinen elpyminen)
≤20v: 1.10  (moderni)            ≤80v: 0.85 (1940-50-luku)
≤30v: 0.97  (kypsyvä)            ≤100v: 0.90 (sotaa edeltävä)
≤40v: 0.90  (ikääntyvä)          >100v: 0.92 (historiallinen, remontoitu)
```
Uudisrakentamisen faktorit nostettu 2026-03 kalibroinnissa: StatFin-perushinnat yhdistävät
uudet+vanhat kaupat → uudispreemio laimenee. Puolittainen korjaus (half-correction) ylisopeuttamisen välttämiseksi.

**Energy factor** (energialuokka A-G, Aalto-yliopiston tutkimus):
- A: 1.08, B: 1.05, C: 1.02, D: 1.00 (baseline), E: 0.97, F: 0.94, G: 0.90, null: 1.00
- Data: Ryhti (SYKE) `energy_class` -kenttä. Kattavuus 0% — Ryhti open data ei sisällä energiatodistuksia (erillinen ARA-rekisteri). Faktori on mukana algoritmissa valmiina, aktivoituu kun data saadaan.
- EI vaimenneta vanhoille rakennuksille (rakennuksen sisäinen ominaisuus)

**Water factor** (vain järvet >1ha ja meri, ei lampia/jokia/altaita, recalibrated 2026-03-21):
≤10m: 1.35 (oma ranta), ≤20m: 1.28 (suora rantapaikka), ≤50m: 1.20 (rantarivi, näkymät),
≤100m: 1.13 (lähellä rantaa), ≤200m: 1.07 (kävelymatka), ≤500m: 1.03 (alueen etu), >500m: 1.00
- Alkuperäinen max 1.15 oli liian konservatiivinen — suomalaiset rantakiinteistöt 25-40% preemio
- Etäisyys lasketaan EPSG:3067 (ETRS-TM35FIN) -projektiossa, Euklidinen metrimatka
- Vesistögeometriat yksinkertaistettu ST_Simplify(0.0005°) ja pre-transformoitu 3067:ään
- Kaikille rakennuksille lasketaan vesistöetäisyys (centroid + PostGIS), ei puuttuvia arvoja

**Floor factor** (talotyyppikohtainen):
- Rivitalo: 1-krs = 1.05 (yksitasoinen premium), 2-krs = 1.00
- Kerrostalo: ≥8 krs = 1.03, ≥5 krs = 1.01, <5 krs = 1.00

**Size factor** (rakennuskoko):
- Kerrostalo (asuntomäärän mukaan): ≥60 = 0.97, ≥30 = 1.00, ≥10 = 1.02, <10 = 1.04
- Omakotitalo (kokonaisala = pohja × kerrokset): >300m² = 0.92, >200m² = 0.96, >100m² = 1.00, ≤100m² = 1.03
- Rivitalo: 1.00 (koko-vaihtelu pieni)
- Data: `apartment_count` Ryhdistä, `footprint_area_sqm` OSM:stä
- EI vaimenneta vanhoille rakennuksille (rakennuksen sisäinen ominaisuus)

**Neighborhood factor** (aluekerroin):
- Laskettu Etuovi.fi-ilmoituksista: `factor = avg(asking_price) / avg(algorithmic_estimate)`
- Ilmoitukset joilla `construction_year = 0/NULL` suodatetaan pois (vääristäisi factoria)
- Lookup: area_id + property_type → area_id + 'all' → 1.0 (ei municipality mediania — vääristäisi)
- Clamping: [0.70, 1.50]
- Minimum sample_count: 3 (low confidence factors ignored in lookup)
- Tyypillinen vaihteluväli: 0.70 (lähiöt) – 1.50 (premium-alueet)

**Premium dampening** (vanhoille rakennuksille):
- Kun `age_factor < 0.85` (rakennettu ennen ~1986), premium-faktoreiden (neighborhood, water > 1.0) vaikutusta vaimennetaan
- `age_factor 0.85` → ei vaimennusta, `age_factor 0.70` → 50% vaimennus
- Kaava: `dampened = 1.0 + (raw - 1.0) * (1.0 - dampening)` missä `dampening = 0.5 * min(1.0, (0.85 - age_factor) / 0.15)`
- Discount-faktorit (< 1.0) eivät vaimene — vanhat rakennukset halvemmilla alueilla pitävät täyden alennuksen
- Implementoitu: `priceEstimation.ts` → `dampenPremium()`, `011_premium_dampening.sql`
- Vaimennetaan: water, neighborhood (sijaintipremiumit). EI vaimenneta: energy, size, floor (rakennuksen sisäiset)

**Municipality fallback:** Käyttää **mediaania** (PERCENTILE_CONT(0.5)), ei keskiarvoa — kestää premium-alueiden vääristymää

## Seuraavat vaiheet

- Vercel-deployment
- Mobiiliresponsiivisuus
- Käyttäjätilit ja suosikkialueet
- Julkinen API
