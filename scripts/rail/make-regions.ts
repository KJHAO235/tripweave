import { readFile, writeFile } from 'node:fs/promises'

const USAGE = `用法：node scripts/rail/make-regions.ts <Geofabrik index-v1.json> <輸出檔>

從 Geofabrik 的地區索引挑出一組彼此不重疊、涵蓋全球的地區，依洲分組。
索引下載：https://download.geofabrik.de/index-v1.json`

/** 判斷範圍用的網格大小（度），與鐵路網格相同 */
const CELL_DEG = 0.25
/** 地區有超過這個比例的範圍已被涵蓋時就跳過（例如跨國組合區域、整個國家） */
const SKIP_IF_COVERED = 0.5
/**
 * Geofabrik 的地區邊界刻意往外留了緩衝，相鄰地區會有少量重疊（合併時以 way id 去重）；
 * 超過這個比例才視為真正重複的地區
 */
const OVERLAP_WARNING = 0.3

type Ring = [number, number][]
interface Feature {
  properties: { id: string; parent?: string; urls: { pbf: string } }
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: Ring[] | Ring[][] } | null
}

export interface RegionGroups {
  groups: Record<string, string[]>
}

/** 由下載網址取得 fetch-region.sh 使用的地區路徑，例如 europe/germany/berlin */
export function regionPath(pbfUrl: string): string {
  return pbfUrl.replace('https://download.geofabrik.de/', '').replace(/-latest\.osm\.pbf$/, '')
}

function polygonsOf(geometry: NonNullable<Feature['geometry']>): Ring[][] {
  return geometry.type === 'Polygon' ? [geometry.coordinates as Ring[]] : (geometry.coordinates as Ring[][])
}

/** 偶奇規則，可正確處理有洞的多邊形 */
function contains(rings: Ring[], lon: number, lat: number): boolean {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

const cellKey = (latIdx: number, lonIdx: number) => `${latIdx}/${((lonIdx % 1440) + 1440) % 1440}`

export function cellsOf(geometry: NonNullable<Feature['geometry']>): Set<string> {
  const cells = new Set<string>()
  let sumLon = 0
  let sumLat = 0
  let count = 0
  for (const rings of polygonsOf(geometry)) {
    const outer = rings[0]
    const lons = outer.map(([lon]) => lon)
    const lats = outer.map(([, lat]) => lat)
    outer.forEach(([lon, lat]) => {
      sumLon += lon
      sumLat += lat
      count++
    })
    for (let y = Math.floor(Math.min(...lats) / CELL_DEG); y <= Math.floor(Math.max(...lats) / CELL_DEG); y++) {
      for (let x = Math.floor(Math.min(...lons) / CELL_DEG); x <= Math.floor(Math.max(...lons) / CELL_DEG); x++) {
        if (contains(rings, (x + 0.5) * CELL_DEG, (y + 0.5) * CELL_DEG)) cells.add(cellKey(y, x))
      }
    }
  }
  // 小島等比網格還小的地區，至少以中心點所在的格子代表
  if (cells.size === 0 && count > 0) cells.add(cellKey(Math.floor(sumLat / count / CELL_DEG), Math.floor(sumLon / count / CELL_DEG)))
  return cells
}

export function selectRegions(features: Feature[]): { groups: RegionGroups; overlaps: string[] } {
  const byId = new Map(features.map((f) => [f.properties.id, f]))
  const continentOf = (id: string): string => {
    let current = byId.get(id)!
    while (current.properties.parent) current = byId.get(current.properties.parent)!
    return current.properties.id
  }

  // 只從最底層的地區挑；洲與有子地區的國家範圍含大片海洋，會干擾判斷
  const parents = new Set(features.map((f) => f.properties.parent).filter(Boolean))
  const candidates = features
    .filter((f) => f.geometry && !parents.has(f.properties.id))
    .map((f) => ({ feature: f, cells: cellsOf(f.geometry!) }))
    .sort((a, b) => a.cells.size - b.cells.size || a.feature.properties.id.localeCompare(b.feature.properties.id))

  const owner = new Map<string, string>()
  const groups: Record<string, string[]> = {}
  for (const { feature, cells } of candidates) {
    const covered = [...cells].filter((c) => owner.has(c)).length
    if (covered / cells.size >= SKIP_IF_COVERED) continue
    const id = feature.properties.id
    for (const c of cells) if (!owner.has(c)) owner.set(c, id)
    const continent = continentOf(id)
    ;(groups[continent] ??= []).push(regionPath(feature.properties.urls.pbf))
  }

  // 驗證：被選中的地區與其他地區重疊過多的列出來
  const selected = candidates.filter(({ feature }) =>
    Object.values(groups).some((list) => list.includes(regionPath(feature.properties.urls.pbf))),
  )
  const overlaps: string[] = []
  for (const { feature, cells } of selected) {
    const shared = [...cells].filter((c) => owner.get(c) !== feature.properties.id).length
    if (cells.size > 4 && shared / cells.size > OVERLAP_WARNING) overlaps.push(`${feature.properties.id}（${Math.round((shared / cells.size) * 100)}%）`)
  }
  for (const list of Object.values(groups)) list.sort()
  return { groups: { groups }, overlaps }
}

async function main(argv: string[]) {
  if (argv.length < 2 || argv.includes('--help')) {
    console.log(USAGE)
    return
  }
  const index = JSON.parse(await readFile(argv[0], 'utf8')) as { features: Feature[] }
  const { groups, overlaps } = selectRegions(index.features)
  await writeFile(argv[1], JSON.stringify(groups, null, 2) + '\n')
  for (const [continent, list] of Object.entries(groups.groups)) console.log(`${continent}：${list.length} 個地區`)
  console.log(`共 ${Object.values(groups.groups).flat().length} 個地區；重疊超過 ${OVERLAP_WARNING * 100}% 的：${overlaps.length ? overlaps.join('、') : '無'}`)
}

if (import.meta.main) await main(process.argv.slice(2))
