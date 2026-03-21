/**
 * Price Validation Script
 *
 * Compares Etuovi.fi listing asking prices against our estimation algorithm.
 * For each listing, looks up the StatFin base price for the area + property type,
 * applies age/water/floor factors, and computes the delta.
 */

import { supabase } from '../data-import/lib/supabaseAdmin'
import { computeAgeFactor, computeEnergyFactor, computeWaterFactor, computeFloorFactor, computeSizeFactor, dampenPremium, OKT_FALLBACK } from '../../app/lib/priceEstimation'
import { writeFileSync } from 'fs'
import { resolve } from 'path'

// ─── Listing data from Etuovi.fi (2026-03-12) ───────────────────────────────

interface Listing {
  id: number
  address: string
  area: string           // kaupunginosa
  city: string           // Helsinki / Tampere / Turku
  type: 'KT' | 'RT' | 'OKT' | 'PT'
  year: number | null
  floors?: string | null // e.g. "3/3", "11/35"
  sqm: number
  askingPricePerSqm: number
}

const listings: Listing[] = [
  // ── Helsinki Kerrostalo ──
  { id: 1, address: 'Luolavuorentie 46 A', area: 'Luolavuori', city: 'Turku', type: 'KT', year: 1969, sqm: 76, askingPricePerSqm: 2303 },
  { id: 2, address: 'Sepänkatu 1 B 58', area: 'Keskusta', city: 'Turku', type: 'KT', year: 2024, sqm: 61, askingPricePerSqm: 6541 },
  { id: 3, address: 'Sepänkatu 1 B 73', area: 'Keskusta', city: 'Turku', type: 'KT', year: 2024, sqm: 92.5, askingPricePerSqm: 8000 },
  { id: 4, address: 'Steniuksentie 39', area: 'Etelä-Haaga', city: 'Helsinki', type: 'KT', year: 1956, floors: '3/3', sqm: 36, askingPricePerSqm: 5972 },
  { id: 5, address: 'Snellmaninkatu 19-21', area: 'Kruununhaka', city: 'Helsinki', type: 'KT', year: 1989, floors: '4/6', sqm: 50.5, askingPricePerSqm: 7089 },
  { id: 6, address: 'Stenbäckinkatu 2', area: 'Taka-Töölö', city: 'Helsinki', type: 'KT', year: 1929, floors: '3/6', sqm: 50.4, askingPricePerSqm: 5853 },
  { id: 7, address: 'Talontie 6 A', area: 'Etelä-Haaga', city: 'Helsinki', type: 'KT', year: 1958, floors: '3/3', sqm: 46, askingPricePerSqm: 4326 },
  { id: 8, address: 'Kalasatamankatu 9', area: 'Kalasatama', city: 'Helsinki', type: 'KT', year: 2019, floors: '11/35', sqm: 83, askingPricePerSqm: 7807 },
  { id: 9, address: 'Suopellonkaari 20 B', area: 'Maunula', city: 'Helsinki', type: 'KT', year: 2015, floors: '2/2', sqm: 88, askingPricePerSqm: 6352 },
  { id: 10, address: 'Keinutie 9', area: 'Kontula', city: 'Helsinki', type: 'KT', year: 1966, floors: '2/8', sqm: 59.5, askingPricePerSqm: 2504 },

  // ── Helsinki Rivitalo ──
  { id: 11, address: 'Hietapellontie 29 B', area: 'Tapaninkylä', city: 'Helsinki', type: 'RT', year: 1989, sqm: 74.5, askingPricePerSqm: 4148 },
  { id: 12, address: 'Kissankellontie 12 D', area: 'Marjaniemi', city: 'Helsinki', type: 'RT', year: 1984, sqm: 81, askingPricePerSqm: 3642 },
  { id: 13, address: 'Yhdyskunnantie 56', area: 'Itä-Pakila', city: 'Helsinki', type: 'RT', year: 1992, sqm: 106, askingPricePerSqm: 3858 },
  { id: 14, address: 'Valssimyllynkatu 6 G', area: 'Myllypuro', city: 'Helsinki', type: 'RT', year: 2019, sqm: 64, askingPricePerSqm: 4297 },
  { id: 15, address: 'Porslahdentie 2', area: 'Vuosaari', city: 'Helsinki', type: 'RT', year: 1965, sqm: 99.5, askingPricePerSqm: 2814 },
  { id: 16, address: 'Halsuantie 12', area: 'Kannelmäki', city: 'Helsinki', type: 'RT', year: 1976, sqm: 101, askingPricePerSqm: 3158 },
  { id: 17, address: 'Ristiretkeläistenkatu 14 D', area: 'Viikinmäki', city: 'Helsinki', type: 'RT', year: 2022, sqm: 94.5, askingPricePerSqm: 4360 },
  { id: 18, address: 'Orisaarentie 2', area: 'Laajasalo', city: 'Helsinki', type: 'RT', year: 1967, sqm: 119.5, askingPricePerSqm: 4142 },
  { id: 19, address: 'Viklakuja 5 E', area: 'Lauttasaari', city: 'Helsinki', type: 'RT', year: 1968, sqm: 195, askingPricePerSqm: 8462 },
  { id: 20, address: 'Rantatöyry 7 F', area: 'Kulosaari', city: 'Helsinki', type: 'RT', year: 1961, sqm: 119, askingPricePerSqm: 6261 },
  { id: 21, address: 'Lepolantie 27 B', area: 'Länsi-Pakila', city: 'Helsinki', type: 'RT', year: 1975, sqm: 67, askingPricePerSqm: 2970 },
  { id: 22, address: 'Ilomäenpolku 3', area: 'Laajasalo', city: 'Helsinki', type: 'RT', year: 1972, sqm: 199, askingPricePerSqm: 3477 },
  { id: 23, address: 'Riukutie 10', area: 'Konala', city: 'Helsinki', type: 'RT', year: 1978, sqm: 48.5, askingPricePerSqm: 3278 },
  { id: 24, address: 'Härkälahdenkuja 9', area: 'Jollas', city: 'Helsinki', type: 'RT', year: 2001, sqm: 108.5, askingPricePerSqm: 5023 },
  { id: 25, address: 'Pallomäentie 10 C', area: 'Siltamäki', city: 'Helsinki', type: 'RT', year: 1985, sqm: 62, askingPricePerSqm: 2887 },
  { id: 26, address: 'Vanttitie 1 B', area: 'Vuosaari', city: 'Helsinki', type: 'RT', year: 2000, sqm: 99, askingPricePerSqm: 2970 },
  { id: 27, address: 'Varjakanvalkama 16', area: 'Vartiokylä', city: 'Helsinki', type: 'RT', year: 2002, sqm: 157, askingPricePerSqm: 4045 },
  { id: 28, address: 'Yläkaskentie 12', area: 'Tapaninkylä', city: 'Helsinki', type: 'RT', year: 1994, sqm: 93, askingPricePerSqm: 3054 },
  { id: 29, address: 'Poijupolku 4', area: 'Vuosaari', city: 'Helsinki', type: 'RT', year: 1989, sqm: 57, askingPricePerSqm: 4386 },
  { id: 30, address: 'Hiirakonkuja 8 B', area: 'Tapaninvainio', city: 'Helsinki', type: 'RT', year: 2016, sqm: 80, askingPricePerSqm: 3863 },
  { id: 31, address: 'Naulakalliontie 23', area: 'Mellunkylä', city: 'Helsinki', type: 'RT', year: 1988, sqm: 91, askingPricePerSqm: 2615 },
  { id: 32, address: 'Koskustie 5', area: 'Helsinki', city: 'Helsinki', type: 'RT', year: 1985, sqm: 93, askingPricePerSqm: 2957 },
  { id: 33, address: 'Läksyrinne 10', area: 'Puistola', city: 'Helsinki', type: 'RT', year: 1980, sqm: 70, askingPricePerSqm: 3129 },
  { id: 34, address: 'Kangaspellontie 4', area: 'Etelä-Haaga', city: 'Helsinki', type: 'RT', year: 1959, sqm: 146.5, askingPricePerSqm: 5652 },
  { id: 35, address: 'Solistintie 2 S', area: 'Kannelmäki', city: 'Helsinki', type: 'RT', year: 1980, sqm: 57.5, askingPricePerSqm: 3113 },

  // ── Helsinki Omakotitalo ──
  { id: 36, address: 'Karrintie 5', area: 'Puistola', city: 'Helsinki', type: 'OKT', year: 1968, sqm: 173, askingPricePerSqm: 2803 },
  { id: 37, address: 'Vihervarpusenpolku 4', area: 'Tapanila', city: 'Helsinki', type: 'OKT', year: 2017, sqm: 116, askingPricePerSqm: 4897 },
  { id: 38, address: 'Katajaharjuntie 12', area: 'Lauttasaari', city: 'Helsinki', type: 'OKT', year: 1963, sqm: 750, askingPricePerSqm: 9267 },
  { id: 39, address: 'Valkamatie 5', area: 'Vartiokylä', city: 'Helsinki', type: 'OKT', year: 1985, sqm: 215, askingPricePerSqm: 3153 },
  { id: 40, address: 'Viikinginkuja 4 C', area: 'Vartiokylä', city: 'Helsinki', type: 'OKT', year: 2022, sqm: 114.4, askingPricePerSqm: 5752 },
  { id: 41, address: 'Reiherintie 13', area: 'Laajasalo', city: 'Helsinki', type: 'OKT', year: 2012, sqm: 139, askingPricePerSqm: 5935 },
  { id: 42, address: 'Ummeljoentie 7', area: 'Vartiokylä', city: 'Helsinki', type: 'OKT', year: 1962, sqm: 249, askingPricePerSqm: 1960 },
  { id: 43, address: 'Kiviportintie 60', area: 'Vartiokylä', city: 'Helsinki', type: 'OKT', year: 2020, sqm: 79.4, askingPricePerSqm: 5642 },
  { id: 44, address: 'Vallesmannintie 52 B', area: 'Tapaninkylä', city: 'Helsinki', type: 'OKT', year: 1989, sqm: 90, askingPricePerSqm: 3544 },
  { id: 45, address: 'Heinäsuontie 19', area: 'Maununneva', city: 'Helsinki', type: 'OKT', year: 1994, sqm: 174, askingPricePerSqm: 2178 },
  { id: 46, address: 'Runonlaulajantie 77a', area: 'Hakuninmaa', city: 'Helsinki', type: 'OKT', year: 2020, sqm: 151, askingPricePerSqm: 5285 },
  { id: 47, address: 'Suopellonkaari 27', area: 'Maunula', city: 'Helsinki', type: 'OKT', year: 2014, sqm: 140, askingPricePerSqm: 4786 },
  { id: 48, address: 'Sormuspolku 10', area: 'Vartiokylä', city: 'Helsinki', type: 'OKT', year: 1939, sqm: 85, askingPricePerSqm: 2224 },
  { id: 49, address: 'Lasinpuhaltajantie 1', area: 'Suutarila', city: 'Helsinki', type: 'OKT', year: 2011, sqm: 132, askingPricePerSqm: 3394 },
  { id: 50, address: 'Korentotie 2D', area: 'Puistola', city: 'Helsinki', type: 'OKT', year: 2016, sqm: 99.5, askingPricePerSqm: 5377 },
  { id: 51, address: 'Heinätie 1', area: 'Tapaninkylä', city: 'Helsinki', type: 'OKT', year: 1955, sqm: 120, askingPricePerSqm: 3492 },
  { id: 52, address: 'Pertunsuora 4', area: 'Siltamäki', city: 'Helsinki', type: 'OKT', year: 2020, sqm: 141, askingPricePerSqm: 3993 },
  { id: 53, address: 'Rastilantie 8', area: 'Vuosaari', city: 'Helsinki', type: 'OKT', year: 1967, sqm: 204.6, askingPricePerSqm: 3759 },
  { id: 54, address: 'Runonlaulajantie 50 B', area: 'Kaarela', city: 'Helsinki', type: 'OKT', year: 1952, sqm: 144.7, askingPricePerSqm: 2833 },
  { id: 55, address: 'Takalantie 11c', area: 'Tapanila', city: 'Helsinki', type: 'OKT', year: 2000, sqm: 201, askingPricePerSqm: 3408 },
  { id: 56, address: 'Moisiontie 20', area: 'Tapaninkylä', city: 'Helsinki', type: 'OKT', year: 2025, sqm: 128.5, askingPricePerSqm: 5043 },
  { id: 57, address: 'Orvokkitie 2b', area: 'Vartiokylä', city: 'Helsinki', type: 'OKT', year: 2001, sqm: 123, askingPricePerSqm: 4789 },
  { id: 58, address: 'Kappelintie 44', area: 'Östersundom', city: 'Helsinki', type: 'OKT', year: 1997, sqm: 165, askingPricePerSqm: 3545 },
  { id: 59, address: 'Pellavakaskentie 16b', area: 'Oulunkylä', city: 'Helsinki', type: 'OKT', year: 1999, sqm: 280, askingPricePerSqm: 4607 },
  { id: 60, address: 'Ketokivenkaari 20', area: 'Pihlajamäki', city: 'Helsinki', type: 'OKT', year: 2012, sqm: 135, askingPricePerSqm: 3644 },
  { id: 61, address: 'Rinnekatu 4', area: 'Pispala', city: 'Tampere', type: 'OKT', year: 1924, sqm: 183, askingPricePerSqm: 3169 },

  // ── Tampere ──
  { id: 62, address: 'Pikkusaarenkuja 5', area: 'Lentävänniemi', city: 'Tampere', type: 'KT', year: 1975, sqm: 50, askingPricePerSqm: 1680 },
  { id: 63, address: 'Kuntokatu 11', area: 'Kauppi', city: 'Tampere', type: 'KT', year: 2020, sqm: 111.5, askingPricePerSqm: 5336 },
  { id: 64, address: 'Sarvijaakonkatu 23 B', area: 'Kaleva', city: 'Tampere', type: 'KT', year: 2018, sqm: 55, askingPricePerSqm: 4164 },
  { id: 65, address: 'Pispankatu 1-3 B', area: 'Pispala', city: 'Tampere', type: 'KT', year: 1967, sqm: 79, askingPricePerSqm: 3278 },
  { id: 66, address: 'Lemminkäisenkatu 10 B', area: 'Kaleva', city: 'Tampere', type: 'KT', year: 1962, sqm: 59, askingPricePerSqm: 3334 },
  { id: 67, address: 'Salhojankatu 25', area: 'Tammela', city: 'Tampere', type: 'KT', year: 2023, sqm: 111.5, askingPricePerSqm: 8251 },
  { id: 68, address: 'Takahuhdinkatu 73', area: 'Takahuhti', city: 'Tampere', type: 'RT', year: 1970, sqm: 99, askingPricePerSqm: 2616 },
  { id: 69, address: 'Toispuolisenkatu 4', area: 'Holvasti', city: 'Tampere', type: 'RT', year: 1993, sqm: 55, askingPricePerSqm: 3236 },
  { id: 70, address: 'Maijalankatu 9 D', area: 'Hervanta', city: 'Tampere', type: 'RT', year: 1981, sqm: 66.5, askingPricePerSqm: 2090 },
  { id: 71, address: 'Järvensivuntie 17 B', area: 'Järvensivu', city: 'Tampere', type: 'KT', year: 2007, sqm: 79, askingPricePerSqm: 3266 },
  { id: 72, address: 'Koivistontie 10 A', area: 'Koivistonkylä', city: 'Tampere', type: 'KT', year: 1963, sqm: 58, askingPricePerSqm: 2034 },
  { id: 73, address: 'Härmälänkatu 25', area: 'Rantaperkiö', city: 'Tampere', type: 'KT', year: 1961, sqm: 29, askingPricePerSqm: 3069 },
  { id: 74, address: 'Itsenäisyydenkatu 3', area: 'Keskusta', city: 'Tampere', type: 'KT', year: 2018, sqm: 43.5, askingPricePerSqm: 7103 },
  { id: 75, address: 'Tampellan esplanadi 9 A', area: 'Tampella', city: 'Tampere', type: 'KT', year: 2008, sqm: 52, askingPricePerSqm: 5192 },
  { id: 76, address: 'Pellavantori 2', area: 'Tampella', city: 'Tampere', type: 'KT', year: 2011, sqm: 43, askingPricePerSqm: 5233 },
  { id: 77, address: 'Ranta-Tampellan katu 12', area: 'Ranta-Tampella', city: 'Tampere', type: 'KT', year: 2021, sqm: 60, askingPricePerSqm: 5667 },
  { id: 78, address: 'Raivaajantie 2', area: 'Ikuri', city: 'Tampere', type: 'OKT', year: 1971, sqm: 103.5, askingPricePerSqm: 1594 },
  { id: 79, address: 'Vihurinkatu 4', area: 'Härmälänranta', city: 'Tampere', type: 'KT', year: 2017, sqm: 47, askingPricePerSqm: 4638 },
  { id: 80, address: 'Loutunkatu 2', area: 'Takahuhti', city: 'Tampere', type: 'OKT', year: 1955, sqm: 164, askingPricePerSqm: 2738 },
  { id: 81, address: 'Lyyrapyrstö 1', area: 'Hervantajärvi', city: 'Tampere', type: 'KT', year: 2023, sqm: 65.5, askingPricePerSqm: 3649 },
  { id: 82, address: 'Ruopionkatu 10 C', area: 'Muotiala', city: 'Tampere', type: 'KT', year: 2015, sqm: 60, askingPricePerSqm: 4083 },
  { id: 83, address: 'Jankanraitti 12', area: 'Janka', city: 'Tampere', type: 'KT', year: 1991, sqm: 62, askingPricePerSqm: 1460 },
  { id: 84, address: 'Makkarajärvenkatu 72', area: 'Hervantajärvi', city: 'Tampere', type: 'KT', year: 2021, sqm: 24.5, askingPricePerSqm: 4816 },
  { id: 85, address: 'Teiskontie 19 E', area: 'Kaleva', city: 'Tampere', type: 'KT', year: 1956, sqm: 62.5, askingPricePerSqm: 3040 },
  { id: 86, address: 'Kyläkeinunkatu 21 A', area: 'Korkinmäki', city: 'Tampere', type: 'OKT', year: 1975, sqm: 134, askingPricePerSqm: 2007 },
  { id: 87, address: 'Insinöörinkatu 51', area: 'Hervanta', city: 'Tampere', type: 'KT', year: 2002, sqm: 73, askingPricePerSqm: 2452 },
]

// ─── Postal code mapping ─────────────────────────────────────────────────────
// Map area names to approximate postal codes for lookup
const areaToPostalCode: Record<string, Record<string, string>> = {
  Helsinki: {
    'Etelä-Haaga': '00320', 'Kruununhaka': '00170', 'Taka-Töölö': '00250',
    'Kalasatama': '00560', 'Maunula': '00630', 'Kontula': '00940',
    'Tapaninkylä': '00730', 'Marjaniemi': '00930', 'Itä-Pakila': '00680',
    'Myllypuro': '00920', 'Vuosaari': '00980', 'Kannelmäki': '00420',
    'Viikinmäki': '00790', 'Laajasalo': '00840', 'Lauttasaari': '00200',
    'Kulosaari': '00570', 'Länsi-Pakila': '00400', 'Konala': '00370',
    'Jollas': '00850', 'Siltamäki': '00740', 'Vartiokylä': '00950',
    'Tapaninvainio': '00730', 'Mellunkylä': '00970', 'Puistola': '00760',
    'Tapanila': '00730', 'Torpparinmäki': '00690', 'Maununneva': '00410',
    'Hakuninmaa': '00430', 'Suutarila': '00740', 'Kaarela': '00430',
    'Östersundom': '00890', 'Oulunkylä': '00640', 'Pihlajamäki': '00710',
    'Helsinki': '00100', // fallback
  },
  Tampere: {
    'Lentävänniemi': '33420', 'Kauppi': '33520', 'Kaleva': '33540',
    'Pispala': '33250', 'Tammela': '33500', 'Takahuhti': '33560',
    'Holvasti': '33710', 'Hervanta': '33720', 'Järvensivu': '33560',
    'Koivistonkylä': '33400', 'Rantaperkiö': '33900', 'Keskusta': '33100',
    'Tampella': '33210', 'Ranta-Tampella': '33210', 'Ikuri': '33680',
    'Härmälänranta': '33900', 'Hervantajärvi': '33730', 'Muotiala': '33800',
    'Janka': '33580', 'Korkinmäki': '33450', 'Levonmäki': '33710',
    'Tasanne': '33580',
  },
  Turku: {
    'Luolavuori': '20720', 'Keskusta': '20100',
  },
}

// ─── Property type mapping ───────────────────────────────────────────────────
function mapPropertyType(type: string): string {
  switch (type) {
    case 'KT': return 'kerrostalo'
    case 'RT': return 'rivitalo'
    case 'OKT': return 'omakotitalo'
    case 'PT': return 'rivitalo' // paritalo ≈ rivitalo in StatFin
    default: return 'kerrostalo'
  }
}

// ─── Floor count from "floor/total" string ───────────────────────────────────
function parseFloorCount(floors: string | null | undefined): number | null {
  if (!floors) return null
  const match = floors.match(/\d+\/(\d+)/)
  return match ? parseInt(match[1]) : null
}

// ─── Main validation logic ───────────────────────────────────────────────────

interface ValidationResult {
  id: number
  address: string
  city: string
  area: string
  type: string
  year: number | null
  askingPpsqm: number
  postalCode: string
  basePrice: number | null
  basePriceSource: string
  ageFactor: number
  energyFactor: number
  waterFactor: number
  floorFactor: number
  sizeFactor: number
  neighborhoodFactor: number
  ourEstimate: number | null
  deltaPct: number | null
}

async function fetchLatestPrice(
  areaId: string,
  propertyType: string
): Promise<{ price: number; source: string } | null> {
  const { data } = await supabase
    .from('price_estimates')
    .select('price_per_sqm_avg, price_per_sqm_median, year')
    .eq('area_id', areaId)
    .eq('property_type', propertyType)
    .not('price_per_sqm_avg', 'is', null)
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  return {
    price: Number(data.price_per_sqm_median ?? data.price_per_sqm_avg),
    source: `${propertyType}@area(${data.year})`,
  }
}

async function fetchMunicipalityAvgPrice(
  municipality: string,
  propertyType: string
): Promise<{ price: number; source: string } | null> {
  // Get all area IDs for this municipality
  const { data: areas } = await supabase
    .from('areas')
    .select('id')
    .eq('municipality', municipality)

  if (!areas?.length) return null
  const areaIds = areas.map((a: { id: string }) => a.id)

  const { data: prices } = await supabase
    .from('price_estimates')
    .select('year, price_per_sqm_avg, price_per_sqm_median')
    .in('area_id', areaIds)
    .eq('property_type', propertyType)
    .not('price_per_sqm_avg', 'is', null)
    .order('year', { ascending: false })

  if (!prices?.length) return null

  type PriceRow = { year: number; price_per_sqm_avg: number; price_per_sqm_median: number | null }
  const latestYear = (prices[0] as PriceRow).year
  const latestPrices = (prices as PriceRow[]).filter((p) => p.year === latestYear)
  // Use median instead of average — robust against premium-area outliers
  const values = latestPrices
    .map((p) => Number(p.price_per_sqm_median ?? p.price_per_sqm_avg))
    .sort((a, b) => a - b)
  const mid = Math.floor(values.length / 2)
  const median = values.length % 2 === 0
    ? (values[mid - 1] + values[mid]) / 2
    : values[mid]
  return {
    price: median,
    source: `${propertyType}@municipality(${latestYear})`,
  }
}

async function lookupBasePrice(
  areaId: string,
  propertyType: string,
  municipality: string
): Promise<{ price: number; source: string } | null> {
  // Phase 1: Area-level lookup
  const areaPrice = await fetchLatestPrice(areaId, propertyType)
  if (areaPrice) return areaPrice

  if (propertyType === 'omakotitalo') {
    const rivitaloPrice = await fetchLatestPrice(areaId, 'rivitalo')
    if (rivitaloPrice) return { price: rivitaloPrice.price * OKT_FALLBACK.fromRivitalo, source: `rivitalo×${OKT_FALLBACK.fromRivitalo}@area` }

    const kerrostaloPrice = await fetchLatestPrice(areaId, 'kerrostalo')
    if (kerrostaloPrice) return { price: kerrostaloPrice.price * OKT_FALLBACK.fromKerrostalo, source: `kerrostalo×${OKT_FALLBACK.fromKerrostalo}@area` }
  }

  // Phase 2: Municipality-level fallback
  const munPrice = await fetchMunicipalityAvgPrice(municipality, propertyType)
  if (munPrice) return { ...munPrice, source: munPrice.source.replace('@', '@mun_') }

  if (propertyType === 'omakotitalo') {
    const munRivitalo = await fetchMunicipalityAvgPrice(municipality, 'rivitalo')
    if (munRivitalo) return { price: munRivitalo.price * OKT_FALLBACK.fromRivitalo, source: `rivitalo×${OKT_FALLBACK.fromRivitalo}@municipality` }

    const munKerrostalo = await fetchMunicipalityAvgPrice(municipality, 'kerrostalo')
    if (munKerrostalo) return { price: munKerrostalo.price * OKT_FALLBACK.fromKerrostalo, source: `kerrostalo×${OKT_FALLBACK.fromKerrostalo}@municipality` }
  }

  return null
}

async function fetchNeighborhoodFactor(
  areaId: string,
  propertyType: string
): Promise<number> {
  // Only use high/medium confidence factors (≥3 samples)
  // No municipality median fallback — with sparse data it biases results
  const { data } = await supabase
    .from('neighborhood_factors')
    .select('factor, property_type')
    .eq('area_id', areaId)
    .in('property_type', [propertyType, 'all'])
    .gte('sample_count', 3)

  if (!data?.length) return 1.0

  const exact = data.find((r) => r.property_type === propertyType)
  if (exact?.factor) return Number(exact.factor)

  const universal = data.find((r) => r.property_type === 'all')
  if (universal?.factor) return Number(universal.factor)

  return 1.0
}

// Municipality names (matching the 'municipality' column in the areas table)
const cityToMunicipality: Record<string, string> = {
  Helsinki: 'Helsinki',
  Tampere: 'Tampere',
  Turku: 'Turku',
}

const REFERENCE_YEAR = 2026

async function main() {
  console.log(`Validating ${listings.length} listings against our price estimation algorithm...\n`)

  // Pre-fetch area IDs for all postal codes we need
  const postalCodes = new Set<string>()
  for (const listing of listings) {
    const cityMap = areaToPostalCode[listing.city]
    const postalCode = cityMap?.[listing.area] || ''
    if (postalCode) postalCodes.add(postalCode)
  }

  // Fetch all area IDs at once
  const { data: areasData } = await supabase
    .from('areas')
    .select('id, area_code, municipality')
    .in('area_code', [...postalCodes])

  const areaMap = new Map<string, { id: string; municipality: string }>()
  for (const area of areasData ?? []) {
    areaMap.set(area.area_code, { id: area.id, municipality: area.municipality })
  }

  const results: ValidationResult[] = []

  for (const listing of listings) {
    const cityMap = areaToPostalCode[listing.city]
    const postalCode = cityMap?.[listing.area] || '?'
    const areaInfo = areaMap.get(postalCode)
    const propertyType = mapPropertyType(listing.type)
    const municipality = cityToMunicipality[listing.city] || ''

    let basePrice: number | null = null
    let basePriceSource = 'not found'

    if (areaInfo) {
      const result = await lookupBasePrice(areaInfo.id, propertyType, municipality)
      if (result) {
        basePrice = result.price
        basePriceSource = result.source
      }
    } else if (municipality) {
      // No area found, try municipality fallback directly
      const result = await fetchMunicipalityAvgPrice(municipality, propertyType)
      if (result) {
        basePrice = result.price
        basePriceSource = result.source
      } else if (propertyType === 'omakotitalo') {
        const munRivitalo = await fetchMunicipalityAvgPrice(municipality, 'rivitalo')
        if (munRivitalo) {
          basePrice = munRivitalo.price * 1.10
          basePriceSource = 'rivitalo×1.10@municipality'
        } else {
          const munKerrostalo = await fetchMunicipalityAvgPrice(municipality, 'kerrostalo')
          if (munKerrostalo) {
            basePrice = munKerrostalo.price * 0.90
            basePriceSource = 'kerrostalo×0.90@municipality'
          }
        }
      }
    }

    const ageFactor = computeAgeFactor(listing.year, REFERENCE_YEAR)
    // Energy class and size data not available in Etuovi listings — neutral (1.0)
    const energyFactor = 1.0
    const waterFactor = 1.0
    const sizeFactor = 1.0
    const floorCount = parseFloorCount(listing.floors)
    const ptMap: Record<string, 'kerrostalo' | 'rivitalo' | 'omakotitalo'> = {
      KT: 'kerrostalo', RT: 'rivitalo', OKT: 'omakotitalo', PT: 'rivitalo',
    }
    const floorFactor = computeFloorFactor(floorCount, ptMap[listing.type])

    // Look up neighborhood factor, apply dampening for old buildings
    let neighborhoodFactor = 1.0
    if (areaInfo) {
      const rawFactor = await fetchNeighborhoodFactor(areaInfo.id, propertyType)
      neighborhoodFactor = dampenPremium(rawFactor, ageFactor)
    }

    const ourEstimate = basePrice !== null
      ? Math.round(basePrice * ageFactor * energyFactor * waterFactor * floorFactor * sizeFactor * neighborhoodFactor)
      : null

    const deltaPct = ourEstimate !== null
      ? Math.round(((ourEstimate - listing.askingPricePerSqm) / listing.askingPricePerSqm) * 100)
      : null

    results.push({
      id: listing.id,
      address: listing.address,
      city: listing.city,
      area: listing.area,
      type: listing.type,
      year: listing.year,
      askingPpsqm: listing.askingPricePerSqm,
      postalCode,
      basePrice: basePrice ? Math.round(basePrice) : null,
      basePriceSource,
      ageFactor,
      energyFactor,
      waterFactor,
      floorFactor,
      sizeFactor,
      neighborhoodFactor,
      ourEstimate,
      deltaPct,
    })
  }

  // ─── Generate markdown report ────────────────────────────────────────────

  const validResults = results.filter((r) => r.ourEstimate !== null)
  const deltas = validResults.map((r) => r.deltaPct!)

  const meanDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length
  const sortedDeltas = [...deltas].sort((a, b) => a - b)
  const medianDelta = sortedDeltas[Math.floor(sortedDeltas.length / 2)]
  const stdDev = Math.sqrt(deltas.reduce((sum, d) => sum + (d - meanDelta) ** 2, 0) / deltas.length)
  const absDeltas = deltas.map(Math.abs)
  const meanAbsDelta = absDeltas.reduce((a, b) => a + b, 0) / absDeltas.length

  // By type
  const byType = (type: string) => {
    const filtered = validResults.filter((r) => r.type === type)
    if (filtered.length === 0) return { count: 0, mean: 0, median: 0, std: 0 }
    const ds = filtered.map((r) => r.deltaPct!)
    const mean = ds.reduce((a, b) => a + b, 0) / ds.length
    const sorted = [...ds].sort((a, b) => a - b)
    const med = sorted[Math.floor(sorted.length / 2)]
    const std = Math.sqrt(ds.reduce((sum, d) => sum + (d - mean) ** 2, 0) / ds.length)
    return { count: filtered.length, mean: Math.round(mean), median: med, std: Math.round(std) }
  }

  // By city
  const byCity = (city: string) => {
    const filtered = validResults.filter((r) => r.city === city)
    if (filtered.length === 0) return { count: 0, mean: 0, median: 0, std: 0 }
    const ds = filtered.map((r) => r.deltaPct!)
    const mean = ds.reduce((a, b) => a + b, 0) / ds.length
    const sorted = [...ds].sort((a, b) => a - b)
    const med = sorted[Math.floor(sorted.length / 2)]
    const std = Math.sqrt(ds.reduce((sum, d) => sum + (d - mean) ** 2, 0) / ds.length)
    return { count: filtered.length, mean: Math.round(mean), median: med, std: Math.round(std) }
  }

  const ktStats = byType('KT')
  const rtStats = byType('RT')
  const oktStats = byType('OKT')
  const helsinkiStats = byCity('Helsinki')
  const tampereStats = byCity('Tampere')
  const turkuStats = byCity('Turku')

  let md = `# Price Estimation Validation Report — ${new Date().toISOString().split('T')[0]}

## Summary

- **Listings compared:** ${validResults.length} / ${listings.length}
- **Mean Δ%:** ${Math.round(meanDelta)}%
- **Median Δ%:** ${medianDelta}%
- **Mean |Δ%|:** ${Math.round(meanAbsDelta)}%
- **Std Dev:** ${Math.round(stdDev)}%
- **Reference year:** ${REFERENCE_YEAR}

> Positive Δ% = our estimate is HIGHER than asking price (over-estimation).
> Negative Δ% = our estimate is LOWER than asking price (under-estimation).

## Breakdown by Property Type

| Type | Count | Mean Δ% | Median Δ% | Std Dev |
|------|-------|---------|-----------|---------|
| Kerrostalo (KT) | ${ktStats.count} | ${ktStats.mean}% | ${ktStats.median}% | ${ktStats.std}% |
| Rivitalo (RT) | ${rtStats.count} | ${rtStats.mean}% | ${rtStats.median}% | ${rtStats.std}% |
| Omakotitalo (OKT) | ${oktStats.count} | ${oktStats.mean}% | ${oktStats.median}% | ${oktStats.std}% |

## Breakdown by City

| City | Count | Mean Δ% | Median Δ% | Std Dev |
|------|-------|---------|-----------|---------|
| Helsinki | ${helsinkiStats.count} | ${helsinkiStats.mean}% | ${helsinkiStats.median}% | ${helsinkiStats.std}% |
| Tampere | ${tampereStats.count} | ${tampereStats.mean}% | ${tampereStats.median}% | ${tampereStats.std}% |
| Turku | ${turkuStats.count} | ${turkuStats.mean}% | ${turkuStats.median}% | ${turkuStats.std}% |

## Full Comparison Table

| # | City | Area | Type | Year | Asking €/m² | Base | Age× | Floor× | Nbhd× | Our €/m² | Δ% | Source |
|---|------|------|------|------|-------------|------|------|--------|-------|----------|-----|--------|
`

  for (const r of results) {
    const base = r.basePrice !== null ? r.basePrice : '—'
    const est = r.ourEstimate !== null ? r.ourEstimate : '—'
    const delta = r.deltaPct !== null ? `${r.deltaPct > 0 ? '+' : ''}${r.deltaPct}%` : '—'
    const nbhd = r.neighborhoodFactor !== 1 ? r.neighborhoodFactor.toFixed(2) : '1'
    md += `| ${r.id} | ${r.city} | ${r.area} | ${r.type} | ${r.year ?? '?'} | ${r.askingPpsqm} | ${base} | ${r.ageFactor} | ${r.floorFactor} | ${nbhd} | ${est} | ${delta} | ${r.basePriceSource} |\n`
  }

  // ─── Analysis ────────────────────────────────────────────────────────────

  // Find biggest over/under-estimations
  const sorted = [...validResults].sort((a, b) => (b.deltaPct ?? 0) - (a.deltaPct ?? 0))
  const top5Over = sorted.slice(0, 5)
  const top5Under = sorted.slice(-5).reverse()

  md += `
## Biggest Over-Estimations (our estimate too high)

| # | Address | City/Area | Type | Year | Asking | Ours | Δ% |
|---|---------|-----------|------|------|--------|------|-----|
`
  for (const r of top5Over) {
    md += `| ${r.id} | ${r.address} | ${r.city}, ${r.area} | ${r.type} | ${r.year ?? '?'} | ${r.askingPpsqm} | ${r.ourEstimate} | +${r.deltaPct}% |\n`
  }

  md += `
## Biggest Under-Estimations (our estimate too low)

| # | Address | City/Area | Type | Year | Asking | Ours | Δ% |
|---|---------|-----------|------|------|--------|------|-----|
`
  for (const r of top5Under) {
    md += `| ${r.id} | ${r.address} | ${r.city}, ${r.area} | ${r.type} | ${r.year ?? '?'} | ${r.askingPpsqm} | ${r.ourEstimate} | ${r.deltaPct}% |\n`
  }

  // ─── Age factor analysis ─────────────────────────────────────────────────

  md += `
## Age Factor Analysis

Comparing buildings across different age brackets to verify the U-shaped age curve:

| Age Bracket | Age Factor | Listings | Avg Asking €/m² | Avg Our €/m² | Avg Δ% |
|-------------|-----------|----------|-----------------|--------------|--------|
`

  const ageBrackets = [
    { label: 'New (≤5yr)', min: 0, max: 5, factor: '1.25-1.35' },
    { label: 'Recent (6-10yr)', min: 6, max: 10, factor: '1.15' },
    { label: 'Modern (11-20yr)', min: 11, max: 20, factor: '1.05' },
    { label: 'Middle (21-30yr)', min: 21, max: 30, factor: '0.95' },
    { label: 'Aging (31-40yr)', min: 31, max: 40, factor: '0.90' },
    { label: 'Old (41-50yr)', min: 41, max: 50, factor: '0.82' },
    { label: 'Panel (51-60yr)', min: 51, max: 60, factor: '0.78' },
    { label: 'Post-war (61-70yr)', min: 61, max: 70, factor: '0.80' },
    { label: '1940s-50s (71-80yr)', min: 71, max: 80, factor: '0.85' },
    { label: 'Pre-war (81-100yr)', min: 81, max: 100, factor: '0.90' },
    { label: 'Historical (>100yr)', min: 101, max: 999, factor: '0.92' },
  ]

  for (const bracket of ageBrackets) {
    const filtered = validResults.filter((r) => {
      if (r.year === null) return false
      const age = REFERENCE_YEAR - r.year
      return age >= bracket.min && age <= bracket.max
    })
    if (filtered.length === 0) {
      md += `| ${bracket.label} | ${bracket.factor} | 0 | — | — | — |\n`
      continue
    }
    const avgAsking = Math.round(filtered.reduce((a, r) => a + r.askingPpsqm, 0) / filtered.length)
    const avgOur = Math.round(filtered.reduce((a, r) => a + (r.ourEstimate ?? 0), 0) / filtered.length)
    const avgDelta = Math.round(filtered.reduce((a, r) => a + (r.deltaPct ?? 0), 0) / filtered.length)
    md += `| ${bracket.label} | ${bracket.factor} | ${filtered.length} | ${avgAsking} | ${avgOur} | ${avgDelta}% |\n`
  }

  // ─── OKT pricing analysis ───────────────────────────────────────────────

  md += `
## Omakotitalo Pricing Analysis

Key question: Is the omakotitalo fallback (rivitalo×1.10 → kerrostalo×0.90) accurate?

`

  const oktResults = validResults.filter((r) => r.type === 'OKT')
  const oktBySource = new Map<string, ValidationResult[]>()
  for (const r of oktResults) {
    const key = r.basePriceSource.includes('rivitalo') ? 'rivitalo fallback' :
                r.basePriceSource.includes('kerrostalo') ? 'kerrostalo fallback' :
                'direct omakotitalo'
    if (!oktBySource.has(key)) oktBySource.set(key, [])
    oktBySource.get(key)!.push(r)
  }

  md += `| Fallback Source | Count | Mean Δ% | Median Δ% |\n`
  md += `|-----------------|-------|---------|----------|\n`
  for (const [source, items] of oktBySource) {
    const ds = items.map((r) => r.deltaPct!)
    const mean = Math.round(ds.reduce((a, b) => a + b, 0) / ds.length)
    const sorted = [...ds].sort((a, b) => a - b)
    const med = sorted[Math.floor(sorted.length / 2)]
    md += `| ${source} | ${items.length} | ${mean}% | ${med}% |\n`
  }

  // ─── Recommendations ────────────────────────────────────────────────────

  md += `
## Algorithm Improvement Recommendations

Based on the analysis above, here are specific recommendations:

### 1. Age Factor Adjustments

_(To be filled based on analysis results)_

### 2. Omakotitalo Fallback Multiplier

_(To be filled based on analysis results)_

### 3. New Construction Premium

_(To be filled based on analysis results)_

### 4. Floor/Height Premium

_(To be filled based on analysis results)_

### 5. Other Observations

_(To be filled based on analysis results)_

---

*Generated by \`scripts/validation/validate-prices.ts\` on ${new Date().toISOString()}*
*Data source: Etuovi.fi asking prices collected 2026-03-12*
*Note: Water proximity factor set to 1.0 (neutral) as we don't have water distance for listings*
`

  // Write report
  const outputPath = resolve(__dirname, 'price-validation-2026-03.md')
  writeFileSync(outputPath, md)
  console.log(`\nReport written to: ${outputPath}`)

  // Also print summary to console
  console.log('\n═══ SUMMARY ═══')
  console.log(`Total listings: ${listings.length}`)
  console.log(`With estimates: ${validResults.length}`)
  console.log(`Mean Δ%: ${Math.round(meanDelta)}%`)
  console.log(`Median Δ%: ${medianDelta}%`)
  console.log(`Mean |Δ%|: ${Math.round(meanAbsDelta)}%`)
  console.log(`Std Dev: ${Math.round(stdDev)}%`)
  console.log()
  console.log('By type:')
  console.log(`  KT: n=${ktStats.count}, mean=${ktStats.mean}%, median=${ktStats.median}%`)
  console.log(`  RT: n=${rtStats.count}, mean=${rtStats.mean}%, median=${rtStats.median}%`)
  console.log(`  OKT: n=${oktStats.count}, mean=${oktStats.mean}%, median=${oktStats.median}%`)
  console.log()
  console.log('By city:')
  console.log(`  Helsinki: n=${helsinkiStats.count}, mean=${helsinkiStats.mean}%, median=${helsinkiStats.median}%`)
  console.log(`  Tampere: n=${tampereStats.count}, mean=${tampereStats.mean}%, median=${tampereStats.median}%`)
  console.log(`  Turku: n=${turkuStats.count}, mean=${turkuStats.mean}%, median=${turkuStats.median}%`)
}

main().catch(console.error)
