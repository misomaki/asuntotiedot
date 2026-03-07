/**
 * Voronoi tessellation generator for terrain-style price visualization.
 *
 * Takes anchor points (with prices) and generates a dense Voronoi grid
 * with IDW-interpolated prices. Works with both mock and real data.
 *
 * Key rules (from CLAUDE.md):
 * - NO cell outlines — only fill layer
 * - High density for smooth gradient (~15k Helsinki, ~2.7k others)
 * - Renders below basemap features via beforeId="water"
 */

import { Delaunay } from 'd3-delaunay'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VoronoiAnchor {
  area_code: string
  name: string
  municipality: string
  center: [number, number] // [lng, lat]
  price: number
}

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

interface ClusterConfig {
  bbox: [number, number, number, number]
  anchors: VoronoiAnchor[]
  spacingLng: number
  spacingLat: number
}

interface VoronoiCell {
  id: string
  centerLng: number
  centerLat: number
  nearestAnchorIdx: number
  coordinates: number[][][]
}

// ---------------------------------------------------------------------------
// Deterministic pseudo-random (same as mockData.ts)
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
// Default spacing per city (dense enough for smooth gradient)
// ---------------------------------------------------------------------------

const DEFAULT_SPACING: Record<string, { lng: number; lat: number }> = {
  Helsinki: { lng: 0.003, lat: 0.0022 },
  Espoo: { lng: 0.003, lat: 0.0022 },
  Vantaa: { lng: 0.003, lat: 0.0022 },
  Kauniainen: { lng: 0.003, lat: 0.0022 },
  Tampere: { lng: 0.007, lat: 0.005 },
  Turku: { lng: 0.007, lat: 0.005 },
  Oulu: { lng: 0.007, lat: 0.005 },
}

const FALLBACK_SPACING = { lng: 0.007, lat: 0.005 }

// ---------------------------------------------------------------------------
// IDW interpolation
// ---------------------------------------------------------------------------

function idwInterpolate(
  lng: number,
  lat: number,
  anchors: Array<{ lng: number; lat: number; price: number }>,
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
// Cluster detection from anchors
// ---------------------------------------------------------------------------

/**
 * Groups anchors by municipality and creates cluster configs with
 * auto-detected bounding boxes.
 */
function buildClusters(anchors: VoronoiAnchor[]): ClusterConfig[] {
  // Group by municipality (with Helsinki metro merged)
  const helsinkiMetro = new Set(['Helsinki', 'Espoo', 'Vantaa', 'Kauniainen'])
  const groups = new Map<string, VoronoiAnchor[]>()

  for (const a of anchors) {
    const key = helsinkiMetro.has(a.municipality)
      ? 'Helsinki metro'
      : a.municipality
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(a)
  }

  const clusters: ClusterConfig[] = []

  for (const [groupName, groupAnchors] of groups) {
    if (groupAnchors.length === 0) continue

    // Compute bounding box from anchors with padding
    let minLng = Infinity,
      minLat = Infinity,
      maxLng = -Infinity,
      maxLat = -Infinity

    for (const a of groupAnchors) {
      minLng = Math.min(minLng, a.center[0])
      minLat = Math.min(minLat, a.center[1])
      maxLng = Math.max(maxLng, a.center[0])
      maxLat = Math.max(maxLat, a.center[1])
    }

    // Add 15% padding
    const lngPad = (maxLng - minLng) * 0.15 || 0.05
    const latPad = (maxLat - minLat) * 0.15 || 0.03

    // Determine spacing
    const firstMunicipality = groupAnchors[0].municipality
    const spacing =
      DEFAULT_SPACING[firstMunicipality] ??
      (groupName === 'Helsinki metro'
        ? DEFAULT_SPACING['Helsinki']
        : FALLBACK_SPACING)

    clusters.push({
      bbox: [
        minLng - lngPad,
        minLat - latPad,
        maxLng + lngPad,
        maxLat + latPad,
      ],
      anchors: groupAnchors,
      spacingLng: spacing.lng,
      spacingLat: spacing.lat,
    })
  }

  return clusters
}

// ---------------------------------------------------------------------------
// Voronoi cell generation
// ---------------------------------------------------------------------------

function generateClusterCells(
  cluster: ClusterConfig,
  clusterIdx: number
): VoronoiCell[] {
  const [minLng, minLat, maxLng, maxLat] = cluster.bbox
  const points: [number, number][] = []

  // Generate grid points with jitter
  for (let lng = minLng; lng <= maxLng; lng += cluster.spacingLng) {
    for (let lat = minLat; lat <= maxLat; lat += cluster.spacingLat) {
      const jLng =
        (seededRandom(
          `g-${clusterIdx}-${lng.toFixed(4)}-${lat.toFixed(4)}-x`
        ) -
          0.5) *
        cluster.spacingLng *
        0.5
      const jLat =
        (seededRandom(
          `g-${clusterIdx}-${lng.toFixed(4)}-${lat.toFixed(4)}-y`
        ) -
          0.5) *
        cluster.spacingLat *
        0.5
      points.push([lng + jLng, lat + jLat])
    }
  }

  // Add anchor points
  for (const anchor of cluster.anchors) {
    const tooClose = points.some(
      (p) =>
        Math.abs(p[0] - anchor.center[0]) < cluster.spacingLng * 0.3 &&
        Math.abs(p[1] - anchor.center[1]) < cluster.spacingLat * 0.3
    )
    if (!tooClose) {
      points.push([anchor.center[0], anchor.center[1]])
    }
  }

  // Compute Voronoi
  const delaunay = Delaunay.from(points)
  const voronoi = delaunay.voronoi([minLng, minLat, maxLng, maxLat])

  const cells: VoronoiCell[] = []

  for (let i = 0; i < points.length; i++) {
    const cellPolygon = voronoi.cellPolygon(i)
    if (!cellPolygon) continue

    const [pLng, pLat] = points[i]

    // Find nearest anchor
    let nearestIdx = 0
    let nearestDist = Infinity
    for (let ai = 0; ai < cluster.anchors.length; ai++) {
      const a = cluster.anchors[ai]
      const dist = Math.hypot(pLng - a.center[0], pLat - a.center[1])
      if (dist < nearestDist) {
        nearestDist = dist
        nearestIdx = ai
      }
    }

    const ring: number[][] = []
    for (const coord of cellPolygon) {
      ring.push([coord[0], coord[1]])
    }

    cells.push({
      id: `v-${clusterIdx}-${i}`,
      centerLng: pLng,
      centerLat: pLat,
      nearestAnchorIdx: nearestIdx,
      coordinates: [ring],
    })
  }

  return cells
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate a Voronoi GeoJSON FeatureCollection from anchor points.
 *
 * Automatically clusters anchors by municipality, computes bounding boxes,
 * generates dense grid points with IDW-interpolated prices.
 */
export function generateVoronoiGeoJSON(
  anchors: VoronoiAnchor[]
): VoronoiFeatureCollection {
  if (anchors.length === 0) {
    return { type: 'FeatureCollection', features: [] }
  }

  // Filter out anchors with no price (no data for this year/type)
  const validAnchors = anchors.filter((a) => a.price > 0)
  if (validAnchors.length === 0) {
    return { type: 'FeatureCollection', features: [] }
  }

  const clusters = buildClusters(validAnchors)
  const allCells: Array<{ cell: VoronoiCell; cluster: ClusterConfig }> = []

  for (let ci = 0; ci < clusters.length; ci++) {
    const cells = generateClusterCells(clusters[ci], ci)
    for (const cell of cells) {
      allCells.push({ cell, cluster: clusters[ci] })
    }
  }

  return {
    type: 'FeatureCollection',
    features: allCells.map(({ cell, cluster }) => {
      const anchor = cluster.anchors[cell.nearestAnchorIdx]
      const anchorPrices = cluster.anchors.map((a) => ({
        lng: a.center[0],
        lat: a.center[1],
        price: a.price,
      }))

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
