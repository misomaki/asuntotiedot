# Neliöt — Decision Log

> Architectural and product decisions that aren't obvious from the code.
> Newest first. Include the *why*, not just the *what*.

---

## 2026-04: GTM UI-strippaus — fokus selauskokemukseen

**Päätös:** Poistetaan UI:sta markkinapaikka (MarketplaceSignals), autentikaatio (UserMenu), ja AI-haku (Header-integraatio). Backend-infrastruktuuri jätetään paikoilleen uudelleenkytkentää varten. Lisätään kaupunkipaneeli (CityPanel) sivupalkkiin ja hakuvinkkidropdown Headeriin.

**Miksi:** MVP-lanseeraus keskittyy selaus-käyttötapaukseen: kartta, hinta-arviot, aluetilastot. Markkinapaikka ja AI-haku ovat arvokkaita mutta lisäävät monimutkaisuutta ja vaativat vielä viimeistelyä (auth-flow bugit, GDPR-suostumukset). Parempi julkaista riisuttu versio nopeasti ja kerätä palautetta kuin odottaa kaiken valmistumista. Backend pidetään ehjänä jotta uudelleenkytkentä on triviaali.

---

## 2026-04: Kaupunkipaneeli sivupalkkiin (CityPanel)

**Päätös:** Kaupunkihaku avaa CityPanel-overlayn kartalle samaan sidebaariin kuin postinumeroalueet. MapContext saa uuden `selectedCity`-tilan.

**Miksi:** Kaupunkisivut (`/kaupunki/[slug]`) ovat hyödyllisiä mutta siirtävät käyttäjän pois kartalta. Sidebar-paneeli pitää käyttäjän kartalla ja näyttää olennaisimman datan (hintatiedot talotyypeittäin, kalleimmat/edullisimmat naapurustot). Naapuruston klikkaus paneelissa siirtyy suoraan aluetilastoihin. Sama pattern kuin selectedArea → StatsPanel.

---

## 2026-04: AI-haku 2-vaiheinen arkkitehtuuri

**Päätös:** Claude Haiku parsii luonnollisen kielen → strukturoidut filtterit, sitten palvelin hakee rakennukset SQL:llä.

**Miksi:** Suora LLM→SQL olisi epäluotettava ja tietoturvariskit (injection). Kaksivaiheisuus: LLM tuottaa vain JSON-filtterit, SQL-haku on deterministinen ja turvallinen. Haiku 4.5 riittävän nopea (<1s) ja halpa.

---

## 2026-04: Recalibrated age factors — uudisrakentamisen 60% boost

**Päätös:** Nostetaan ≤0v faktorista 1.10 → 1.55, ≤5v 1.08 → 1.47 jne. Samalla vanhat (>80v) lasketaan.

**Miksi:** StatFin-perushinnat yhdistävät uudet ja vanhat kaupat samalla postinumerolla → uudispreemio laimenee perushintaan. Validointi näytti -25% aliarvioinnin uudiskohteissa. Vanha >80v korjaus koska +9% yliarviointi jugend/arkkitehtuurikohteissa.

---

## 2026-03: Ei municipality-median-fallbackia neighborhood factoreille

**Päätös:** Neighborhood factor -lookup: area+type → area+'all' → 1.0. Ei kuntatason mediania.

**Miksi:** Tampere KT mediaani 1.12 laskettiin vain 3 alueesta → vääristäisi kaikkia Tampereen alueita joilla ei omaa factoria. Parempi käyttää 1.0 (neutraali) kuin harhainen mediaani. Municipality-mediaani käytetään VAIN base price -fallbackissa (eri asia).

---

## 2026-03: Vesistöetäisyys vain järvet >1ha ja meri

**Päätös:** Suodatetaan pois lammet, joet, altaat, tekojärvet. Vain järvet >1ha ja meri vaikuttavat hintaan.

**Miksi:** Pienet lammet ja joet eivät nosta asuntojen hintoja merkittävästi. Alkuperäinen 4716 vesistöä sisälsi paljon pieniä kohteita jotka tuottivat harhaanjohtavia "lähellä vesistöä" -merkintöjä. Suodatuksen jälkeen 858 vesistöä, realistisemmat premium-kertoimet.

---

## 2026-03: Warm/cool color separation — hintavärit vs basemap

**Päätös:** Basemap = viileä spektri (harmaat, siniset, vihreät). Hintavärit = lämmin spektri (ivory→amber→pink). Eivät koskaan sekoitu.

**Miksi:** Aikaisemmin hintaskaalassa oli vihreä (halpa) → punainen (kallis), mikä sekoittui basemapin puistoihin ja vesistöihin. Lämmin skaala erottuu selkeästi viileästä kartasta kaikilla zoom-tasoilla.

---

## 2026-03: Premium dampening vanhoille rakennuksille

**Päätös:** Kun age_factor < 0.85, neighborhood-faktorin (>1.0) vaikutusta vaimennetaan lineaarisesti (max 50%).

**Miksi:** Premium-alueen (esim. Eira, kerroin 1.40) vanha 60-luvun elementtitalo ei saa samaa premium-kerrointa kuin uudiskohde. Vanha talo premium-alueella on arvokkaampi kuin sama talo lähiössä, mutta ero on pienempi. Discount-faktorit (<1.0) eivät vaimene — halvan alueen vanhat talot pitävät täyden alennuksen.

---

## 2026-03: Neobrutalistinen design-linja

**Päätös:** 2px mustat reunat, hard shadow, border-radius 12px, leikkisä mutta datapainotteinen.

**Miksi:** Erottuu geneerisistä kiinteistöpalveluista (Oikotie, Etuovi). Kohderyhmä: data-orientoituneet asunnonetsijät jotka arvostavat läpinäkyvyyttä. Neobrutalismi viestii "ei piiloteta mitään" ja sopii avoimeen dataan.

---

## 2026-02: Voronoi-tessellation IDW-interpoloinnilla (ei postinumeroaluerajoja)

**Päätös:** Käytetään d3-delaunay Voronoi-soluja IDW-interpoloinnilla postinumeroalueiden choropleth-kartan sijaan.

**Miksi:** Postinumeroalueet luovat keinotekoisia hintahyppyjä rajoilla. Voronoi + IDW tuottaa sileän gradienttikartan joka heijastaa paremmin todellisia hinta-alueita. ~15 000 solua Helsingissä riittävän tiheä sileälle vaikutelmalle.

---

## 2026-02: OSM-rakennukset Overpass API:lla → MML-siirtymä kesken

**Päätös:** Alkuperäinen lähde: OSM Overpass API (script 03). Korvaava: MML Maastotietokanta (script 03b, 5.4M rakennusta, 3m tarkkuus, virallinen data).

**Miksi:** Overpass oli nopea käynnistys (ei GDAL:ia, ~700K rakennusta). MML on parempi pitkällä aikavälillä: kattavampi (koko Suomi), tarkempi geometria, virallinen luokittelu. Siirtymä odottaa migraatio 028:n ajamista (deduplikointi).

---

## 2026-02: Ryhti-rekisteri rakennusvuoden ensisijaiseksi lähteeksi

**Päätös:** OSM:n `start_date` (~12% kattavuus) → Ryhti `completion_date` (~73% kattavuus) → puuttuva (~15%).

**Miksi:** OSM:ssa harva rakennusvuosi (crowdsourced). Ryhti (SYKE) on virallinen rakennusrekisteri, kattaa melkein kaikki rakennukset. 50m proximity matching riittävän tarkka (sentrodi vs sentrodi), paitsi tiheässä kaupunkiympäristössä jossa voi osua viereiseen rakennukseen.

---

## 2026-01: Supabase + PostGIS (ei oma PostgreSQL)

**Päätös:** Käytetään Supabase-hostattua PostgreSQL:ää PostGIS-laajennoksella.

**Miksi:** Nopea käynnistys (hosted, free tier riittää MVP:hen), sisäänrakennettu auth, RLS, realtime. PostGIS spatial-funktiot (ST_Contains, ST_DWithin, MVT-tiilet) kriittisiä karttasovellukselle. Supabase JS client + RPC-funktiot riittävät — ei tarvita erillistä ORM:ia.

---

## 2026-01: MapLibre GL JS (ei Mapbox)

**Päätös:** MapLibre GL JS + CartoCDN Positron basemap (free, no token).

**Miksi:** Mapbox vaatii API-tokenin ja on maksullinen suurilla käyttömäärillä. MapLibre on avoin forkkaus (BSD-lisenssi), CartoCDN Positron on ilmainen ja visuaalisesti sopiva (hillitty, ei kilpaile datanäkymän kanssa). Säästää kustannuksia ja vähentää vendor lock-in.
