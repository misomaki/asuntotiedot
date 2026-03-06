# Asuntokartta – Agenttien ohjeistukset

## Yleiskatsaus

Tämä kansio sisältää erikoistuneiden AI-agenttien ohjeistukset Asuntokartta-projektin kehittämiseen. Jokainen agentti hallitsee oman osa-alueensa ja sisältää konkreettisia koodimalleja, parhaita käytäntöjä ja teknisiä spesifikaatioita.

## Agentit

| Agentti | Tiedosto | Vastuualue |
|---|---|---|
| 🗺️ Kartta-asiantuntija | `map-specialist.md` | Mapbox GL JS, geospatiaali-visualisoinnit, karttainteraktiot, suorituskyky |
| 🎨 UI/UX-suunnittelija | `ui-ux-designer.md` | Design system, väripaletti, typografia, komponenttityylit, animaatiot, esteettömyys |
| 🗄️ Data-insinööri | `data-engineer.md` | Supabase/PostGIS, API-suunnittelu, datalähteet, hinta-arvioalgoritmi, välimuisti |
| 🧪 QA/Testaus | `qa-tester.md` | Yksikkötestit, E2E-testit, suorituskyky, esteettömyys, datan validointi |
| ⚡ Fullstack-integraattori | `fullstack-integrator.md` | Next.js-arkkitehtuuri, tilanhallinta, tyypit, virhekäsittely, deployment |

## Käyttö

### Claude Code / Cowork
Viittaa agenttitiedostoon kontekstissa:
```
Käytä agents/map-specialist.md -ohjeistusta ja toteuta kartan choropleth-taso.
```

### Cursor
Projektin `.cursorrules`-tiedosto latautuu automaattisesti. Se viittaa näihin agentteihin ja sisältää tiivistetyt säännöt.

### Windsurf / Muut AI-työkalut
Kopioi relevantin agentin sisältö työkalun kontekstiin tai liitä se custom rules -kenttään.

## Agenttien yhteistyö

```
                    ┌─────────────────────┐
                    │   ⚡ Fullstack       │
                    │   Integraattori      │
                    │   (koordinoi)        │
                    └──────────┬──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                     │
  ┌───────┴───────┐   ┌───────┴───────┐   ┌────────┴───────┐
  │ 🗺️ Kartta     │   │ 🎨 UI/UX     │   │ 🗄️ Data       │
  │ Specialist    │   │ Designer      │   │ Engineer       │
  └───────────────┘   └───────────────┘   └────────────────┘
          │                    │                     │
          └────────────────────┼─────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │   🧪 QA/Testaus     │
                    │   (validoi kaikki)  │
                    └─────────────────────┘
```

### Tyypillinen workflow

1. **Fullstack-integraattori** määrittelee rakenteen ja tyypit
2. **Data-insinööri** rakentaa API:n ja tietokantakyselyt
3. **Kartta-asiantuntija** toteuttaa karttavisualisoinnin
4. **UI/UX-suunnittelija** viimeistelee ulkoasun ja interaktiot
5. **QA/Testaus** validoi kokonaisuuden
