# Neliöt — hinta-arvioalgoritmin kuvaus

Tämä dokumentti kuvaa, miten Neliöt-sovelluksen rakennuskohtainen hinta-arvio lasketaan. Algoritmi tuottaa €/m² arvion jokaiselle Suomen asuinrakennukselle yhdistämällä julkisesti saatavilla olevaa dataa.

## Yhteenveto

Algoritmi laskee jokaiselle rakennukselle €/m² arvion postinumeroalueen perushinnasta, jota muokataan kuudella kertoimella ja korjataan lopuksi hintatason mukaan:

```
raw_estimate = perushinta × ikä × energia × vesistö × kerrokset × koko × naapurusto
estimated_price = raw_estimate × hintahaarukan_korjaus
```

Tarkkuus out-of-sample-validoinnissa (3 258 Etuovi-ilmoituksen hold-out-joukko, jota ei käytetä kalibrointiin, 2026-11):
- **Keskimääräinen poikkeama: +3 %**
- **Mediaani absoluuttinen poikkeama: 13 %**, 55 % arvioista osuu ±15 % sisään

Etuovi-pyyntihinnat ovat tyypillisesti 5–10 % yli toteutuneista kauppahinnoista, joten todellinen tarkkuus toteutuneita hintoja vasten on noin +5 % parempi.

## 1. Perushinta (€/m²)

Perushinta lasketaan jokaiselle postinumerolle ja talotyypille etukäteen tauluun, josta sekä kartta että rakennuspaneeli lukevat saman luvun. Harvan datan alueilla pelkkä yhden vuoden keskiarvo on satunnaiskohinaa (3–8 kauppaa), joten:

1. **Oma estimaatti** — kolmen viimeisen vuoden kaupat painotettuna kauppamäärällä ja tuoreudella, vanhemmat vuodet korjattuna Tilastokeskuksen hintaindeksillä nykytasoon
2. **Vertailutaso** — lähipostinumeroiden hinnat (painotettu kauppamäärällä ja etäisyyden neliöllä) yhdistettynä kuntatason hintaan (Tilastokeskus kunnittain, omakotitaloille Maanmittauslaitoksen kuntataso)
3. **Kutistus** — lopullinen perushinta on näiden painotettu keskiarvo: `(n × oma + k × vertailutaso) / (n + k)`, missä n on alueen kauppamäärä ja k talotyyppikohtainen vakio (kerrostalo 10, rivitalo 8, omakotitalo 6). Alue, jolla on 80 kauppaa, pitää oman hintansa; alue, jolla on 4 kauppaa, nojaa 60 % vertailutasoon.
4. **Talotyyppikaskadi** — jos talotyypille ei ole lainkaan kauppoja, hinta johdetaan saman alueen muista talotyypeistä (omakotitalo ← rivitalo × 1,00 ← kerrostalo × 0,75; rivitalo ← kerrostalo × 0,85). Omakotitalon perushinta rajataan välille 0,75–1,40 × saman alueen rivitalohinta.

Perushinnan lähde (oma data / kutistettu / lähialueet / kuntataso / johdettu) näytetään rakennuspaneelissa, ja epävarmemmat lähteet leventävät hintahaarukkaa.

**Datalähteet:**
- **Kerrostalo ja rivitalo:** Tilastokeskus StatFin (postinumeroittain 13mu, kunnittain 13mx, hintaindeksi 13mq)
- **Omakotitalo:** Maanmittauslaitoksen kauppahintarekisteri (kiinteistökauppojen mediaanit postinumeroittain ja kunnittain / talojen mediaaniala Ryhti-rekisteristä, 293 postinumeroa, 2018–2026)

## 2. Ikäkerroin (U-käyrä)

Sekä uusin että vanhin rakennuskanta saa preemion. 1960–80-luvun elementtitalot ovat halvimpia.

| Ikä | Kerroin | | Ikä | Kerroin |
|---|---|---|---|---|
| Uusi (≤0v) | 1,55 | | ≤50v | 0,86 |
| ≤5v | 1,47 | | ≤60v | **0,82** ← halvin |
| ≤10v | 1,32 | | ≤70v | 0,80 |
| ≤20v | 1,18 | | ≤80v | 0,85 |
| ≤30v | 1,00 | | ≤100v | 0,88 |
| ≤40v | 0,90 | | >100v | 0,88 |

Kalibroitu Etuovi-dataa vasten 2026-04: uudisrakentamisen kertoimet nostettu 60 %, koska StatFin-perushinnat sekoittavat uudet ja vanhat kaupat samaan keskiarvoon, mikä laimentaa uudisten preemion.

## 3. Energiakerroin (A–G)

Aalto-yliopiston tutkimukseen perustuva: A=1,08, D=1,00, G=0,90.

**Ei tällä hetkellä aktiivinen** — Ryhti-rekisteri ei sisällä energiatodistuksia (data on ARA:n erillisessä rekisterissä, ei avoimesti saatavilla). Kaikki rakennukset saavat kertoimen 1,00. Logiikka on koodissa valmiina aktivoitavaksi heti kun data saadaan.

## 4. Vesistökerroin

Etäisyys lähimpään merenrantaan tai järveen (>1 ha). Lampia, jokia ja altaita ei huomioida. Etäisyys lasketaan EPSG:3067-projektiossa (metrinen, ETRS-TM35FIN).

| Etäisyys | Kerroin |
|---|---|
| ≤10 m | 1,35 (oma ranta) |
| ≤20 m | 1,28 |
| ≤50 m | 1,20 |
| ≤100 m | 1,13 |
| ≤200 m | 1,07 |
| ≤500 m | 1,03 |
| >500 m | 1,00 |

## 5. Kerroskerroin

- **Rivitalo:** 1-kerroksinen 1,05, 2-kerroksinen 1,00
- **Kerrostalo:** ≥8 krs 1,03, ≥5 krs 1,01, alle 5 krs 1,00

## 6. Kokokerroin

- **Kerrostalo** (asuntomäärän mukaan): ≥60 = 0,97, ≥30 = 1,00, ≥10 = 1,02, <10 = 1,04
- **Omakotitalo** (pohjapinta-ala × kerrokset): >300 m² = 0,92, >200 = 0,96, >100 = 1,00, ≤100 = 1,03
- **Rivitalo:** 1,00 (kokovaihtelu pieni)

Asuntomäärä haetaan Ryhti-rekisteristä (kattavuus 91 %).

## 7. Markkinakalibrointi ja naapurustokerroin

Etuovi-ilmoituksista (80 % opetusjoukko, 20 % jätetään validointiin) lasketaan kaksi asiaa:

**Markkinakalibrointi** talotyypeittäin: pyyntihintojen ja perusarvioiden mediaanisuhde (2026-11: kerrostalo 1,10, rivitalo 1,06, omakotitalo 1,01). Se kerrotaan perushintaan kaikilla alueilla — myös niillä, joilta ei ole ilmoituksia.

**Naapurustokerroin** postinumeroittain ja talotyypeittäin poikkeamana kalibroidusta tasosta:
```
raaka = avg(pyyntihinnat) / (kalibrointi × avg(perusarviot))
kerroin = 1 + (raaka − 1) × n / (n + 5)
```
Pieni otos kutistuu kohti 1,0 (yksi ilmoitus säilyttää 17 % poikkeamasta, 20 ilmoitusta 80 %). Rajataan välille [0,50, 1,50]. 1 467 kerrointa nykyisessä tietokannassa, keskiarvo 1,03 (18 kehyskuntaa mukana marraskuusta 2026).

Suurimmat poikkeamat ovat uudisalueita (Jätkäsaari 0,58: perushinta koostuu jo uusista kaupoista, joten ikäkerroin tuplaisi preemion) ja halpoja lähiöitä (1,3–1,4).

## 8. Premium-vaimennus (vanhat rakennukset)

Vanhoissa rakennuksissa premium-postinumeron preemiota vaimennetaan: 1920-luvun talo ei myy 2020-luvun uudistuotantohinnoilla, vaikka olisi Ullanlinnassa.

- Ikäkerroin ≥ 0,85 → ei vaimennusta
- Ikäkerroin = 0,70 → 50 % vaimennus naapurustopreemiosta
- Lineaarinen näiden välillä

Vain naapurustokerrointa vaimennetaan, ja vain kun se on yli 1,0. Alennukset (alle 1,0) säilyvät täysinä — vanhat talot halvoissa lähiöissä pysyvät halpoina.

## 9. Hintahaarukan korjaus (S-käyrä)

Lopuksi raakahinta korjataan tasokohtaisesti. Korjauskertoimet lasketaan opetusjoukon jäännöksistä raakahintakoreittain (mediaani pyyntihinta / raakahinta), eikä niitä aseteta käsin.

| Raakahinta | Kerroin (2026-11) |
|---|---|
| ≤1500 €/m² | 1,00 |
| 2000 | 0,98 |
| 4000 | 1,00 |
| 6000 | 0,98 |
| ≥8000 €/m² | 0,96 |

Kutistetun perushinnan ja markkinakalibroinnin jälkeen korjaus on käytännössä tasainen; aiempi käsin asetettu alapään alennus (0,92) ja yläpään preemio (1,06) osoittautuivat datan valossa väärän suuntaisiksi. Lähialueisiin tai kuntatasoon perustuville perushinnoille alapään korjausta ei sovelleta.

## Tärkeimmät rajoitukset

1. **Energiatodistuksia ei käytetä** — data ei ole avointa, joten kaikki saavat kertoimen 1,00. Tämä jättää huomiotta arvioidusti 5–15 % hintavaihtelusta.

2. **Remonttitasoa ei tunneta** — saneerattu vs. saneeraamaton kerrostalo voivat erota 20–30 %, mutta dataa ei ole saatavilla.

3. **Etuovi = pyyntihinnat** — toteutuneet kauppahinnat ovat tyypillisesti 5–10 % alemmat. Algoritmi siis hieman yliarvioi suhteessa todellisiin kauppoihin (+5 %).

4. **Naapurustokertoimien kattavuus** — vain noin kolmasosa rakennuksista on alueella, jolla on Etuovi-pohjainen aluekerroin. Muille käytetään oletusta 1,0, mikä heikentää tarkkuutta noin 18 % → 12 % alueilla joilla on data.

5. **Datan kattavuus:**
   - Rakennusvuosi: 85 % rakennuksista (OSM 12 % + Ryhti 73 %)
   - Asuntomäärä: 91 % (Ryhti)
   - Kerrosluku: 93 %
   - Hinta-arvio: 98,8 % asuinrakennuksista

## Datalähteet

| Lähde | Sisältö | Lisenssi |
|---|---|---|
| OpenStreetMap (Overpass API) | Rakennusten geometriat | ODbL |
| Maanmittauslaitos Maastotietokanta | Vesistöt, osoitteet | CC BY 4.0 |
| Ryhti-rakennusrekisteri (SYKE) | Rakennusvuosi, kerrokset, asuntomäärä | CC BY 4.0 |
| Tilastokeskus StatFin | Asuntohintatilastot (kerrostalo, rivitalo) | CC BY 4.0 |
| MML kauppahintarekisteri | Omakotitalokauppojen tilastot | CC BY 4.0 |
| Tilastokeskus Paavo | Postinumeroalueiden geometriat ja väestötiedot | CC BY 4.0 |
| Etuovi.fi (manuaalinen otanta) | Validointi ja naapurustokertoimet | — |

## Tarkkuuden ylläpito

Algoritmin kertoimet pidetään ajan tasalla:

1. **Vuosittain:** Markkinahinnat muuttuvat, ikähaarukoiden rajat siirtyvät
2. **Kun StatFin-data päivittyy:** uusi vuosidata vaikuttaa perushintoihin
3. **Kun lisätään uusia kaupunkeja:** kertoimet on kalibroitu Helsinki/Tampere/Turku-datalla
4. **Validointi:** Etuovi-otanta ajetaan algoritmia vasten, raportti tuotetaan automaattisesti

Validointiraportti viimeisin: 2026-03, 87 ilmoitusta, 9 kaupunkia.
