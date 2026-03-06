/**
 * Comprehensive mock data for the Finnish housing price map application.
 *
 * Uses Voronoi tessellation (d3-delaunay) to create continuous terrain coverage
 * with IDW-interpolated prices from anchor neighbourhood points. This produces
 * a dense, gap-free choropleth that covers the entire visible map area.
 */

import { Delaunay } from 'd3-delaunay'

import type {
  PropertyType,
  PriceEstimate,
  BuildingStats,
  DemographicStats,
} from '@/app/types'

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

/** Definition for a single neighbourhood anchor used to generate all mock data. */
interface AreaDefinition {
  area_code: string
  name: string
  municipality: string
  center: [number, number] // [lng, lat]
  /** Base kerrostalo price per sqm (year 2018) */
  basePrice: number
  /** Average yearly growth rate (e.g. 0.03 = 3 %) */
  growth: number
  /** Average building construction year */
  avgBuildYear: number
  /** Population */
  population: number
  /** Median age */
  medianAge: number
  /** Percentage under 18 */
  pctUnder18: number
  /** Percentage 18-64 */
  pct18_64: number
  /** Percentage over 65 */
  pctOver65: number
  /** Average household size */
  avgHouseholdSize: number
  /** Walk score 0-100 */
  walkScore: number
  /** Average floor count in the area */
  avgFloorCount: number
  /** Total buildings in the area */
  buildingsTotal: number
}

// ---------------------------------------------------------------------------
// Area definitions – master data for all generated datasets
// ---------------------------------------------------------------------------

const AREA_DEFINITIONS: AreaDefinition[] = [
  // ---- Helsinki ----
  {
    area_code: '00100', name: 'Helsinki keskusta', municipality: 'Helsinki',
    center: [24.941, 60.170], basePrice: 7200, growth: 0.03,
    avgBuildYear: 1925, population: 10800, medianAge: 35, pctUnder18: 8,
    pct18_64: 76, pctOver65: 16, avgHouseholdSize: 1.4, walkScore: 95,
    avgFloorCount: 5.8, buildingsTotal: 420,
  },
  {
    area_code: '00120', name: 'Punavuori', municipality: 'Helsinki',
    center: [24.937, 60.162], basePrice: 6800, growth: 0.03,
    avgBuildYear: 1910, population: 8200, medianAge: 34, pctUnder18: 7,
    pct18_64: 78, pctOver65: 15, avgHouseholdSize: 1.3, walkScore: 93,
    avgFloorCount: 5.5, buildingsTotal: 350,
  },
  {
    area_code: '00130', name: 'Kaartinkaupunki', municipality: 'Helsinki',
    center: [24.950, 60.165], basePrice: 7500, growth: 0.035,
    avgBuildYear: 1920, population: 4500, medianAge: 38, pctUnder18: 9,
    pct18_64: 72, pctOver65: 19, avgHouseholdSize: 1.5, walkScore: 92,
    avgFloorCount: 5.2, buildingsTotal: 210,
  },
  {
    area_code: '00150', name: 'Eira', municipality: 'Helsinki',
    center: [24.938, 60.156], basePrice: 7800, growth: 0.035,
    avgBuildYear: 1915, population: 5800, medianAge: 40, pctUnder18: 10,
    pct18_64: 68, pctOver65: 22, avgHouseholdSize: 1.6, walkScore: 90,
    avgFloorCount: 5.0, buildingsTotal: 280,
  },
  {
    area_code: '00180', name: 'Kamppi', municipality: 'Helsinki',
    center: [24.930, 60.169], basePrice: 7000, growth: 0.03,
    avgBuildYear: 1935, population: 9500, medianAge: 33, pctUnder18: 6,
    pct18_64: 80, pctOver65: 14, avgHouseholdSize: 1.3, walkScore: 94,
    avgFloorCount: 6.0, buildingsTotal: 380,
  },
  {
    area_code: '00200', name: 'Lauttasaari', municipality: 'Helsinki',
    center: [24.875, 60.160], basePrice: 5200, growth: 0.03,
    avgBuildYear: 1965, population: 12500, medianAge: 38, pctUnder18: 14,
    pct18_64: 68, pctOver65: 18, avgHouseholdSize: 1.8, walkScore: 78,
    avgFloorCount: 4.5, buildingsTotal: 520,
  },
  {
    area_code: '00250', name: 'Taka-Toolo', municipality: 'Helsinki',
    center: [24.918, 60.183], basePrice: 5800, growth: 0.025,
    avgBuildYear: 1940, population: 14200, medianAge: 36, pctUnder18: 10,
    pct18_64: 74, pctOver65: 16, avgHouseholdSize: 1.5, walkScore: 88,
    avgFloorCount: 5.5, buildingsTotal: 620,
  },
  {
    area_code: '00300', name: 'Pikku Huopalahti', municipality: 'Helsinki',
    center: [24.900, 60.195], basePrice: 4800, growth: 0.03,
    avgBuildYear: 1992, population: 7800, medianAge: 34, pctUnder18: 16,
    pct18_64: 70, pctOver65: 14, avgHouseholdSize: 2.0, walkScore: 75,
    avgFloorCount: 4.8, buildingsTotal: 340,
  },
  {
    area_code: '00400', name: 'Sornainnen', municipality: 'Helsinki',
    center: [24.960, 60.185], basePrice: 4200, growth: 0.035,
    avgBuildYear: 1950, population: 11000, medianAge: 33, pctUnder18: 9,
    pct18_64: 78, pctOver65: 13, avgHouseholdSize: 1.4, walkScore: 85,
    avgFloorCount: 5.0, buildingsTotal: 480,
  },
  {
    area_code: '00500', name: 'Kallio-Sornainnen', municipality: 'Helsinki',
    center: [24.968, 60.183], basePrice: 4500, growth: 0.03,
    avgBuildYear: 1955, population: 9800, medianAge: 32, pctUnder18: 7,
    pct18_64: 80, pctOver65: 13, avgHouseholdSize: 1.3, walkScore: 87,
    avgFloorCount: 5.2, buildingsTotal: 440,
  },
  {
    area_code: '00530', name: 'Kallio', municipality: 'Helsinki',
    center: [24.950, 60.182], basePrice: 5000, growth: 0.03,
    avgBuildYear: 1930, population: 15500, medianAge: 31, pctUnder18: 6,
    pct18_64: 82, pctOver65: 12, avgHouseholdSize: 1.2, walkScore: 92,
    avgFloorCount: 5.5, buildingsTotal: 680,
  },
  {
    area_code: '00550', name: 'Vallila', municipality: 'Helsinki',
    center: [24.955, 60.192], basePrice: 4600, growth: 0.03,
    avgBuildYear: 1945, population: 10200, medianAge: 34, pctUnder18: 10,
    pct18_64: 75, pctOver65: 15, avgHouseholdSize: 1.5, walkScore: 83,
    avgFloorCount: 4.8, buildingsTotal: 460,
  },
  {
    area_code: '00600', name: 'Koskela', municipality: 'Helsinki',
    center: [24.960, 60.210], basePrice: 3800, growth: 0.025,
    avgBuildYear: 1960, population: 8500, medianAge: 39, pctUnder18: 12,
    pct18_64: 66, pctOver65: 22, avgHouseholdSize: 1.7, walkScore: 68,
    avgFloorCount: 3.5, buildingsTotal: 390,
  },
  {
    area_code: '00700', name: 'Malmi', municipality: 'Helsinki',
    center: [25.010, 60.250], basePrice: 2800, growth: 0.02,
    avgBuildYear: 1972, population: 18200, medianAge: 40, pctUnder18: 16,
    pct18_64: 62, pctOver65: 22, avgHouseholdSize: 2.1, walkScore: 62,
    avgFloorCount: 3.2, buildingsTotal: 720,
  },
  {
    area_code: '00900', name: 'Puotila', municipality: 'Helsinki',
    center: [25.080, 60.210], basePrice: 3200, growth: 0.02,
    avgBuildYear: 1975, population: 7200, medianAge: 42, pctUnder18: 14,
    pct18_64: 60, pctOver65: 26, avgHouseholdSize: 2.0, walkScore: 55,
    avgFloorCount: 3.0, buildingsTotal: 310,
  },

  // ---- Espoo ----
  {
    area_code: '02100', name: 'Tapiola', municipality: 'Espoo',
    center: [24.805, 60.175], basePrice: 4500, growth: 0.03,
    avgBuildYear: 1965, population: 14800, medianAge: 37, pctUnder18: 15,
    pct18_64: 68, pctOver65: 17, avgHouseholdSize: 1.9, walkScore: 76,
    avgFloorCount: 4.2, buildingsTotal: 580,
  },
  {
    area_code: '02150', name: 'Otaniemi', municipality: 'Espoo',
    center: [24.830, 60.186], basePrice: 4200, growth: 0.035,
    avgBuildYear: 1970, population: 6200, medianAge: 28, pctUnder18: 5,
    pct18_64: 88, pctOver65: 7, avgHouseholdSize: 1.4, walkScore: 72,
    avgFloorCount: 4.0, buildingsTotal: 220,
  },
  {
    area_code: '02200', name: 'Niittykumpu', municipality: 'Espoo',
    center: [24.790, 60.178], basePrice: 3800, growth: 0.025,
    avgBuildYear: 1978, population: 9500, medianAge: 39, pctUnder18: 16,
    pct18_64: 65, pctOver65: 19, avgHouseholdSize: 2.1, walkScore: 65,
    avgFloorCount: 3.5, buildingsTotal: 420,
  },
  {
    area_code: '02600', name: 'Leppavaara', municipality: 'Espoo',
    center: [24.810, 60.220], basePrice: 3600, growth: 0.03,
    avgBuildYear: 1985, population: 16500, medianAge: 36, pctUnder18: 17,
    pct18_64: 67, pctOver65: 16, avgHouseholdSize: 2.0, walkScore: 70,
    avgFloorCount: 4.0, buildingsTotal: 640,
  },
  {
    area_code: '02700', name: 'Kauniainen', municipality: 'Kauniainen',
    center: [24.730, 60.210], basePrice: 4800, growth: 0.02,
    avgBuildYear: 1975, population: 9600, medianAge: 42, pctUnder18: 20,
    pct18_64: 58, pctOver65: 22, avgHouseholdSize: 2.5, walkScore: 58,
    avgFloorCount: 2.2, buildingsTotal: 380,
  },

  // ---- Tampere ----
  {
    area_code: '33100', name: 'Tampere keskusta', municipality: 'Tampere',
    center: [23.760, 61.498], basePrice: 3200, growth: 0.04,
    avgBuildYear: 1935, population: 12000, medianAge: 33, pctUnder18: 7,
    pct18_64: 78, pctOver65: 15, avgHouseholdSize: 1.3, walkScore: 92,
    avgFloorCount: 5.0, buildingsTotal: 520,
  },
  {
    area_code: '33200', name: 'Pyynikki', municipality: 'Tampere',
    center: [23.740, 61.495], basePrice: 3500, growth: 0.035,
    avgBuildYear: 1940, population: 7500, medianAge: 36, pctUnder18: 10,
    pct18_64: 72, pctOver65: 18, avgHouseholdSize: 1.6, walkScore: 82,
    avgFloorCount: 3.8, buildingsTotal: 340,
  },
  {
    area_code: '33500', name: 'Hervanta', municipality: 'Tampere',
    center: [23.850, 61.450], basePrice: 2200, growth: 0.03,
    avgBuildYear: 1985, population: 25000, medianAge: 30, pctUnder18: 14,
    pct18_64: 74, pctOver65: 12, avgHouseholdSize: 1.8, walkScore: 68,
    avgFloorCount: 4.5, buildingsTotal: 820,
  },
  {
    area_code: '33720', name: 'Lielahti', municipality: 'Tampere',
    center: [23.700, 61.510], basePrice: 2500, growth: 0.025,
    avgBuildYear: 1978, population: 8200, medianAge: 41, pctUnder18: 16,
    pct18_64: 62, pctOver65: 22, avgHouseholdSize: 2.1, walkScore: 52,
    avgFloorCount: 2.8, buildingsTotal: 360,
  },
  {
    area_code: '33800', name: 'Linnainmaa', municipality: 'Tampere',
    center: [23.830, 61.510], basePrice: 2400, growth: 0.025,
    avgBuildYear: 1982, population: 9800, medianAge: 40, pctUnder18: 17,
    pct18_64: 63, pctOver65: 20, avgHouseholdSize: 2.2, walkScore: 55,
    avgFloorCount: 3.0, buildingsTotal: 450,
  },

  // ---- Turku ----
  {
    area_code: '20100', name: 'Turku keskusta', municipality: 'Turku',
    center: [22.267, 60.452], basePrice: 2800, growth: 0.03,
    avgBuildYear: 1940, population: 9500, medianAge: 34, pctUnder18: 8,
    pct18_64: 76, pctOver65: 16, avgHouseholdSize: 1.4, walkScore: 90,
    avgFloorCount: 4.8, buildingsTotal: 420,
  },
  {
    area_code: '20200', name: 'Turku ita', municipality: 'Turku',
    center: [22.310, 60.450], basePrice: 2400, growth: 0.025,
    avgBuildYear: 1965, population: 11200, medianAge: 38, pctUnder18: 13,
    pct18_64: 66, pctOver65: 21, avgHouseholdSize: 1.8, walkScore: 72,
    avgFloorCount: 3.5, buildingsTotal: 480,
  },
  {
    area_code: '20500', name: 'Nummi', municipality: 'Turku',
    center: [22.230, 60.440], basePrice: 2200, growth: 0.02,
    avgBuildYear: 1972, population: 8800, medianAge: 41, pctUnder18: 15,
    pct18_64: 62, pctOver65: 23, avgHouseholdSize: 2.0, walkScore: 60,
    avgFloorCount: 3.0, buildingsTotal: 380,
  },
  {
    area_code: '20810', name: 'Turku pohjoinen', municipality: 'Turku',
    center: [22.280, 60.470], basePrice: 2000, growth: 0.02,
    avgBuildYear: 1980, population: 7500, medianAge: 39, pctUnder18: 16,
    pct18_64: 64, pctOver65: 20, avgHouseholdSize: 2.1, walkScore: 55,
    avgFloorCount: 2.8, buildingsTotal: 320,
  },

  // ---- Oulu ----
  {
    area_code: '90100', name: 'Oulu keskusta', municipality: 'Oulu',
    center: [25.470, 65.012], basePrice: 2500, growth: 0.03,
    avgBuildYear: 1960, population: 8200, medianAge: 32, pctUnder18: 8,
    pct18_64: 78, pctOver65: 14, avgHouseholdSize: 1.4, walkScore: 88,
    avgFloorCount: 4.5, buildingsTotal: 350,
  },
  {
    area_code: '90120', name: 'Toppila', municipality: 'Oulu',
    center: [25.440, 65.025], basePrice: 2100, growth: 0.025,
    avgBuildYear: 1975, population: 6500, medianAge: 37, pctUnder18: 14,
    pct18_64: 66, pctOver65: 20, avgHouseholdSize: 1.9, walkScore: 65,
    avgFloorCount: 3.2, buildingsTotal: 280,
  },
  {
    area_code: '90500', name: 'Kaukovainio', municipality: 'Oulu',
    center: [25.510, 65.000], basePrice: 1800, growth: 0.02,
    avgBuildYear: 1970, population: 7800, medianAge: 40, pctUnder18: 15,
    pct18_64: 62, pctOver65: 23, avgHouseholdSize: 2.0, walkScore: 55,
    avgFloorCount: 3.0, buildingsTotal: 340,
  },
  {
    area_code: '90570', name: 'Oulunsalo', municipality: 'Oulu',
    center: [25.400, 64.940], basePrice: 2000, growth: 0.02,
    avgBuildYear: 1995, population: 10200, medianAge: 36, pctUnder18: 22,
    pct18_64: 62, pctOver65: 16, avgHouseholdSize: 2.6, walkScore: 42,
    avgFloorCount: 1.8, buildingsTotal: 520,
  },
]

// Export for use in dataProvider (sidebar stats, search, etc.)
export { AREA_DEFINITIONS }

// ---------------------------------------------------------------------------
// Deterministic pseudo-random
// ---------------------------------------------------------------------------

function seededRandom(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return Math.abs(Math.sin(hash) * 10000) % 1
}

// ---------------------------------------------------------------------------
// City cluster definitions for Voronoi tessellation
// ---------------------------------------------------------------------------

interface CityCluster {
  bbox: [number, number, number, number] // [minLng, minLat, maxLng, maxLat]
  anchorIndices: number[]
  spacingLng: number
  spacingLat: number
}

const CITY_CLUSTERS: CityCluster[] = [
  {
    // Helsinki metro (Helsinki, Espoo, Kauniainen) – ~15,000 cells
    bbox: [24.70, 60.08, 25.20, 60.28],
    anchorIndices: Array.from({ length: 20 }, (_, i) => i),
    spacingLng: 0.003,
    spacingLat: 0.0022,
  },
  {
    // Tampere – ~900 cells
    bbox: [23.65, 61.42, 23.90, 61.54],
    anchorIndices: [20, 21, 22, 23, 24],
    spacingLng: 0.007,
    spacingLat: 0.005,
  },
  {
    // Turku – ~600 cells
    bbox: [22.15, 60.41, 22.38, 60.50],
    anchorIndices: [25, 26, 27, 28],
    spacingLng: 0.007,
    spacingLat: 0.005,
  },
  {
    // Oulu – ~1,200 cells
    bbox: [25.33, 64.90, 25.58, 65.07],
    anchorIndices: [29, 30, 31, 32],
    spacingLng: 0.007,
    spacingLat: 0.005,
  },
]

// ---------------------------------------------------------------------------
// Voronoi cell generation
// ---------------------------------------------------------------------------

interface VoronoiCell {
  id: string
  centerLng: number
  centerLat: number
  nearestAnchorIdx: number
  clusterIdx: number
  coordinates: number[][][]
}

function generateClusterCells(
  cluster: CityCluster,
  clusterIdx: number
): VoronoiCell[] {
  const [minLng, minLat, maxLng, maxLat] = cluster.bbox
  const points: [number, number][] = []

  // Generate grid points with jitter for organic look
  for (let lng = minLng; lng <= maxLng; lng += cluster.spacingLng) {
    for (let lat = minLat; lat <= maxLat; lat += cluster.spacingLat) {
      const jLng =
        (seededRandom(`g-${clusterIdx}-${lng.toFixed(4)}-${lat.toFixed(4)}-x`) - 0.5) *
        cluster.spacingLng *
        0.5
      const jLat =
        (seededRandom(`g-${clusterIdx}-${lng.toFixed(4)}-${lat.toFixed(4)}-y`) - 0.5) *
        cluster.spacingLat *
        0.5
      points.push([lng + jLng, lat + jLat])
    }
  }

  // Add anchor points (skip if a grid point is already very close)
  for (const anchorIdx of cluster.anchorIndices) {
    const anchor = AREA_DEFINITIONS[anchorIdx]
    const tooClose = points.some(
      (p) =>
        Math.abs(p[0] - anchor.center[0]) < cluster.spacingLng * 0.3 &&
        Math.abs(p[1] - anchor.center[1]) < cluster.spacingLat * 0.3
    )
    if (!tooClose) {
      points.push([anchor.center[0], anchor.center[1]])
    }
  }

  // Compute Voronoi diagram clipped to the bounding box
  const delaunay = Delaunay.from(points)
  const voronoi = delaunay.voronoi([minLng, minLat, maxLng, maxLat])

  const cells: VoronoiCell[] = []

  for (let i = 0; i < points.length; i++) {
    const cellPolygon = voronoi.cellPolygon(i)
    if (!cellPolygon) continue

    const [pLng, pLat] = points[i]

    // Find nearest anchor
    let nearestIdx = cluster.anchorIndices[0]
    let nearestDist = Infinity
    for (const ai of cluster.anchorIndices) {
      const a = AREA_DEFINITIONS[ai]
      const dist = Math.hypot(pLng - a.center[0], pLat - a.center[1])
      if (dist < nearestDist) {
        nearestDist = dist
        nearestIdx = ai
      }
    }

    // Convert d3-delaunay polygon to GeoJSON ring (already closed)
    const ring: number[][] = []
    for (const coord of cellPolygon) {
      ring.push([coord[0], coord[1]])
    }

    cells.push({
      id: `v-${clusterIdx}-${i}`,
      centerLng: pLng,
      centerLat: pLat,
      nearestAnchorIdx: nearestIdx,
      clusterIdx,
      coordinates: [ring],
    })
  }

  return cells
}

// Generate all Voronoi cells once at module load time
const ALL_VORONOI_CELLS: VoronoiCell[] = CITY_CLUSTERS.flatMap(
  (cluster, idx) => generateClusterCells(cluster, idx)
)

// ---------------------------------------------------------------------------
// IDW (Inverse Distance Weighting) interpolation
// ---------------------------------------------------------------------------

interface AnchorPrice {
  lng: number
  lat: number
  price: number
}

function idwInterpolate(
  lng: number,
  lat: number,
  anchors: AnchorPrice[],
  power = 2
): number {
  let numerator = 0
  let denominator = 0

  for (const a of anchors) {
    const dist = Math.hypot(lng - a.lng, lat - a.lat)
    if (dist < 0.0001) return a.price
    const w = 1 / Math.pow(dist, power)
    numerator += w * a.price
    denominator += w
  }

  return Math.round(numerator / denominator)
}

// ---------------------------------------------------------------------------
// Price computation
// ---------------------------------------------------------------------------

const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025] as const
const PROPERTY_TYPES: PropertyType[] = ['kerrostalo', 'rivitalo', 'omakotitalo']

const PROPERTY_TYPE_MULTIPLIER: Record<PropertyType, number> = {
  kerrostalo: 1.0,
  rivitalo: 0.75,
  omakotitalo: 0.65,
}

/** Compute the anchor price for a given area, year, and property type. */
function computeAnchorPrice(
  area: AreaDefinition,
  year: number,
  propertyType: PropertyType
): number {
  const yearsSince2018 = year - 2018
  const typeMult = PROPERTY_TYPE_MULTIPLIER[propertyType]
  const variation = seededRandom(`${area.area_code}-${year}-${propertyType}`)
  const yearlyVariation = 1 + (variation - 0.5) * 0.04
  const cumulativeGrowth =
    Math.pow(1 + area.growth, yearsSince2018) * yearlyVariation
  return Math.round(area.basePrice * typeMult * cumulativeGrowth)
}

// ---------------------------------------------------------------------------
// Voronoi GeoJSON export (main map layer)
// ---------------------------------------------------------------------------

export interface VoronoiFeature {
  type: 'Feature'
  properties: {
    area_code: string
    name: string
    municipality: string
    id: string
    price_per_sqm_avg: number
  }
  geometry: {
    type: 'Polygon'
    coordinates: number[][][]
  }
}

export interface VoronoiFeatureCollection {
  type: 'FeatureCollection'
  features: VoronoiFeature[]
}

/**
 * Returns a GeoJSON FeatureCollection with Voronoi cells covering the
 * entire terrain. Each cell has an IDW-interpolated price value and is
 * linked to its nearest neighbourhood anchor (for sidebar details).
 */
export function getVoronoiGeoJSON(
  year: number,
  propertyType: PropertyType
): VoronoiFeatureCollection {
  // Build anchor prices per cluster
  const anchorPricesByCluster = new Map<number, AnchorPrice[]>()

  for (let ci = 0; ci < CITY_CLUSTERS.length; ci++) {
    const cluster = CITY_CLUSTERS[ci]
    anchorPricesByCluster.set(
      ci,
      cluster.anchorIndices.map((idx) => ({
        lng: AREA_DEFINITIONS[idx].center[0],
        lat: AREA_DEFINITIONS[idx].center[1],
        price: computeAnchorPrice(AREA_DEFINITIONS[idx], year, propertyType),
      }))
    )
  }

  return {
    type: 'FeatureCollection',
    features: ALL_VORONOI_CELLS.map((cell) => {
      const anchor = AREA_DEFINITIONS[cell.nearestAnchorIdx]
      const anchorPrices = anchorPricesByCluster.get(cell.clusterIdx) ?? []
      const price = idwInterpolate(
        cell.centerLng,
        cell.centerLat,
        anchorPrices
      )

      return {
        type: 'Feature' as const,
        properties: {
          area_code: anchor.area_code,
          name: anchor.name,
          municipality: anchor.municipality,
          id: cell.id,
          price_per_sqm_avg: price,
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: cell.coordinates,
        },
      }
    }),
  }
}

// ---------------------------------------------------------------------------
// Price generation helpers (for sidebar / trend charts)
// ---------------------------------------------------------------------------

function generatePricesForArea(area: AreaDefinition): PriceEstimate[] {
  const prices: PriceEstimate[] = []

  for (const year of YEARS) {
    for (const propertyType of PROPERTY_TYPES) {
      const avgPrice = computeAnchorPrice(area, year, propertyType)
      const variation = seededRandom(`${area.area_code}-${year}-${propertyType}`)
      const medianPrice = Math.round(avgPrice * (0.94 + variation * 0.06))

      const baseTransactions = Math.round(
        (area.population / 200) *
          (propertyType === 'kerrostalo'
            ? 1.5
            : propertyType === 'rivitalo'
              ? 0.8
              : 0.5)
      )
      const transactionVariation =
        0.7 +
        seededRandom(`tx-${area.area_code}-${year}-${propertyType}`) * 0.6
      const transactionCount = Math.max(
        1,
        Math.round(baseTransactions * transactionVariation)
      )

      prices.push({
        area_id: area.area_code,
        year,
        quarter: null,
        price_per_sqm_avg: avgPrice,
        price_per_sqm_median: medianPrice,
        transaction_count: transactionCount,
        property_type: propertyType,
      })
    }
  }

  return prices
}

// ---------------------------------------------------------------------------
// Exported mock datasets (for sidebar stats, trend charts, search)
// ---------------------------------------------------------------------------

export const MOCK_PRICES: PriceEstimate[] =
  AREA_DEFINITIONS.flatMap(generatePricesForArea)

// Building stats helpers
function deriveBuildingAgeBreakdown(avgYear: number) {
  if (avgYear < 1945)
    return { pctPre1960: 65, pct1960_1980: 18, pct1980_2000: 10, pctPost2000: 7 }
  if (avgYear < 1960)
    return { pctPre1960: 48, pct1960_1980: 28, pct1980_2000: 15, pctPost2000: 9 }
  if (avgYear < 1975)
    return { pctPre1960: 18, pct1960_1980: 48, pct1980_2000: 22, pctPost2000: 12 }
  if (avgYear < 1985)
    return { pctPre1960: 10, pct1960_1980: 30, pct1980_2000: 40, pctPost2000: 20 }
  if (avgYear < 1995)
    return { pctPre1960: 5, pct1960_1980: 15, pct1980_2000: 45, pctPost2000: 35 }
  return { pctPre1960: 3, pct1960_1980: 8, pct1980_2000: 30, pctPost2000: 59 }
}

export const MOCK_BUILDINGS: BuildingStats[] = AREA_DEFINITIONS.map((area) => {
  const bd = deriveBuildingAgeBreakdown(area.avgBuildYear)
  return {
    area_id: area.area_code,
    year: 2024,
    buildings_total: area.buildingsTotal,
    avg_building_year: area.avgBuildYear,
    pct_pre_1960: bd.pctPre1960,
    pct_1960_1980: bd.pct1960_1980,
    pct_1980_2000: bd.pct1980_2000,
    pct_post_2000: bd.pctPost2000,
    avg_floor_count: area.avgFloorCount,
  }
})

export const MOCK_DEMOGRAPHICS: DemographicStats[] = AREA_DEFINITIONS.map(
  (area) => ({
    area_id: area.area_code,
    year: 2024,
    population: area.population,
    median_age: area.medianAge,
    pct_under_18: area.pctUnder18,
    pct_18_64: area.pct18_64,
    pct_over_65: area.pctOver65,
    avg_household_size: area.avgHouseholdSize,
  })
)

export const MOCK_WALK_SCORES: Record<string, number> = Object.fromEntries(
  AREA_DEFINITIONS.map((area) => [area.area_code, area.walkScore])
)
