/**
 * Shared helpers for the current StatFin PxWeb API.
 *
 * The API changed in 2026: table metadata is served at the short id
 * (`.../ashi/13mx.px`), and query variable codes are technical ids such as
 * `kunta_1_20150101` rather than the display text ("Kunta"). These helpers
 * resolve codes from the metadata so scripts do not hardcode them.
 */

import { queryPxWeb, parseJsonStat2, type PxWebQuery } from './pxwebClient'

export const STATFIN_ASHI_BASE = 'https://pxdata.stat.fi/PXWeb/api/v1/fi/StatFin/ashi'

export interface PxVariable {
  code: string
  text: string
  values: string[]
  valueTexts: string[]
}

export interface PxTableMeta {
  title: string
  variables: PxVariable[]
}

export async function fetchTableMeta(tableId: string): Promise<PxTableMeta> {
  const url = `${STATFIN_ASHI_BASE}/${tableId}.px`
  const res = await fetch(url, { headers: { 'User-Agent': 'neliohinnat.fi data import' } })
  if (!res.ok) throw new Error(`PxWeb metadata error ${res.status} for ${tableId}`)
  return (await res.json()) as PxTableMeta
}

/** Find a variable by its display text (case-insensitive), e.g. "Kunta". */
export function variableByText(meta: PxTableMeta, text: string): PxVariable {
  const v = meta.variables.find((x) => x.text.toLowerCase() === text.toLowerCase())
  if (!v) {
    throw new Error(
      `Variable "${text}" not found in ${meta.title}. Available: ${meta.variables.map((x) => x.text).join(', ')}`
    )
  }
  return v
}

/** Run a query against a table and return flat rows keyed by variable code. */
export async function queryTable(
  tableId: string,
  selections: Array<{ code: string; values: string[] }>
): Promise<Array<Record<string, string | number | null>>> {
  const query: PxWebQuery = {
    query: selections.map((s) => ({
      code: s.code,
      selection: { filter: 'item', values: s.values },
    })),
    response: { format: 'json-stat2' },
  }
  const data = await queryPxWeb(`${STATFIN_ASHI_BASE}/${tableId}.px`, query)
  return parseJsonStat2(data)
}

/**
 * Kunta code → maakunta code ('MK01' … 'MK19') from the Statistics Finland
 * correspondence table. Returns an empty map on failure (callers fall back
 * to the national index 'ksu').
 */
export async function fetchKuntaToMaakunta(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  for (const year of ['20250101', '20240101']) {
    const url = `https://data.stat.fi/api/classifications/v2/correspondenceTables/kunta_1_${year}%23maakunta_1_${year}/maps?content=data&format=json`
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const rows = (await res.json()) as Array<{ sourceLocalId: string; targetLocalId: string }>
      for (const r of rows) {
        const kunta = r.sourceLocalId.split('/').pop()
        const mk = r.targetLocalId.split('/').pop()
        if (kunta && mk) map.set(kunta, `MK${mk}`)
      }
      if (map.size > 0) return map
    } catch (err) {
      console.warn(`  kunta→maakunta (${year}) failed: ${(err as Error).message}`)
    }
  }
  return map
}
