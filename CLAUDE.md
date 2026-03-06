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

- **Sävy:** Puhdas, asiantunteva, datavisualisointiin optimoitu 
- **Väripaletti:** Tummahko karttatausta, kirkkaat choropleth-värit datalle
- **Typografia:** Monumentteja – selkeä sans-serif datanumerot, hieman persoonallisempi otsikko
- **Kartta edellä:** Kartta vie 70–80% näkymästä, UI-elementit kelluvat päälle
- **Mobiili huomioitu:** Responsive, mutta desktop-first koska data-rikkaat näkymät

## Kansiorakenne

```
/app
  /page.tsx                  # Päänäkymä (kartta)
  /api
    /properties/route.ts     # Asuntodatan API
    /stats/route.ts          # Tilastojen API
  /components
    /map/
      MapContainer.tsx       # Pääkarttakomponentti
      MapLayers.tsx          # Karttatasot (heatmap, choropleth)
      MapControls.tsx        # Zoom, layer-toggle
    /sidebar/
      StatsPanel.tsx         # Tilastopaneeli
      AreaInfo.tsx           # Valitun alueen tiedot
      FilterBar.tsx          # Suodattimet
    /ui/                     # shadcn/ui komponentit
  /lib
    /supabase.ts             # Supabase client
    /mapUtils.ts             # Kartta-apufunktiot
    /dataTransforms.ts       # Datan muunnokset
  /types
    /index.ts                # TypeScript-tyypit
  /hooks
    /useMapData.ts           # Datan hakeminen kartalle
    /useAreaStats.ts         # Aluetilastot

/supabase
  /migrations/               # SQL-migraatiot
  /seed/                     # Testidataa
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
| `/api/areas` | GET | Kaikki alueet geometrioineen (GeoJSON) |
| `/api/areas/[id]` | GET | Yksittäisen alueen kaikki tilastot |
| `/api/prices` | GET | Hinta-arviot (filtteröitävissä) |
| `/api/stats/heatmap` | GET | Heatmap-data kartalle |

## Ympäristömuuttujat

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
# Kartta: MapLibre + CartoCDN Dark Matter – ei vaadi API-tokenia
```

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

- **Basemap:** CartoCDN Dark Matter (free, no token) – `dark-matter-gl-style`
- **Voronoi-tessellation:** Hintavisualisointi käyttää d3-delaunay Voronoi-soluja IDW-interpoloinnilla, EI postinumeroalueita
- **Voronoi = terrain-taso:** Voronoi renderöidään ALLA basemap-elementtien (`beforeId="water"`). Vesistöt, rakennukset, tiet ja labelit piirtyvät Voronoin PÄÄLLE
- **Tiheys:** Voronoi-solujen tulee olla erittäin tiheitä (~15 000 Helsinki, ~2 700 muut) jotta värigradietti näyttää sileältä
- **EI solurajoja:** Voronoi-solujen välillä EI saa olla outline/border-viivoja. Värimuutokset solujen välillä tulevat olla näkymättömiä. Käytä vain fill-layeriä, ei koskaan outline/line-layeriä
- **Kerrosjärjestys basemapissa:** background → landcover → landuse → park → boundary → **VORONOI FILL** → water → building → roads → labels
- **IDW-interpolointi:** Smooth price gradients anchor-pisteiden välillä (power=2)

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
- [ ] Mobiiliresponsiivisuus

## Myöhemmät ominaisuudet (backlog)

- Oikea data (Supabase + PostGIS)
- Käyttäjätilit ja suosikkialueet
- Julkinen API
