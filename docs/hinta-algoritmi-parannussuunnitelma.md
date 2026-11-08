# Suunnitelma: hinta-arvioiden tarkkuuden parantaminen

Päivätty 2026-11-08. Perustuu tietokannan nykytilaan (kyselyt ajettu 2026-11-08), validointiraporttiin 2026-05-04 ja 147 käyttäjäpalautteeseen.

## 1. Tilannekuva – mitä data kertoo

### 1.1 Mihin rakennuskanta painottuu

| Talotyyppi | Hinnoiteltuja rakennuksia | Osuus |
|---|---|---|
| Omakotitalo | 167 174 | 62 % |
| Kerrostalo | 65 178 | 24 % |
| Rivitalo | 35 722 | 13 % |

Omakotitalot hallitsevat, erityisesti lähiöissä ja kehyskunnissa. OKT-arvion laatu ratkaisee käyttäjän luottamuksen.

### 1.2 Tarkkuus on heikentynyt keväällä 2026

| Raportti | Mean Δ% | Mean \|Δ%\| | OKT Mean Δ% | OKT Std |
|---|---|---|---|---|
| 2026-04-03 | +2 % | 17 % | +4 % | 23 % |
| 2026-05-04 | +10 % | 23 % | +24 % | 40 % |

Syy näkyy rivitasolla: KHR-pohjaiset OKT-perushinnat korvasivat RT-fallbackin. Esimerkiksi Vartiokylän perushinta nousi 3 148 → 5 245 €/m², ja 1962 rakennettu talo arvioitiin 4 406 €/m² kun pyyntihinta oli 1 960 €/m² (+125 %).

### 1.3 Perushinnat lepäävät pienillä otoksilla

| Talotyyppi | Alueita | n < 6 kauppaa | n 6–19 | n ≥ 20 |
|---|---|---|---|---|
| Kerrostalo | 464 | 0 | 160 | 304 |
| Rivitalo | 573 | 0 | 354 | 219 |
| Omakotitalo | 270 | 154 | 108 | 8 |

OKT-perushinnan "uusin vuosi" on 39 alueella vuoden 2026 osavuosidata (30 näistä alle 5 kauppaa) ja yli 20 alueella yksittäinen vuosi väliltä 2000–2016. OKT/RT-hintasuhde vaihtelee 0,31–2,55, kun uskottava haarukka on noin 0,8–1,3. Perushinta on siis monilla alueilla yhden pienen otoksen satunnaiskohinaa, ja kaikki kertoimet kerrotaan tällä kohinalla.

### 1.4 Kehyskunnat ovat katveessa

| Kunta | Rakennuksia | Alue tuoreella hintadatalla | Naapurustokerroin |
|---|---|---|---|
| Kaarina | 7 965 | 100 % | 0 % |
| Nokia | 6 235 | 26 % | 0 % |
| Ylöjärvi | 5 749 | 97 % | 0 % |
| Raisio | 5 360 | 100 % | 0 % |
| Kempele | 4 662 | 100 % | 0 % |
| Pirkkala | 3 755 | 100 % | 0 % |
| Kangasala | 1 944 | 13 % | 0 % |
| Laukaa, Liminka, Hämeenkyrö | 2 187 | 0 % | 0 % |
| Oulu | 29 232 | 100 % | 58 % |

Naapurustokerroin kattaa 68 % rakennuksista, mutta ei yhtäkään kehyskuntaa. Kertoimen keskiarvo siellä missä se on olemassa on 1,08–1,19. Se tarkoittaa, että peruskaava aliarvioi järjestelmällisesti noin 10–15 %, ja naapurustokerroin korjaa tämän vain yhdeksässä Etuovi-kaupungissa. Kehyskunnissa aliarvio jää voimaan.

### 1.5 Käyttäjäpalaute vahvistaa aliarvion halvoissa hintaluokissa

147 ääntä, 113 äänestäjää. Jakauma: liian matala 53 %, oikein 23 %, liian korkea 24 %.

| Arvio €/m² | Liian matala | Oikein | Liian korkea |
|---|---|---|---|
| 1 000–2 000 | 26 | 1 | 2 |
| 2 000–3 000 | 28 | 11 | 8 |
| 3 000–4 000 | 13 | 10 | 1 |
| 4 000–5 000 | 4 | 5 | 11 |
| yli 5 000 | 6 | 7 | 13 |

Nokia: 13 "liian matala", 2 "oikein", 0 "liian korkea". Omistajilla on taipumus pitää arviota liian matalana, mutta vinouma ei selitä 26:1 suhdetta halvimmassa luokassa. Nykyinen S-käyrä antaa alle 1 500 €/m² hinnoille 8 % lisäalennuksen eli työntää juuri tätä luokkaa väärään suuntaan. Kalliissa luokissa yliarvio dominoi, mikä sopii yhteen OKT-regression kanssa.

### 1.6 Validointi mittaa väärää asiaa

- Validointiosoitteet ovat samassa `_etuovi_staging`-taulussa, josta naapurustokertoimet lasketaan (8 tarkistetusta osoitteesta 6 löytyi). Raportoitu tarkkuus on in-sample ja optimistinen.
- 87 kohdetta, kolme kaupunkia, ei yhtään kehyskuntaa. Juuri se segmentti, josta valitukset tulevat, ei ole mukana.
- Etuovi-aineistossa on 17 218 ilmoitusta, mutta 5 617 (33 %) on ilman area_id:tä, joten kolmannes datasta jää käyttämättä sekä kertoimissa että validoinnissa.
- Naapuri-interpolointi (Phase 1.5) painottaa vain etäisyyttä, ei kauppamääriä.

## 2. Juurisyyt tiivistettynä

1. **Perushinta ilman kutistusta.** Pienen otoksen keskiarvoa käytetään sellaisenaan. Harvalla alueella kohina on ±30 %.
2. **OKT-perushinnan johtaminen on hauras.** KHR-mediaani (kokonaishinta, tontti mukana) jaettuna Ryhti-keskialalla, yksi vuosi kerrallaan, osavuosi 2026 mukana täydellä painolla.
3. **Kertoimet on kalibroitu kolmen kaupungin pyyntihinnoilla ja viety koko maahan.** Keskimääräinen vinouma elää naapurustokertoimessa eikä perustasossa, joten alueet ilman kerrointa jäävät aliarvioiduiksi.
4. **Validointi ei ole hold-out eikä kata ongelmasegmenttiä.** Regressio keväällä jäi huomaamatta kahdeksi kuukaudeksi.
5. **Epävarmuutta ei näytetä rehellisesti.** Kunnan mediaaniin perustuva arvio näyttää samalta kuin 80 kaupan alue.

## 3. Parannukset vaiheittain

### Vaihe A – korjaa pahimmat vuodot nykyisellä datalla (1–2 viikkoa)

**A1. Hierarkkinen kutistus perushinnoille.**
Korvaa "uusin vuosi, tarkka osuma tai fallback" -logiikka painotetulla yhdistelmällä:

```
base = (n_area × p_area + k × p_parent) / (n_area + k)
```

missä `p_parent` on seuraavan tason hinta (naapurit IDW → kunta → seutukunta) ja `k` talotyyppikohtainen prioripaino (ehdotus KT 10, RT 8, OKT 6). Alue, jolla on 80 kauppaa, pysyy käytännössä ennallaan. Alue, jolla on 4 kauppaa, saa kaksi kolmasosaa painostaan naapureilta. Poolaa lisäksi kolme viimeistä vuotta indeksikorjattuna (StatFin 15is tai 13mq kuntatason indeksi), uusin vuosi suurimmalla painolla. Vuoden 2026 osavuosi tulee mukaan painolla n, ei "uusimpana totuutena".

**A2. OKT-perushinnan uudelleenrakennus** (`11-compute-khr-okt-prices.ts`).
- Poolaa KHR 2023–2026 indeksikorjattuna, älä käytä yhtä vuotta.
- Käytä samasta API:sta saatavia tasoja HILA5X5 → HILA10X10 → Kunta fallbackina ennen RT×1,00-oletusta. Tasot ovat jo indikaattorin 2313 aluejaoissa.
- Käytä talon alana Ryhti-mediaania keskiarvon sijaan ja tarkista `total_area_sqm`-kentän määritelmä (kerrosala vs. huoneistoala, ero 15–20 %).
- Sido OKT/RT-suhde uskottavaan haarukkaan [0,75, 1,40] tai käytä suhdetta priorina kutistuksessa.
- Tallenna `base_price_source` ja `base_price_n` rakennukselle, jotta vaikutus voidaan mitata ja näyttää.

**A3. Siirrä keskimääräinen vinouma perustasoon.**
Laske kaupunkikohtainen (tai talotyyppikohtainen) kalibrointivakio Etuovi-datasta ja kerro perushinta sillä. Naapurustokerroin muuttuu poikkeamaksi tästä tasosta ja kutistetaan kohti 1,0 otoskoon mukaan:

```
factor_shrunk = 1 + (factor − 1) × n / (n + 5)
```

Tämä poistaa kehyskuntien 10–15 % aliarvion ilman uutta dataa ja tekee low-confidence-kertoimista käyttökelpoisia.

**A4. S-käyrä data-ajetuksi.**
Laske korjaus binnatyistä jäännöksistä (hold-out, ks. B1) jokaisen kalibrointikierroksen jälkeen skriptillä, ei käsin. A1–A3 todennäköisesti poistavat tarpeen alapään alennukselle kokonaan. Nykyinen 0,92 alle 1 500 €/m² on palautteen valossa väärään suuntaan.

**A5. IDW painottaa myös kauppamääriä.** `get_nearby_area_prices`: paino `n / d²`, vain saman talotyypin data, ja palauta summa-n, jotta A1 voi käyttää sitä.

**A6. Korjaa Etuovi-matchaus.** 5 617 ilmoitusta ilman area_id:tä. Matchaa osoite MML-osoiteaineistolla (`_mml_address_staging` on jo tietokannassa) tai postinumerolla. Tämä kasvattaa naapurustokertoimien otoksia 50 % ja nostaa Oulun kattavuuden.

Koskee tiedostoja: uusi migraatio `040_shrinkage_base_price.sql` (korvaa 038:n `compute_building_price`), `priceEstimation.ts`, `supabaseDataProvider.ts`, `validate-prices.ts`, `09-compute-neighborhood-factors.ts`, `11-compute-khr-okt-prices.ts`. Skeemamuutokset (`base_price_source`, `base_price_n`) vaativat erillisen hyväksynnän.

### Vaihe B – validointi kuntoon (2–4 viikkoa, osin rinnakkain A:n kanssa)

**B1. Hold-out-validointi.** Jaa Etuovi-aineisto 80/20 alueittain ositettuna. Naapurustokertoimet lasketaan vain opetusosasta, raportti test-osasta. Metriikat: mediaani |Δ|, osuus ±15 % sisällä, ja erittely kaupungeittain, talotyypeittäin, hintaluokittain ja perushintalähteittäin (area / idw / kunta). Ilman tätä ei voi tietää, paraneeko mikään.

**B2. Laajenna Etuovi-keräys kehyskuntiin.** Scraper on olemassa (`etuovi-scraper.js`). Lisää Nokia, Kangasala, Ylöjärvi, Pirkkala, Lempäälä, Kaarina, Raisio, Lieto, Kempele, Kirkkonummi, Sipoo, Hollola, Siilinjärvi, Laukaa, Liminka. Tavoite 2 000+ ilmoitusta kehyskunnista. Tämä antaa sekä naapurustokertoimet että validointidatan segmentille, joka nyt valittaa.

**B3. Palautteesta diagnostiikkaa.** Lisää widgettiin valinnainen kenttä "Mikä olisi mielestäsi oikea neliöhinta?" ja rooli (omistaja / ostaja / välittäjä). Käytä äänijakaumaa hintaluokittain ja kunnittain regressiotestinä, ei suorana kalibrointisignaalina. Kommenttikenttä on tähän asti tyhjä kaikissa 147 äänessä, joten pelkkä vapaateksti ei toimi.

**B4. Validointi osaksi uudelleenlaskentaa.** Skripti `05-compute-building-prices.ts` ei saa ajaa ennen kuin hold-out-raportti on tuotettu ja verrattu edelliseen. Raporttihistoria talteen (`scripts/validation/history/`). Kevään regressio olisi näkynyt heti.

### Vaihe C – uudet datalähteet (1–3 kuukautta)

| Lähde | Mitä antaa | Mihin ongelmaan | Saatavuus |
|---|---|---|---|
| **StatFin 13mx** (kunnittain, 301 kuntaa, 2006–2023) | KT/RT €/m² ja kauppamäärät kaikille kunnille | Kuntatason prior kutistukseen; 308 kunnasta vain ~107:llä on nyt hintadataa | Avoin, sama PxWeb-API |
| **StatFin 15is** (87 aluetta, neljännesvuosittain, 2025=100) | Hintaindeksi ja keskineliöhinta ajantasaisena | Vanhojen vuosien indeksikorjaus (A1, A2), kuluvan neljänneksen taso | Avoin |
| **StatFin 15iv** (21 aluetta) | Neliöhinnan ala- ja yläkvartiili | Hintahaarukan leveyden kalibrointi alueittain | Avoin |
| **StatFin 12dg** (27 osa-aluetta, 2015–2025) | Uusien osakeasuntojen €/m² | Uudispreemio kaupunkikohtaiseksi (nyt globaali 1,47–1,55, joka osuu Helsingissä mutta ei Hervantajärvellä: +40 %) | Avoin |
| **MML KHR HILA5X5 / HILA10X10 / Kunta** | OKT-kauppojen mediaanit hilaruuduittain | OKT-fallback harvoille postinumeroille, erityisesti haja-asutus (`rural`) | Avoin, sama API, jo tuettu importissa |
| **Ryhti: lämmitystapa, rakennusaine, julkisivu** | Rakennuksen laatusignaali | Energiakertoimen korvike (öljy/sähkö vs. kaukolämpö/maalämpö), puu vs. kivi OKT:ssa | Avoin; sarakkeet `heating_method`, `construction_method` ovat jo skeemassa mutta 0 % täytettyjä. Tarkista, kuuluvatko kentät avoimeen aineistoon |
| **Paavo sosioekonominen data + amenity-etäisyydet** | Mediaanitulo, koulutus, omistusasumisaste, etäisyys kouluun/kauppaan/joukkoliikenteeseen | Naapurustokertoimen **ennustaminen** alueille ilman Etuovi-dataa (regressio: kerroin ~ tulot + etäisyys keskustaan + palvelut + ikärakenne) | Jo tietokannassa (`area_socioeconomics`, `min_distance_to_*`), ei käytetä hinnoittelussa |
| **KVKL asuntojen.hintatiedot.fi / Hintaseurantapalvelu** | Toteutuneet asunto-osakekaupat 12 kk: hinta, kunto, energialuokka, hissi, kerros, rakennusvuosi, postinumero | Ainoa lähde, joka antaa toteutuneet hinnat + kunto + energialuokka postinumerotasolla. Ratkaisisi remontti- ja energiakertoimet | robots.txt kieltää hakusivujen automaattisen haun, joten ei scrapeta. Neuvoteltava datalisenssi KVKL:n kanssa (maksullinen) |
| **Energiatodistusrekisteri (ARA)** | Energialuokka rakennuksittain | Energiakerroin aktivoituu (nyt 0 % kattavuus) | Julkinen haku, ei bulk-rajapintaa. Tietopyyntö rekisterinpitäjälle |
| **StatFin asvu (vuokrat)** | Vuokrataso postinumero- tai osa-aluetasolla | Järkevyystarkistus harvoille alueille (hinta ≈ vuokra × tuottokerroin) | Avoin, toissijainen |

Suositeltu järjestys: 13mx + 15is + KHR-hilat ensin (kaikki samasta kahdesta API:sta, jotka ovat jo käytössä), sitten Paavo-pohjainen naapurustokertoimen imputointi, sitten Ryhti-kentät. KVKL-lisenssi on strateginen päätös erikseen.

### Vaihe D – malliarkkitehtuuri (3–6 kuukautta)

**D1. Käsin viritetyistä kertoimista hedoniseen regressioon.** Sovita yksi malli (log €/m² ~ postinumeron satunnaisvaikutus + ikä-spline + koko + talotyyppi + vesistö + palveluetäisyydet + sosioekonomiset muuttujat) Etuovi-, KHR- ja StatFin-aineistoon. Postinumeron satunnaisvaikutus on juuri se kutistus, jota A1 ja A3 tekevät käsin, mutta estimoituna datasta. Malli eksportoidaan kerrointauluksi, jota nykyinen SQL-funktio lukee. Kolmen paikan synkronointiongelma (TS, SQL, validointi) poistuu, kun kertoimet ovat dataa eivätkä koodia.

**D2. Epävarmuus näkyviin.** Hintahaarukka määräytyy perushintalähteen ja otoskoon mukaan: suora alue n ≥ 20 noin ±8 %, kutistettu tai IDW ±15 %, kunta ±25 %. Paneeliin lause "Perustuu 4 kauppaan postinumerossa 37130 ja Nokian keskihintaan". Käyttäjä hyväksyy epätarkan arvion, jos palvelu kertoo sen itse. Vaatii `base_price_source`- ja `base_price_n`-sarakkeet (A2).

## 4. Mittarit ja tavoitteet

| Mittari | Nyt | Tavoite 3 kk | Tavoite 6 kk |
|---|---|---|---|
| Hold-out mediaani \|Δ\|, suuret kaupungit | ei mitattu (in-sample 23 %) | ≤ 15 % | ≤ 12 % |
| Hold-out mediaani \|Δ\|, kehyskunnat | ei mitattu | ≤ 20 % | ≤ 15 % |
| Osuus arvioista ±15 % sisällä | ei mitattu | ≥ 50 % | ≥ 60 % |
| OKT Mean Δ% | +24 % | ±5 % | ±5 % |
| Palaute "oikein"-osuus | 23 % | 35 % | 45 % |
| Palaute liian matala : liian korkea | 53 : 24 | 35 : 30 | tasapaino |
| OKT-perushinta yhdestä vuodesta n < 5 | 100+ aluetta | 0 | 0 |
| Rakennuksia, joilla tallennettu perushintalähde ja n | 0 % | 100 % | 100 % |

## 5. Ehdotettu järjestys

| Viikko | Tehtävä | Riippuvuus |
|---|---|---|
| 1 | B1 hold-out-validointi + A6 Etuovi-matchaus | – |
| 1–2 | A1 kutistus + A5 IDW-painotus (migraatio 040 + TS) | B1 mittaamista varten |
| 2 | A2 OKT-perushinta uusiksi (poolaus, KHR-hilat, suhderajaus) | A1 |
| 2–3 | A3 vinouma perustasoon + naapurustokertoimen kutistus | A1, A6 |
| 3 | A4 S-käyrä data-ajetuksi; uudelleenlaskenta; TILE_VERSION | A1–A3, B1 |
| 3–4 | B2 kehyskuntien Etuovi-keräys; B3 palautewidget | – |
| 4–6 | C: 13mx + 15is + KHR-hilat importit | A1 (prior-tasot) |
| 6–10 | C: Paavo-pohjainen naapurustokertoimen imputointi; Ryhti-lisäkentät | B1 |
| 10+ | D1 hedoninen malli, D2 epävarmuus UI:hin | kaikki edellä |

Vaiheen A jälkeen pitäisi näkyä: OKT-vinouma pois, kehyskuntien aliarvio pois, harvojen alueiden hajonta pienempi. Ilman vaihetta B tätä ei kuitenkaan voi todistaa, joten B1 tehdään ensin.
